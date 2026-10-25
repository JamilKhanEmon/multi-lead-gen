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
    def generate_meeting_link(cls, platform: str = "", company_name: str = "") -> Optional[str]:
        """Returns None. Zero fake or dummy meeting links are generated."""
        return None

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
        """Matches user objection dynamically against admin-configured objections in Knowledge Base."""
        lower = user_text.lower().strip()

        for obj in (objections_list or []):
            trigger = obj.get("trigger", "").lower().strip()
            counter = obj.get("counter", "").strip()
            if trigger and trigger in lower and counter:
                return counter

        return None

    @classmethod
    def resolve_country_and_language_waterfall(
        cls,
        phone: str,
        location_country: Optional[str] = None,
        search_metadata: Optional[Dict[str, Any]] = None,
        custom_country_map: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, str]:
        """
        Multi-Signal Waterfall Resolution:
        - Signal 1 (Phone Prefix): Matches international dialing codes (+880, +971, +1, +44, etc.).
        - Signal 2 (Search / Location Data): If phone has no country code (landline/local),
          resolves from discovery search location / Google Places country metadata.
        - Signal 3 (Live Call Fallback): Fallback to Global / English, adapted live by conversational ASR.
        """
        country_map = custom_country_map or DEFAULT_COUNTRY_LANGUAGE_MAP
        clean_phone = re.sub(r'[\s\-\(\)\.]', '', phone or "").strip()

        # Signal 1: Phone Country Dialing Code Prefix
        phone_prefix_map = {
            "+880": ("Bangladesh", "Bengali"),
            "880": ("Bangladesh", "Bengali"),
            "+971": ("United Arab Emirates", "Arabic"),
            "+966": ("Saudi Arabia", "Arabic"),
            "+974": ("Qatar", "Arabic"),
            "+965": ("Kuwait", "Arabic"),
            "+968": ("Oman", "Arabic"),
            "+973": ("Bahrain", "Arabic"),
            "+1": ("United States", "English"),
            "+44": ("United Kingdom", "English"),
            "+61": ("Australia", "English"),
            "+34": ("Spain", "Spanish"),
            "+49": ("Germany", "German"),
            "+33": ("France", "French"),
        }
        for prefix, (p_country, p_lang) in phone_prefix_map.items():
            if clean_phone.startswith(prefix):
                return p_country, p_lang

        # Signal 2: Search & Location Data from Google Places / Discovery Scraper
        target_country = location_country or (search_metadata or {}).get("country") or (search_metadata or {}).get("search_country")
        if target_country and target_country.strip():
            norm = target_country.strip()
            if norm in country_map:
                return norm, country_map[norm]
            for c_name, c_lang in country_map.items():
                if c_name.lower() in norm.lower() or norm.lower() in c_name.lower():
                    return c_name, c_lang

        # Signal 3: Default Initial Fallback (Adapted dynamically on live call)
        return "Global", "English"

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
            loc_country = loc.country if loc and loc.country else (meta.get("country") or meta.get("search_country"))

            # Multi-Signal Waterfall Resolution
            country, lang = cls.resolve_country_and_language_waterfall(
                phone=phone,
                location_country=loc_country,
                search_metadata=meta,
            )

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
    def find_faq_kb_match(cls, user_text: str, faq_kb_list: List[Dict[str, Any]], variables: Dict[str, str]) -> Optional[str]:
        """Matches user speech against admin-defined dynamic Knowledge Base questions and triggers."""
        lower = user_text.lower().strip()
        for item in faq_kb_list:
            if not item.get("active", True):
                continue

            triggers_str = item.get("triggers", "")
            triggers = [t.strip().lower() for t in triggers_str.split(",") if t.strip()]
            q_text = item.get("question", "").lower().strip()

            matched = False
            for trig in triggers:
                if trig and (trig in lower or re.search(r'\b' + re.escape(trig) + r'\b', lower)):
                    matched = True
                    break

            if not matched and q_text and len(q_text) > 4 and q_text in lower:
                matched = True

            if matched:
                raw_answer = item.get("answer", "")
                return cls.render_prompt_template(raw_answer, variables)
        return None

    @classmethod
    def find_next_script_question(
        cls,
        script_questions: List[Dict[str, Any]],
        history: Optional[List[Dict[str, str]]],
        variables: Dict[str, str]
    ) -> Optional[str]:
        """Progressively picks the next admin-defined script step based on dialogue turn count."""
        if not script_questions:
            return None
        active_steps = [q for q in script_questions if q.get("active", True)]
        if not active_steps:
            return None

        # Sort by step number
        active_steps.sort(key=lambda s: s.get("step", 1))

        # Count turns where lead spoke
        user_turns = len([h for h in (history or []) if h.get("speaker") in ["lead", "user"]])
        target_idx = min(user_turns, len(active_steps) - 1)
        chosen = active_steps[target_idx]
        raw_q = chosen.get("question", "")
        return cls.render_prompt_template(raw_q, variables)

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
        """Processes a speech turn, checks dynamic KB & script flow, and generates ElevenLabs audio."""
        raw_company_name = override_company_name or (queue_item.company_name if queue_item else "Your Enterprise")
        client_name = override_client_name or (queue_item.contact_person if queue_item else "Business Leader")
        raw_problem = override_exact_problem or (queue_item.exact_problem if queue_item else None)
        language = override_language or (queue_item.language if queue_item else "Bengali")
        
        exact_problem = cls.sanitize_exact_problem(raw_problem, raw_company_name)
        company_name = raw_company_name.strip()
        meeting_platform = getattr(kb, "meeting_platform", "Google Meet")
        has_bengali_chars = bool(re.search(r'[\u0980-\u09ff]', user_speech_text))
        has_english_words = any(w in user_speech_text.lower() for w in ["tomorrow", "fine", "works", "available", "link", "meet", "zoom", "call", "dispatching"])
        if has_bengali_chars:
            is_bn = True
        elif has_english_words:
            is_bn = False
        else:
            is_bn = language.lower() in ["bengali", "bangla"]

        variables = {
            "client_name": client_name,
            "company_name": company_name,
            "agent_persona_name": getattr(kb, "agent_persona_name", "Alex"),
            "my_company": getattr(kb, "company_name", "Global Enterprise Solutions"),
            "exact_problem": exact_problem,
            "core_offer": getattr(kb, "core_offer", "100% Risk-Free Pilot"),
            "meeting_platform": meeting_platform,
        }

        # 1. Detect Meeting Agreement
        agreed, slot = cls.detect_meeting_agreement(user_speech_text)
        if agreed:
            calendly_url = (getattr(kb, "calendly_url", None) or "").strip()
            meeting_link = calendly_url if calendly_url else None
            effective_platform = "Calendly" if calendly_url else "Direct Call"

            meeting_time = slot or "Tomorrow at 11:00 AM"
            variables["meeting_time"] = meeting_time
            variables["meeting_platform"] = effective_platform
            variables["meeting_link"] = meeting_link or ""
            
            # Zero Hardcoded Speech: Render Admin Defined Confirmation Speech Template
            admin_confirm_speech = getattr(kb, "meeting_confirmation_speech", None)
            if admin_confirm_speech and admin_confirm_speech.strip():
                agent_reply = cls.render_prompt_template(admin_confirm_speech, variables)
            elif is_bn:
                if calendly_url:
                    agent_reply = f"অসাধারণ! আমি এখনই আপনার হোয়াটসঅ্যাপ ও ইমেইলে আমাদের ক্যালেন্ডার বুকিং লিংক পাঠিয়ে দিচ্ছি, যেখান থেকে আপনার সুবিধাজনক সময়ে মিটিং বুক করতে পারবেন। ভালো থাকবেন, {client_name} সাহেব!"
                else:
                    agent_reply = f"অসাধারণ! {meeting_time}-এ শিডিউল নোট করে নিলাম। ভালো থাকবেন, {client_name} সাহেব!"
            else:
                if calendly_url:
                    agent_reply = f"Awesome! I'm sending our Calendly scheduling link to your WhatsApp and email right now, so you can pick any time that fits your schedule. Talk soon, {client_name}!"
                else:
                    agent_reply = f"Awesome! Locked in for {meeting_time}. Talk to you then, {client_name}!"
            
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

        # 2. Check Admin Dynamic Knowledge Base (FAQ KB)
        faq_kb_list = getattr(kb, "faq_kb_json", []) or []
        kb_answer = cls.find_faq_kb_match(user_speech_text, faq_kb_list, variables)
        if kb_answer:
            audio_bytes = await cls._generate_elevenlabs_audio_if_available(kb, kb_answer)
            return {
                "agent_reply_text": kb_answer,
                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else None,
                "meeting_booked": False,
                "meeting_link": None,
                "meeting_time": None,
                "detected_intent": "KB_ANSWERED",
                "language": language,
            }

        # 3. Check Objection Counter
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

        # 4. Check Admin Outbound Script Progression
        script_questions = getattr(kb, "script_questions_json", []) or []
        next_step_q = cls.find_next_script_question(script_questions, conversation_history, variables)
        if next_step_q and len((conversation_history or [])) <= 4:
            audio_bytes = await cls._generate_elevenlabs_audio_if_available(kb, next_step_q)
            return {
                "agent_reply_text": next_step_q,
                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else None,
                "meeting_booked": False,
                "meeting_link": None,
                "meeting_time": None,
                "detected_intent": "SCRIPT_STEP",
                "language": language,
            }

        # 5. LLM Reasoning for Custom Dialogue
        lang_instruction = "Speak in natural, polite Bengali (বাংলা)." if is_bn else f"Speak in fluent, professional {language}."
        system_instruction = (
            f"You are {getattr(kb, 'agent_persona_name', 'Alex')}, an elite B2B sales advisor calling {client_name} at {company_name}. "
            f"Their identified flaw is: '{exact_problem}'. Core solution: '{getattr(kb, 'core_offer', 'risk-free trial')}'. "
            f"LANGUAGE: {lang_instruction} "
            "CRITICAL: Keep your response STRICTLY under 18 words (max 8 seconds of speech). Be warm, direct, and ask if tomorrow 11 AM or 3 PM works."
        )

        clean_reply = await cls._generate_llm_reply(system_instruction, conversation_history, user_speech_text)
        if not clean_reply or len(clean_reply.split()) < 3:
            offer = getattr(kb, "core_offer", "") or exact_problem
            clean_reply = (
                f"{offer} সম্পর্কে কি কাল ১০ মিনিট আলোচনা করা সম্ভব?"
                if is_bn
                else f"Would you be open to a 10-minute discovery demo regarding {offer}?"
            )

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
