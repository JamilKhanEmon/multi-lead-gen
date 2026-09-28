import re
import uuid
import json
import httpx
from datetime import datetime, time
from typing import Dict, Any, List, Optional, Tuple
from app.core.config import settings
from app.core.logging import logger


class VoiceAgentService:
    """Core dialogue and conversational engine for Outbound Sales Voice Agent."""

    @classmethod
    def sanitize_exact_problem(cls, problem: Optional[str], company_name: Optional[str] = None) -> str:
        """
        Cleans and transforms raw audit triage messages into a punchy client pain point.
        Prevents robotic or internal qualification notes from leaking into live calls.
        """
        if not problem or not problem.strip():
            return "high buyer lead conversion and pipeline delays"

        lower = problem.lower().strip()
        negative_markers = [
            "do not align", "not align", "identified issues", "agency service", "capabilities",
            "unqualified", "reject", "triage", "insufficient", "lacks capability", "no website"
        ]

        if any(marker in lower for marker in negative_markers):
            comp_lower = (company_name or "").lower()
            if any(term in comp_lower for term in ["developer", "real estate", "property", "holding", "builder"]):
                return "missed high-net-worth buyer inquiries and slow sales turnaround"
            elif any(term in comp_lower for term in ["tech", "software", "solution", "it"]):
                return "enterprise customer acquisition bottlenecks and long deal cycles"
            else:
                return "inbound customer conversion bottlenecks and manual sales follow-up"

        # Trim overly long strings to prevent run-on sentences in voice synthesis
        if len(problem) > 65:
            return problem[:60].rstrip() + " bottlenecks"

        return problem.strip()

    @classmethod
    def render_prompt_template(cls, template: str, variables: Dict[str, str]) -> str:
        """Replaces {{variable}} placeholders with real client and service values."""
        rendered = template
        for key, val in variables.items():
            pattern = re.compile(r"\{\{\s*" + re.escape(key) + r"\s*\}\}", re.IGNORECASE)
            rendered = pattern.sub(str(val or ""), rendered)
        return rendered

    @classmethod
    def is_within_office_hours(cls, start_time_str: str = "10:00", end_time_str: str = "18:00") -> Tuple[bool, str]:
        """
        Validates whether current system local time is within business calling hours.
        Returns (is_allowed, reason_or_status_message).
        """
        try:
            now = datetime.now().time()
            start_parts = [int(p) for p in start_time_str.split(":")]
            end_parts = [int(p) for p in end_time_str.split(":")]
            start_t = time(start_parts[0], start_parts[1])
            end_t = time(end_parts[0], end_parts[1])

            if start_t <= now <= end_t:
                return True, f"Active Office Hours ({start_time_str} - {end_time_str})"
            else:
                return False, f"Outside Office Hours ({start_time_str} - {end_time_str}). Local time is {now.strftime('%H:%M')}."
        except Exception as e:
            logger.warning(f"Office hours check error: {e}")
            return True, "Office hours check bypassed"

    @classmethod
    def generate_meeting_link(cls, platform: str = "Google Meet", company_name: str = "b2b") -> str:
        """Generates a realistic, dedicated meeting room link."""
        slug = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())[:8] or "demo"
        code = uuid.uuid4().hex[:6]
        
        if "zoom" in platform.lower():
            meeting_id = f"8{uuid.uuid4().int % 900000000 + 100000000}"
            return f"https://zoom.us/j/{meeting_id}?pwd=demo{code}"
        else:
            # Google Meet style: meet.google.com/xxx-yyyy-zzz
            part1 = uuid.uuid4().hex[:3]
            part2 = uuid.uuid4().hex[3:7]
            part3 = uuid.uuid4().hex[7:10]
            return f"https://meet.google.com/{part1}-{part2}-{part3}"

    @classmethod
    def detect_meeting_agreement(cls, user_text: str) -> Tuple[bool, Optional[str]]:
        """
        Detects if the lead agreed on a meeting date/time or gave a positive signal.
        Supports spoken variants, typos, and common Bengali/English affirmative phrasing.
        """
        lower = user_text.lower().strip()

        # Specific time slot indicators
        time_matches = [
            "tomorrow", "11 am", "3 pm", "morning", "afternoon", "friday", "monday", "tuesday", 
            "wednesday", "thursday", "weekend", "2 pm", "4 pm", "10 am", "next week",
            "কাল", "পরশু", "সকাল", "বিকাল", "৩টা", "১১টা", "পারব", "সমস্যা নেই", "পাঠিয়ে দাও"
        ]

        # Explicit affirmative indicators (including colloquial "yeah", "available at this time", etc.)
        direct_agreement_phrases = [
            "available at this time", "available at that time", "i am available", "i'm available",
            "mom available", "i am free", "i'm free", "that works", "works for me", "works for us",
            "this time works", "that time works", "anytime works", "let's do it", "lets do it",
            "sounds good to me", "sounds good", "lock it in", "book it", "send the link", "send link",
            "share the link", "send invite", "send meet link", "send zoom link",
            "পারব", "সমস্যা নেই", "পাঠিয়ে দিন", "পাঠিয়ে দাও", "আচ্ছা পাঠান", "ঠিক আছে পাঠান"
        ]

        # Individual agreement keywords
        agreement_words = [
            "yes", "yeah", "yep", "yup", "sure", "okay", "ok", "fine", "agree", "perfect",
            "হাঁ", "আচ্ছা", "ঠিক আছে", "দেখা যাক"
        ]

        has_direct_phrase = any(phrase in lower for phrase in direct_agreement_phrases)
        has_time = any(t in lower for t in time_matches)
        has_single_agreement = any(re.search(r'\b' + re.escape(w) + r'\b', lower) for w in agreement_words)

        # Trigger if: direct agreement phrase, or explicit time indicator, or affirmative word + context
        if has_direct_phrase or has_time or (has_single_agreement and any(k in lower for k in ["link", "meet", "zoom", "call", "time", "demo", "available", "good"])):
            slot = "Tomorrow at 11:00 AM"
            if "3 pm" in lower or "3:00" in lower or "afternoon" in lower or "বিকাল" in lower:
                slot = "Tomorrow at 3:00 PM"
            elif "11" in lower or "morning" in lower or "সকাল" in lower:
                slot = "Tomorrow at 11:00 AM"
            elif "friday" in lower or "শুক্রবার" in lower:
                slot = "Friday at 3:00 PM"
            elif "monday" in lower:
                slot = "Monday at 11:00 AM"
            elif "4" in lower:
                slot = "Tomorrow at 4:00 PM"
            elif "2" in lower:
                slot = "Tomorrow at 2:00 PM"
            return True, slot

        return False, None

    @classmethod
    def find_objection_counter(cls, user_text: str, objections_list: List[Dict[str, str]], company_name: str = "") -> Optional[str]:
        """Checks if the user speech matches a known objection pattern or service inquiry."""
        lower = user_text.lower().strip()

        # 1. Custom KB Objections
        for obj in objections_list:
            trigger = obj.get("trigger", "").lower().strip()
            counter = obj.get("counter", "").strip()
            if trigger and trigger in lower and counter:
                return counter

        # 2. Service List / Capabilities Inquiry ("What is your service list?", "What do you do?")
        service_queries = [
            "service list", "services list", "what services", "what service", "what do you do",
            "what does your company do", "tell me what you do", "share with me what", "explain your service",
            "how do you help", "কি কাজ করেন", "সার্ভিস কি"
        ]
        if any(sq in lower for sq in service_queries):
            return f"We build automated client acquisition and high-yield buyer qualification systems for {company_name or 'enterprises'}. Can I show you a 5-minute live preview tomorrow at 11 AM?"

        # 3. Busy Objection Handling (MUST NOT match generic "time" alone)
        busy_patterns = [
            "busy right now", "very busy", "too busy", "no time", "don't have time", "dont have time",
            "not right now", "call back later", "call me later", "driving", "in a meeting", "bad time",
            "ব্যস্ত", "সময় নেই", "পরে কল করুন"
        ]
        if any(bp in lower for bp in busy_patterns):
            return "I understand completely! That's why I only need 10 minutes on Zoom. Does tomorrow 11 AM or 3 PM work?"

        # 4. Pricing / Cost Objection
        if any(w in lower for w in ["price", "cost", "how much", "expensive", "দাম", "কত টাকা"]):
            return "Our initial implementation is 100% risk-free with zero upfront cost. Can we review the breakdown tomorrow at 3 PM?"

        # 5. Already Have Vendor / Internal Team
        if any(w in lower for w in ["already have", "another company", "vendor", "agency", "internal team", "আছে"]):
            return "Understood! Most clients use us as a complementary audit with zero downtime. Can I show you a 5-minute comparison?"

        # 6. Send Email / Info via WhatsApp
        if any(w in lower for w in ["send email", "email me", "send info", "send details", "ইমেইল"]):
            return "Sending the executive brief right away! Can we tentatively pencil in 10 minutes for Friday while you review?"

        return None

    @classmethod
    async def process_dialogue_turn(
        cls,
        user_speech_text: str,
        kb: Any,
        queue_item: Optional[Any] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        override_client_name: Optional[str] = None,
        override_company_name: Optional[str] = None,
        override_exact_problem: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes one conversational dialogue turn with ultra-low latency.
        Strictly enforces:
        1. Short response (<18 words)
        2. Injects client problem & company
        3. Detects meeting booking and generates Zoom/Meet link
        """
        raw_company_name = override_company_name or (queue_item.company_name if queue_item else "Your Enterprise")
        client_name = override_client_name or (queue_item.contact_person if queue_item else "Business Leader")
        raw_problem = override_exact_problem or (queue_item.exact_problem if queue_item else None)
        
        # Clean problem to prevent raw triage errors from leaking into speech
        exact_problem = cls.sanitize_exact_problem(raw_problem, raw_company_name)
        company_name = raw_company_name.strip()
        meeting_platform = getattr(kb, "meeting_platform", "Google Meet")

        # 1. Check if client agreed on a meeting slot!
        agreed, slot = cls.detect_meeting_agreement(user_speech_text)
        if agreed:
            meeting_link = cls.generate_meeting_link(platform=meeting_platform, company_name=company_name)
            meeting_time = slot or "Tomorrow at 11:00 AM"
            
            agent_reply = f"Awesome! Locked in for {meeting_time}. I'm dispatching the {meeting_platform} link to your WhatsApp right now. Talk to you then, {client_name}!"
            return {
                "agent_reply_text": agent_reply,
                "meeting_booked": True,
                "meeting_link": meeting_link,
                "meeting_time": meeting_time,
                "detected_intent": "MEETING_CONFIRMED",
            }

        # 2. Check for objection handling or service inquiry match
        objections = getattr(kb, "objections_json", []) or []
        counter = cls.find_objection_counter(user_speech_text, objections, company_name=company_name)
        if counter:
            return {
                "agent_reply_text": counter,
                "meeting_booked": False,
                "meeting_link": None,
                "meeting_time": None,
                "detected_intent": "OBJECTION_HANDLED",
            }

        # 3. Dynamic context-aware LLM dialogue generation (Plain-text streaming with low latency)
        prompt_variables = {
            "client_name": client_name,
            "company_name": company_name,
            "exact_problem": exact_problem,
            "my_company": getattr(kb, "company_name", "Apex AI"),
            "agent_persona_name": getattr(kb, "agent_persona_name", "Jamil"),
            "core_offer": getattr(kb, "core_offer", "Free 14-Day Pilot"),
            "service_name": getattr(kb, "service_name", "Enterprise Automation"),
        }

        system_instruction = (
            f"You are {prompt_variables['agent_persona_name']}, a high-performing outbound B2B voice specialist calling {client_name} at {company_name}. "
            f"Your goal is to solve their {exact_problem} and secure a 10-minute demo. "
            "CRITICAL: Keep your response under 16 words. Be conversational, direct, and ask if tomorrow 11 AM or 3 PM works."
        )

        ollama_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
        messages = [
            {"role": "system", "content": system_instruction},
        ]

        if conversation_history:
            for turn in conversation_history[-3:]:
                role = "assistant" if turn.get("speaker") == "agent" else "user"
                messages.append({"role": role, "content": turn.get("text", "")})

        messages.append({"role": "user", "content": user_speech_text})

        clean_reply = ""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(
                    ollama_url,
                    json={
                        "model": settings.OLLAMA_MODEL or "qwen2.5:7b",
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": 0.6,
                            "num_predict": 40,
                        },
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    content = data.get("message", {}).get("content", "").strip()
                    # Strip any markdown formatting or quotes
                    clean_reply = re.sub(r'[\{\}\[\]"\'`]', '', content).strip()
        except Exception as e:
            logger.debug(f"Fast LLM chat fallback triggered: {e}")

        # Fallback if LLM is slow or empty
        if not clean_reply or len(clean_reply.split()) < 3:
            clean_reply = f"We resolve {exact_problem} with zero upfront risk. Does tomorrow 11 AM or 3 PM work for a brief 10-minute Zoom?"

        # Strict word cap (<18 words)
        words = clean_reply.split()
        if len(words) > 18:
            clean_reply = " ".join(words[:16]) + "?"

        return {
            "agent_reply_text": clean_reply,
            "meeting_booked": False,
            "meeting_link": None,
            "meeting_time": None,
            "detected_intent": "PITCH_AND_PIVOT",
        }
