import re
import uuid
import json
import base64
import httpx
from datetime import datetime, time, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logging import logger
from app.models.lead import Lead
from app.models.business import Business
from app.models.voice_agent import VoiceKnowledgeBase, VoiceCallQueueItem, VoiceCallLog, DEFAULT_COUNTRY_LANGUAGE_MAP
from app.services.elevenlabs_service import ElevenLabsService

class VoiceAgentService:

    @classmethod
    def sanitize_exact_problem(cls, problem: Optional[str], company_name: Optional[str] = None) -> str:
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

        if len(problem) > 65:
            return problem[:60].rstrip() + " bottlenecks"

        return problem.strip()

    @classmethod
    def render_prompt_template(cls, template: str, variables: Dict[str, str]) -> str:
        rendered = template
        for key, val in variables.items():
            pattern = re.compile(r"\{\{\s*" + re.escape(key) + r"\s*\}\}", re.IGNORECASE)
            rendered = pattern.sub(str(val or ""), rendered)
        return rendered

    @classmethod
    def is_within_office_hours(cls, start_time_str: str = "10:00", end_time_str: str = "18:00") -> Tuple[bool, str]:
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
        slug = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())[:8] or "demo"
        code = uuid.uuid4().hex[:6]
        
        if "zoom" in platform.lower():
            meeting_id = f"8{uuid.uuid4().int % 900000000 + 100000000}"
            return f"https://zoom.us/j/{meeting_id}?pwd=demo{code}"
        else:
            part1 = uuid.uuid4().hex[:3]
            part2 = uuid.uuid4().hex[3:7]
            part3 = uuid.uuid4().hex[7:10]
            return f"https://meet.google.com/{part1}-{part2}-{part3}"

    @classmethod
    def detect_meeting_agreement(cls, user_text: str) -> Tuple[bool, Optional[str]]:
        lower = user_text.lower().strip()

        time_matches = [
            "tomorrow", "11 am", "3 pm", "morning", "afternoon", "friday", "monday", "tuesday", 
            "wednesday", "thursday", "weekend", "2 pm", "4 pm", "10 am", "next week",
            "কাল", "পরশু", "সকাল", "বিকাল", "৩টা", "১১টা", "পারব", "সমস্যা নেই", "পাঠিয়ে দাও"
        ]

        direct_agreement_phrases = [
            "available at this time", "available at that time", "i am available", "i'm available",
            "i am free", "i'm free", "that works", "works for me", "works for us",
            "this time works", "that time works", "anytime works", "let's do it", "lets do it",
            "sounds good to me", "sounds good", "lock it in", "book it", "send the link", "send link",
            "share the link", "send invite", "send meet link", "send zoom link",
            "পারব", "সমস্যা নেই", "পাঠিয়ে দিন", "পাঠিয়ে দাও", "আচ্ছা পাঠান", "ঠিক আছে পাঠান", "দেখা যাক"
        ]

        agreement_words = [
            "yes", "yeah", "yep", "yup", "sure", "okay", "ok", "fine", "agree", "perfect",
            "হাঁ", "আচ্ছা", "ঠিক আছে", "দেখা যাক", "হুম"
        ]

        has_direct_phrase = any(phrase in lower for phrase in direct_agreement_phrases)
        has_time = any(t in lower for t in time_matches)
        has_single_agreement = any(re.search(r'\b' + re.escape(w) + r'\b', lower) for w in agreement_words)

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
    def find_objection_counter(cls, user_text: str, objections_list: List[Dict[str, str]], language: str = "Bengali", company_name: str = "") -> Optional[str]:
        lower = user_text.lower().strip()

        for obj in objections_list:
            trigger = obj.get("trigger", "").lower().strip()
            counter = obj.get("counter", "").strip()
            if trigger and trigger in lower and counter:
                return counter

        is_bn = language.lower() in ["bengali", "bangla"]

        # 1. Busy objection
        busy_patterns = [
            "busy right now", "very busy", "too busy", "no time", "don't have time", "dont have time",
            "not right now", "call back later", "call me later", "driving", "in a meeting", "bad time",
            "ব্যস্ত", "সময় নেই", "পরে কল করুন", "পরে কথা বলি"
        ]
        if any(bp in lower for bp in busy_patterns):
            if is_bn:
                return "আমি সম্পূর্ণ বুঝতে পারছি! এজন্যই মাত্র ১০ মিনিটের গুগল মিট কলে সমাধান দেখাব। কাল সকাল ১১টায় নাকি বিকাল ৩টায় আপনার সুবিধা?"
            return "I understand completely! That's why I only need 10 minutes on Zoom. Does tomorrow 11 AM or 3 PM work better for you?"

        # 2. Price objection
        if any(w in lower for w in ["price", "cost", "how much", "expensive", "দাম", "কত টাকা", "খরচ"]):
            if is_bn:
                return "আমাদের প্রাথমিক টেস্ট সম্পূর্ণ রিস্ক-ফ্রি, কোনো অগ্রিম চার্জ ছাড়াই। কাল বিকাল ৩টায় বিস্তারিত রিভিউ করতে পারি?"
            return "Our initial implementation is 100% risk-free with zero upfront cost. Can we review the breakdown tomorrow at 3 PM?"

        # 3. Already have provider
        if any(w in lower for w in ["already have", "another company", "vendor", "agency", "internal team", "আছে", "ডেভেলপার আছে"]):
            if is_bn:
                return "চমৎকার! বেশিরভাগ ক্লায়েন্ট আমাদের অডিট লেয়ার ব্যবহার করে কোনো ডাউনটাইম ছাড়াই। মাত্র ৫ মিনিটের একটা কম্প্যারিজন কি কাল দেখানো সম্ভব?"
            return "Understood! Most clients use us as a complementary audit with zero downtime. Can I show you a 5-minute comparison?"

        # 4. Send email
        if any(w in lower for w in ["send email", "email me", "send info", "send details", "ইমেইল", "মেইল"]):
            if is_bn:
                return "অবশ্যই, আমি এক্সিকিউটিভ সামারি পাঠিয়ে দিচ্ছি! আপনি দেখার ফাঁকে কি শুক্রবার ১০ মিনিটের জন্য একটা কুইক স্লট রেখে দেব?"
            return "Sending the executive brief right away! Can we tentatively pencil in 10 minutes for Friday while you review?"

        return None

    @classmethod
    async def sync_leads_from_card_1(cls, db: AsyncSession) -> int:
        """Pulls verified discovered leads from Card 1 (leads table) and populates the Voice Call Queue."""
        stmt = (
            select(Lead)
            .options(selectinload(Lead.business).selectinload(Business.locations))
            .where(Lead.is_qualified == True)
            .order_by(desc(Lead.created_at))
            .limit(100)
        )
        res = await db.execute(stmt)
        leads = res.scalars().all()

        synced_count = 0
        for lead in leads:
            biz = lead.business
            if not biz or not biz.phone or not biz.phone.strip():
                continue

            phone = biz.phone.strip()

            # Check if phone already in queue
            q_stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.phone == phone).limit(1)
            q_res = await db.execute(q_stmt)
            existing = q_res.scalar_one_or_none()
            if existing:
                continue

            meta = biz.metadata_json or {}
            loc = biz.locations[0] if (biz.locations and len(biz.locations) > 0) else None
            country = loc.country if loc and loc.country else (meta.get("country") or "Bangladesh")
            
            # Map country to language
            lang = DEFAULT_COUNTRY_LANGUAGE_MAP.get(country, "English")
            if any(k in country.lower() for k in ["bangla", "bd", "dhaka"]):
                lang = "Bengali"
            elif any(k in country.lower() for k in ["arab", "uae", "saudi", "dubai", "qatar"]):
                lang = "Arabic"

            raw_problem = lead.what_they_need or lead.why_they_need_us or lead.primary_gap_summary or "Website lacks click-to-contact and fast lead conversion"
            clean_problem = cls.sanitize_exact_problem(raw_problem, biz.canonical_name)

            queue_item = VoiceCallQueueItem(
                lead_id=lead.id,
                contact_person=biz.contact_person or "Decision Maker",
                contact_title=biz.contact_title or "Owner / Executive",
                company_name=biz.canonical_name,
                phone=phone,
                country=country,
                language=lang,
                exact_problem=clean_problem,
                status="READY",
                selected_for_call=True,
            )
            db.add(queue_item)
            synced_count += 1

        if synced_count > 0:
            await db.commit()
            logger.info(f"[VoiceAgentService] Successfully synced {synced_count} qualified leads from Card 1 into Call Queue.")

        return synced_count

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
        override_language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Processes a speech turn, handles objections or meeting scheduling, and generates ElevenLabs audio."""
        raw_company_name = override_company_name or (queue_item.company_name if queue_item else "Your Enterprise")
        client_name = override_client_name or (queue_item.contact_person if queue_item else "Business Leader")
        raw_problem = override_exact_problem or (queue_item.exact_problem if queue_item else None)
        language = override_language or (queue_item.language if queue_item else "Bengali")
        
        exact_problem = cls.sanitize_exact_problem(raw_problem, raw_company_name)
        company_name = raw_company_name.strip()
        meeting_platform = getattr(kb, "meeting_platform", "Google Meet")
        is_bn = language.lower() in ["bengali", "bangla"]

        # 1. Detect Meeting Agreement
        agreed, slot = cls.detect_meeting_agreement(user_speech_text)
        if agreed:
            meeting_link = cls.generate_meeting_link(platform=meeting_platform, company_name=company_name)
            meeting_time = slot or "Tomorrow at 11:00 AM"
            
            if is_bn:
                agent_reply = f"অসাধারণ! {meeting_time}-এ শিডিউল ফাইনাল হলো। আমি এখনই আপনার হোয়াটসঅ্যাপে {meeting_platform}-এর লিংক পাঠিয়ে দিচ্ছি। ভালো থাকবেন, {client_name} সাহেব!"
            else:
                agent_reply = f"Awesome! Locked in for {meeting_time}. I'm dispatching the {meeting_platform} link to your WhatsApp right now. Talk to you then, {client_name}!"
            
            audio_bytes = await cls._generate_elevenlabs_audio_if_available(kb, agent_reply)
            return {
                "agent_reply_text": agent_reply,
                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else None,
                "meeting_booked": True,
                "meeting_link": meeting_link,
                "meeting_time": meeting_time,
                "detected_intent": "MEETING_CONFIRMED",
                "language": language,
            }

        # 2. Check Objection Counter
        objections = getattr(kb, "objections_json", []) or []
        counter = cls.find_objection_counter(user_speech_text, objections, language=language, company_name=company_name)
        if counter:
            audio_bytes = await cls._generate_elevenlabs_audio_if_available(kb, counter)
            return {
                "agent_reply_text": counter,
                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else None,
                "meeting_booked": False,
                "meeting_link": None,
                "meeting_time": None,
                "detected_intent": "OBJECTION_HANDLED",
                "language": language,
            }

        # 3. LLM Reasoning for Custom Dialogue
        lang_instruction = "Speak in natural, polite Bengali (বাংলা)." if is_bn else f"Speak in fluent, professional {language}."
        system_instruction = (
            f"You are {getattr(kb, 'agent_persona_name', 'Alex')}, an elite B2B sales advisor calling {client_name} at {company_name}. "
            f"Their identified flaw is: '{exact_problem}'. Core solution: '{getattr(kb, 'core_offer', 'risk-free trial')}'. "
            f"LANGUAGE: {lang_instruction} "
            "CRITICAL: Keep your response STRICTLY under 18 words (max 8 seconds of speech). Be warm, direct, and ask if tomorrow 11 AM or 3 PM works."
        )

        clean_reply = await cls._generate_llm_reply(system_instruction, conversation_history, user_speech_text)
        if not clean_reply or len(clean_reply.split()) < 3:
            if is_bn:
                clean_reply = f"আমরা কোনো অগ্রিম চার্জ ছাড়াই {exact_problem} সমাধান করি। কাল সকাল ১১টায় কি ১০ মিনিট সময় দেওয়া সম্ভব?"
            else:
                clean_reply = f"We resolve {exact_problem} with zero upfront risk. Does tomorrow 11 AM or 3 PM work for a brief 10-minute demo?"

        audio_bytes = await cls._generate_elevenlabs_audio_if_available(kb, clean_reply)

        return {
            "agent_reply_text": clean_reply,
            "audio_base64": base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else None,
            "meeting_booked": False,
            "meeting_link": None,
            "meeting_time": None,
            "detected_intent": "PITCH_AND_PIVOT",
            "language": language,
        }

    @classmethod
    async def _generate_llm_reply(cls, system_prompt: str, history: Optional[List[Dict[str, str]]], user_text: str) -> str:
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for turn in history[-4:]:
                role = "assistant" if turn.get("speaker") in ["agent", "AI"] else "user"
                messages.append({"role": role, "content": turn.get("text", "")})
        messages.append({"role": "user", "content": user_text})

        # Try OpenClaw Cloud Gateway
        if settings.OPENCLAW_GATEWAY_URL and not any(loc in settings.OPENCLAW_GATEWAY_URL for loc in ["127.0.0.1", "localhost"]):
            gw_base = settings.OPENCLAW_GATEWAY_URL.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
            gw_url = f"{gw_base}/v1/chat/completions"
            gw_headers = {
                "Authorization": f"Bearer {settings.OPENCLAW_GATEWAY_TOKEN}",
                "Content-Type": "application/json",
                "x-openclaw-session": "voice_outreach",
            }
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.post(
                        gw_url,
                        json={
                            "model": "default",
                            "messages": messages,
                            "temperature": 0.4,
                            "max_tokens": 50,
                        },
                        headers=gw_headers,
                    )
                    if resp.status_code == 200:
                        content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                        return re.sub(r'[\{\}\[\]"\'`]', '', content).strip()
            except Exception as e:
                logger.debug(f"[VoiceAgentService] OpenClaw notice: {e}")
        return ""

    @classmethod
    async def _generate_elevenlabs_audio_if_available(cls, kb: Any, text: str) -> Optional[bytes]:
        """Synthesize audio using ElevenLabs cloned or premade voice if configured."""
        try:
            api_key = getattr(kb, "elevenlabs_api_key", None)
            voice_id = getattr(kb, "cloned_voice_id", None) or getattr(kb, "elevenlabs_voice_id", "21m00Tcm4TlvDq8ikWAM")
            model_id = getattr(kb, "elevenlabs_model_id", "eleven_multilingual_v2")

            audio = await ElevenLabsService.synthesize_speech(
                text=text,
                voice_id=voice_id,
                explicit_key=api_key,
                model_id=model_id,
            )
            return audio
        except Exception as e:
            logger.debug(f"[VoiceAgentService] ElevenLabs synthesis notice: {e}")
            return None
