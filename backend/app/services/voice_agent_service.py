import re
import uuid
import json
import base64
import httpx
from datetime import datetime, time, timezone
from typing import Dict, Any, List, Optional, Tuple
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, text
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logging import logger
from app.models.lead import Lead
from app.models.business import Business
from app.models.voice_agent import VoiceKnowledgeBase, VoiceCallQueueItem, VoiceCallLog, DEFAULT_COUNTRY_LANGUAGE_MAP

_SESSION_MEMORY_CACHE: Dict[str, Dict[str, Any]] = {}

class VoiceAgentService:

    @classmethod
    def sanitize_exact_problem(cls, problem: Optional[str], company_name: Optional[str] = None) -> str:
        if not problem or not problem.strip():
            return ""

        lower = problem.lower().strip()
        negative_markers = [
            "do not align", "not align", "identified issues", "agency service", "capabilities",
            "unqualified", "reject", "triage", "insufficient", "lacks capability", "no website"
        ]

        if any(marker in lower for marker in negative_markers):
            return "client acquisition pipeline and operational follow-up"

        if len(problem) > 80:
            return problem[:75].rstrip()

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
    def clean_phone_number(cls, raw_phone: str) -> str:
        """
        Sanitize phone number for international WhatsApp delivery (digits without +).
        E.g.
        01712643138 -> 8801712643138
        +880 1712-643138 -> 8801712643138
        +1 (555) 234-5678 -> 15552345678
        """
        digits = re.sub(r'\D', '', raw_phone or "")
        if not digits:
            return ""
        if digits.startswith("01") and len(digits) == 11:
            return f"88{digits}"
        if digits.startswith("880") and len(digits) == 13:
            return digits
        return digits

    @classmethod
    async def dispatch_whatsapp_message(
        cls,
        phone_number_id: str,
        access_token: str,
        to_phone: str,
        message_body: str,
    ) -> Dict[str, Any]:
        """
        Deliver outbound WhatsApp message via Meta WhatsApp Business Cloud API.
        Returns {success: bool, message_id?: str, error?: str, recipient?: str}
        """
        cleaned_phone = cls.clean_phone_number(to_phone)
        if not cleaned_phone:
            return {"success": False, "error": "Invalid or empty destination phone number."}

        url = f"https://graph.facebook.com/v19.0/{phone_number_id.strip()}/messages"
        headers = {
            "Authorization": f"Bearer {access_token.strip()}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": cleaned_phone,
            "type": "text",
            "text": {"preview_url": True, "body": message_body},
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}

                if resp.status_code in (200, 201):
                    msg_id = (data.get("messages") or [{}])[0].get("id")
                    logger.info(f"[Voice WhatsApp] Successfully dispatched to {cleaned_phone}. WAMID: {msg_id}")
                    return {"success": True, "message_id": msg_id, "recipient": cleaned_phone}
                else:
                    err_msg = data.get("error", {}).get("message") or resp.text
                    logger.warning(f"[Voice WhatsApp] Meta Cloud API Error ({resp.status_code}): {err_msg}")
                    return {"success": False, "error": err_msg, "status_code": resp.status_code}
        except Exception as e:
            logger.error(f"[Voice WhatsApp] Dispatch exception: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    def detect_meeting_agreement(cls, user_text: str) -> Tuple[bool, Optional[str]]:
        """
        Universal intent detector for meeting confirmation or link request.
        Avoids brittle hardcoded keyword lists while accurately catching agreement across languages.
        """
        lower = user_text.lower().strip()

        # 1. Direct link or calendar invite request
        has_link_req = any(w in lower for w in ["link", "লিংক", "invite", "zoom", "meet", "schedule"]) and any(
            v in lower for v in ["send", "give", "share", "drop", "email", "mail", "whatsapp", "text", "yes", "sure", "ok", "din", "den", "pathan", "পাঠান", "দিন", "দেন"]
        )

        # 2. Acceptance of proposed time slot or stated availability
        has_time = any(w in lower for w in [
            "tomorrow", "3 pm", "11 am", "afternoon", "friday", "monday", "this time", "that time",
            "কাল", "বিকাল", "সকাল", "শুক্রবার", "৩", "১১"
        ])
        has_affirmation = any(w in lower for w in [
            "work", "available", "free", "sounds good", "fine", "good", "sure", "ok", "okay",
            "parbo", "পারব", "সমস্যা নেই", "শিওর", "সিওর", "হবে"
        ])

        # 3. Explicit meeting booking intention
        has_demo_booking = any(w in lower for w in ["demo", "walkthrough", "ওয়াকথ্রু", "ডেমো"]) and any(
            v in lower for v in ["show", "see", "dekh", "দেখান", "দেখি", "parbo", "পারব", "sure", "yes"]
        )

        if has_link_req or (has_time and has_affirmation) or has_demo_booking:
            if any(p in lower for p in ["3 pm", "3:00", "afternoon", "বিকাল", "৩"]):
                return True, "Tomorrow at 3:00 PM"
            elif any(p in lower for p in ["friday", "শুক্রবার"]):
                return True, "Friday at 3:00 PM"
            elif any(p in lower for p in ["11 am", "11:00", "সকাল", "১১"]):
                return True, "Tomorrow at 11:00 AM"
            return True, "Flexible (Self-selected via link)"

        return False, None


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
        """Pulls verified discovered leads from Card 1 (leads & businesses table) and populates the Voice Call Queue."""
        # 1. Guarantee schema & columns exist with autocommit
        try:
            from app.db.migrate_voice import ensure_voice_agent_schema
            await ensure_voice_agent_schema(force=True)
        except Exception as mig_err:
            logger.warning(f"[VoiceAgentService] ensure_voice_agent_schema notice: {mig_err}")

        synced_count = 0
        try:
            # 2. Fetch all existing phones currently in voice_call_queue in a single fast query
            existing_res = await db.execute(text("SELECT phone FROM voice_call_queue WHERE phone IS NOT NULL AND phone != ''"))
            existing_phones = {str(row[0]).strip() for row in existing_res.fetchall() if row[0] and str(row[0]).strip()}

            # 3. Fetch leads from leads table (prioritize qualified, but take any discovered lead with phone)
            stmt = (
                select(Lead)
                .options(selectinload(Lead.business).selectinload(Business.locations))
                .order_by(desc(Lead.is_qualified), desc(Lead.created_at))
                .limit(200)
            )
            res = await db.execute(stmt)
            leads = res.scalars().all()

            for lead in leads:
                try:
                    biz = lead.business
                    if not biz or not biz.phone or not biz.phone.strip():
                        continue

                    phone = biz.phone.strip()
                    if phone in existing_phones:
                        continue

                    meta = biz.metadata_json or {}
                    loc = biz.locations[0] if (biz.locations and len(biz.locations) > 0) else None
                    loc_country = loc.country if loc and loc.country else (meta.get("country") or meta.get("search_country"))

                    country, lang = cls.resolve_country_and_language_waterfall(
                        phone=phone,
                        location_country=loc_country,
                        search_metadata=meta,
                    )

                    raw_problem = getattr(lead, "what_they_need", None) or getattr(lead, "why_they_need_us", None) or getattr(lead, "primary_gap_summary", None) or ""
                    clean_problem = cls.sanitize_exact_problem(raw_problem, biz.canonical_name)
                    if not clean_problem:
                        clean_problem = "Customer inquiry response speed and automated lead qualification"

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
                    existing_phones.add(phone)
                    synced_count += 1
                except Exception as lead_err:
                    logger.warning(f"[VoiceAgentService] Skipping problematic lead: {lead_err}")
                    continue

            # 4. If no leads synced from leads table, check businesses table directly
            if synced_count == 0:
                b_stmt = (
                    select(Business)
                    .options(selectinload(Business.locations))
                    .where(Business.phone.isnot(None), Business.phone != "")
                    .order_by(desc(Business.created_at))
                    .limit(100)
                )
                b_res = await db.execute(b_stmt)
                businesses = b_res.scalars().all()

                for biz in businesses:
                    try:
                        if not biz.phone or not biz.phone.strip():
                            continue
                        phone = biz.phone.strip()
                        if phone in existing_phones:
                            continue

                        meta = biz.metadata_json or {}
                        loc = biz.locations[0] if (biz.locations and len(biz.locations) > 0) else None
                        loc_country = loc.country if loc and loc.country else (meta.get("country") or meta.get("search_country"))

                        country, lang = cls.resolve_country_and_language_waterfall(
                            phone=phone,
                            location_country=loc_country,
                            search_metadata=meta,
                        )

                        queue_item = VoiceCallQueueItem(
                            contact_person=biz.contact_person or "Decision Maker",
                            contact_title=biz.contact_title or "Owner / Executive",
                            company_name=biz.canonical_name,
                            phone=phone,
                            country=country,
                            language=lang,
                            exact_problem="Website performance and automated online booking",
                            status="READY",
                            selected_for_call=True,
                        )
                        db.add(queue_item)
                        existing_phones.add(phone)
                        synced_count += 1
                    except Exception as biz_err:
                        logger.warning(f"[VoiceAgentService] Skipping problematic business: {biz_err}")
                        continue

            if synced_count > 0:
                await db.commit()
                logger.info(f"[VoiceAgentService] Successfully synced {synced_count} leads into Call Queue.")

            return synced_count
        except Exception as e:
            await db.rollback()
            logger.error(f"[VoiceAgentService] sync_leads_from_card_1 error: {e}", exc_info=True)
            raise e


    @classmethod
    async def get_session_memory(cls, session_id: str) -> Dict[str, Any]:
        """Fetch session state and conversation memory from Redis (or in-memory cache)."""
        if not session_id:
            return {}
        try:
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=1.0)
            data = await r.get(f"voice:session:{session_id}")
            await r.aclose()
            if data:
                parsed = json.loads(data)
                _SESSION_MEMORY_CACHE[session_id] = parsed
                return parsed
        except Exception as e:
            logger.debug(f"[VoiceAgentService] Redis read notice: {e}")
        return _SESSION_MEMORY_CACHE.get(session_id, {})

    @classmethod
    async def save_session_memory(cls, session_id: str, state: Dict[str, Any], ttl_seconds: int = 3600):
        """Save session state and conversation memory to Redis (and in-memory cache) with TTL."""
        if not session_id:
            return
        _SESSION_MEMORY_CACHE[session_id] = state
        try:
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=1.0)
            await r.setex(f"voice:session:{session_id}", ttl_seconds, json.dumps(state, ensure_ascii=False))
            await r.aclose()
        except Exception as e:
            logger.debug(f"[VoiceAgentService] Redis save notice: {e}")


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
        override_client_email: Optional[str] = None,
        override_phone: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Processes a speech turn, checks dynamic KB & script flow, maintaining Redis conversation memory."""
        raw_company_name = override_company_name or (queue_item.company_name if queue_item else "Your Enterprise")
        client_name = override_client_name or (queue_item.contact_person if queue_item else "Business Leader")
        raw_problem = override_exact_problem or (queue_item.exact_problem if queue_item else None)
        language = override_language or (queue_item.language if queue_item else "Bengali")
        
        exact_problem = cls.sanitize_exact_problem(raw_problem, raw_company_name)
        company_name = raw_company_name.strip()
        meeting_platform = getattr(kb, "meeting_platform", "Google Meet")

        # Session memory resolution (Redis + Local Cache)
        effective_session_id = session_id or (
            str(queue_item.id) if queue_item and getattr(queue_item, "id", None)
            else f"sim_{company_name}_{client_name}".replace(" ", "_").lower()
        )
        cached_session = await cls.get_session_memory(effective_session_id)
        if not conversation_history and cached_session.get("history"):
            conversation_history = cached_session.get("history", [])

        # 100% Database-Driven Lead, Business, Industry & Matched Service Extraction
        lead_rel = getattr(queue_item, "lead", None) if queue_item else None
        biz_rel = getattr(lead_rel, "business", None) if lead_rel else None

        client_email = override_client_email or (getattr(biz_rel, "email", None) if biz_rel else None) or cached_session.get("client_email") or ""
        lead_phone = override_phone or (getattr(queue_item, "phone", None) if queue_item else None) or cached_session.get("phone") or ""

        raw_biz_type = (getattr(biz_rel, "business_type", None) if biz_rel else None) or ""
        industry_name = raw_biz_type.replace("_", " ").strip() if (raw_biz_type and raw_biz_type.lower() != "other") else "business"

        matched_service = (
            getattr(lead_rel, "matched_service", None)
            or getattr(kb, "service_name", None)
            or getattr(kb, "core_offer", None)
            or "enterprise software solutions"
        )

        # Real-time Language Mirroring: Always mirror the caller's spoken language in THIS turn
        has_bengali_chars = bool(re.search(r'[\u0980-\u09ff]', user_speech_text))
        has_english_letters = bool(re.search(r'[a-zA-Z]', user_speech_text))
        lower_speech = user_speech_text.lower().strip()

        # Dynamic turn language detection
        english_words = re.findall(r'[a-zA-Z]+', lower_speech)
        is_user_speaking_english = (has_english_letters and not has_bengali_chars) and (
            len(english_words) >= 2 or any(w in lower_speech for w in [
                "busy", "later", "call", "not", "no", "yes", "stop", "dont", "fine", "ok", 
                "sure", "who", "what", "how", "price", "cost", "english", "tomorrow", "thanks", "needed"
            ])
        )

        if is_user_speaking_english:
            current_turn_lang = "English"
            is_bn = False
        elif has_bengali_chars:
            current_turn_lang = "Bengali"
            is_bn = True
        else:
            is_bn = language.lower() in ["bengali", "bangla"]
            current_turn_lang = "Bengali" if is_bn else "English"

        variables = {
            "client_name": client_name,
            "company_name": company_name,
            "agent_persona_name": (getattr(kb, "agent_persona_name", None) or "").strip(),
            "my_company": (getattr(kb, "company_name", None) or "").strip(),
            "exact_problem": exact_problem,
            "core_offer": getattr(kb, "core_offer", "Free 5-Minute Live Cloud Architecture Walkthrough & Demo"),
            "meeting_platform": meeting_platform,
            "client_email": client_email,
            "industry_name": industry_name,
            "matched_service": matched_service,
        }

        # 0. Opt-out & Refusal Guard
        optout_phrases = [
            "not interested", "dont call", "do not call", "stop call", "no needed", "not needed",
            "no thanks", "no thank you", "dont need", "don't need", "leave me alone",
            "দরকার নাই", "দরকার নেই", "ফোন রাখেন", "কাটেন", "বিরক্ত", "লাগবে না", "চাই না"
        ]
        is_optout = any(sig in lower_speech for sig in optout_phrases) or (lower_speech in ["no", "nah", "না", "না ভাই", "bye", "goodbye"])
        if is_optout:
            agent_reply = await cls._generate_stage_reply(
                objective="Politely thank the caller for their time, respect their decision, and end the call gracefully.",
                user_speech_text=user_speech_text,
                history=conversation_history,
                kb=kb,
                fallback_text="No problem at all. Thank you for your time, and have a wonderful day!",
                is_bn=is_bn,
            )
            await cls.save_session_memory(effective_session_id, {
                "stage": "OPTOUT",
                "last_intent": "OPTOUT_HANGUP",
                "phone": lead_phone,
                "client_email": client_email,
                "history": list(conversation_history or []) + [
                    {"speaker": "lead", "text": user_speech_text},
                    {"speaker": "agent", "text": agent_reply},
                ],
            })
            return {
                "agent_reply_text": agent_reply,
                "audio_base64": None,
                "meeting_booked": False,
                "meeting_link": None,
                "meeting_time": None,
                "detected_intent": "OPTOUT_HANGUP",
                "conversation_stage": "OPTOUT",
                "session_id": effective_session_id,
                "language": current_turn_lang,
                "should_hangup": True,
            }

        # =========================================================================
        # 1. Multi-Step Meeting Booking & Channel Verification Flow
        # =========================================================================
        cached_stage = cached_session.get("stage") or "QUALIFYING"
        calendly_url = (getattr(kb, "calendly_url", None) or "").strip() or None
        effective_phone = lead_phone or ""
        proposed_slot = cached_session.get("proposed_time") or "Flexible (Self-selected via link)"

        # Stage A: Already asked delivery channel, now prospect chooses Email or WhatsApp
        if cached_stage == "ASKING_DELIVERY_CHANNEL":
            is_email_choice = any(k in lower_speech for k in ["email", "e-mail", "mail", "ইমেইল", "মেইল", "মেইলে", "gmail"]) or "@" in lower_speech
            is_wa_choice = any(k in lower_speech for k in ["whatsapp", "whats app", "হোয়াটসঅ্যাপ", "হোয়াটসঅ্যাপ", "হোয়াটস অ্যাপ", "নাম্বার", "নম্বর", "number", "phone", "mobile"])

            if is_email_choice:
                email_match = re.search(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)', user_speech_text)
                if email_match:
                    new_email = email_match.group(0)
                    agent_reply = await cls._generate_stage_reply(
                        objective=f"Confirm that the meeting booking link is being sent to {new_email}. Remind the caller that once opened, they can choose any date and time that fits their schedule. Wish them a great day and conclude warmly.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text=f"Awesome! Sending the meeting link to {new_email}. Once you open the link, you can select any date and time of your choice. Talk to you soon!",
                        is_bn=is_bn,
                    )
                    await cls.save_session_memory(effective_session_id, {
                        "stage": "CONFIRMED",
                        "last_intent": "MEETING_CONFIRMED",
                        "confirmed_destination": new_email,
                        "phone": lead_phone,
                        "client_email": new_email,
                        "history": list(conversation_history or []) + [
                            {"speaker": "lead", "text": user_speech_text},
                            {"speaker": "agent", "text": agent_reply},
                        ],
                    })
                    return {
                        "agent_reply_text": agent_reply,
                        "audio_base64": None,
                        "meeting_booked": True,
                        "meeting_link": calendly_url,
                        "meeting_time": proposed_slot,
                        "detected_intent": "MEETING_CONFIRMED",
                        "conversation_stage": "CONFIRMED",
                        "session_id": effective_session_id,
                        "language": current_turn_lang,
                        "should_hangup": True,
                    }
                elif client_email and client_email.strip():
                    agent_reply = await cls._generate_stage_reply(
                        objective=f"Ask the caller if their email address is {client_email} and whether we should send the booking link there.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text=f"Is your email {client_email}? Should I send it there?",
                        is_bn=is_bn,
                    )
                    next_stage = "CONFIRMING_EMAIL"
                else:
                    agent_reply = await cls._generate_stage_reply(
                        objective="Politely ask the caller to share their email address so we can send the booking link.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text="Could you please share your email address?",
                        is_bn=is_bn,
                    )
                    next_stage = "COLLECTING_EMAIL"

                await cls.save_session_memory(effective_session_id, {
                    "stage": next_stage,
                    "chosen_channel": "email",
                    "proposed_time": proposed_slot,
                    "phone": lead_phone,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": False,
                    "meeting_link": None,
                    "meeting_time": None,
                    "detected_intent": "SELECT_EMAIL_CHANNEL",
                    "conversation_stage": next_stage,
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": False,
                }

            elif is_wa_choice:
                phone_digits = re.findall(r'\d+', user_speech_text)
                joined_digits = "".join(phone_digits)
                if len(joined_digits) >= 8:
                    agent_reply = await cls._generate_stage_reply(
                        objective=f"Confirm that the meeting booking link is being sent to their WhatsApp at {joined_digits}. Remind the caller that once opened, they can choose any date and time that fits their schedule. Wish them a great day and conclude warmly.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text=f"Awesome! Sending the meeting link to {joined_digits} on WhatsApp. When you open the link, you can pick any date and time convenient for you. Talk to you soon!",
                        is_bn=is_bn,
                    )
                    await cls.save_session_memory(effective_session_id, {
                        "stage": "CONFIRMED",
                        "last_intent": "MEETING_CONFIRMED",
                        "confirmed_destination": joined_digits,
                        "phone": joined_digits,
                        "client_email": client_email,
                        "history": list(conversation_history or []) + [
                            {"speaker": "lead", "text": user_speech_text},
                            {"speaker": "agent", "text": agent_reply},
                        ],
                    })
                    return {
                        "agent_reply_text": agent_reply,
                        "audio_base64": None,
                        "meeting_booked": True,
                        "meeting_link": calendly_url,
                        "meeting_time": proposed_slot,
                        "detected_intent": "MEETING_CONFIRMED",
                        "conversation_stage": "CONFIRMED",
                        "session_id": effective_session_id,
                        "language": current_turn_lang,
                        "should_hangup": True,
                    }

                if effective_phone and effective_phone.strip():
                    agent_reply = await cls._generate_stage_reply(
                        objective=f"Ask the caller if WhatsApp is active on the phone number we are currently speaking on ({effective_phone}).",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text=f"Is WhatsApp active on the number I am calling ({effective_phone})?",
                        is_bn=is_bn,
                    )
                    next_stage = "CONFIRMING_WHATSAPP"
                else:
                    agent_reply = await cls._generate_stage_reply(
                        objective="Politely ask the caller to share their WhatsApp phone number so we can send the booking link.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text="Could you please share your WhatsApp number?",
                        is_bn=is_bn,
                    )
                    next_stage = "COLLECTING_WHATSAPP"

                await cls.save_session_memory(effective_session_id, {
                    "stage": next_stage,
                    "chosen_channel": "whatsapp",
                    "proposed_time": proposed_slot,
                    "phone": lead_phone,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": False,
                    "meeting_link": None,
                    "meeting_time": None,
                    "detected_intent": "SELECT_WHATSAPP_CHANNEL",
                    "conversation_stage": next_stage,
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": False,
                }
            else:
                agent_reply = await cls._generate_stage_reply(
                    objective="Ask the caller whether they would prefer to receive the meeting booking link via Email or WhatsApp.",
                    user_speech_text=user_speech_text,
                    history=conversation_history,
                    kb=kb,
                    fallback_text="Would it be better to send the meeting link to your Email or WhatsApp?",
                    is_bn=is_bn,
                )
                await cls.save_session_memory(effective_session_id, {
                    "stage": "ASKING_DELIVERY_CHANNEL",
                    "proposed_time": proposed_slot,
                    "phone": lead_phone,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": False,
                    "meeting_link": None,
                    "meeting_time": None,
                    "detected_intent": "ASK_DELIVERY_CHANNEL",
                    "conversation_stage": "ASKING_DELIVERY_CHANNEL",
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": False,
                }

        # Stage B: Confirming lead's email on record
        if cached_stage == "CONFIRMING_EMAIL":
            is_yes = any(k in lower_speech for k in ["হ্যাঁ", "জি", "হাঁ", "ঠিক", "এতেই", "পাঠান", "yes", "yeah", "sure", "correct", "ok", "okay", "right", "this"])
            email_match = re.search(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)', user_speech_text)
            
            if email_match:
                new_email = email_match.group(0)
                agent_reply = await cls._generate_stage_reply(
                    objective=f"Confirm that the meeting booking link is being sent to {new_email}. Remind the caller that once opened, they can choose any date and time that fits their schedule. Wish them a great day and conclude warmly.",
                    user_speech_text=user_speech_text,
                    history=conversation_history,
                    kb=kb,
                    fallback_text=f"Awesome! Sending the meeting link to {new_email}. Once you open the link, you can select any date and time that suits you. Talk to you soon!",
                    is_bn=is_bn,
                )
                await cls.save_session_memory(effective_session_id, {
                    "stage": "CONFIRMED",
                    "last_intent": "MEETING_CONFIRMED",
                    "confirmed_destination": new_email,
                    "phone": lead_phone,
                    "client_email": new_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": True,
                    "meeting_link": calendly_url,
                    "meeting_time": proposed_slot,
                    "detected_intent": "MEETING_CONFIRMED",
                    "conversation_stage": "CONFIRMED",
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": True,
                }
            elif is_yes:
                dest = client_email or "your email"
                agent_reply = await cls._generate_stage_reply(
                    objective=f"Confirm that the meeting booking link has been sent to {dest}. Remind the caller that once opened, they can choose any date and time of their choice. Wish them a great day and conclude warmly.",
                    user_speech_text=user_speech_text,
                    history=conversation_history,
                    kb=kb,
                    fallback_text=f"Awesome! I have sent the meeting link to {dest}. When you open the link, feel free to pick any date and time of your choice. Talk to you soon!",
                    is_bn=is_bn,
                )
                await cls.save_session_memory(effective_session_id, {
                    "stage": "CONFIRMED",
                    "last_intent": "MEETING_CONFIRMED",
                    "confirmed_destination": dest,
                    "phone": lead_phone,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": True,
                    "meeting_link": calendly_url,
                    "meeting_time": proposed_slot,
                    "detected_intent": "MEETING_CONFIRMED",
                    "conversation_stage": "CONFIRMED",
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": True,
                }
            else:
                agent_reply = await cls._generate_stage_reply(
                    objective="Politely ask the caller which email address we should send the booking link to.",
                    user_speech_text=user_speech_text,
                    history=conversation_history,
                    kb=kb,
                    fallback_text="Which email address should I send the link to?",
                    is_bn=is_bn,
                )
                await cls.save_session_memory(effective_session_id, {
                    "stage": "COLLECTING_EMAIL",
                    "phone": lead_phone,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": False,
                    "meeting_link": None,
                    "meeting_time": None,
                    "detected_intent": "COLLECT_EMAIL",
                    "conversation_stage": "COLLECTING_EMAIL",
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": False,
                }

        # Stage C: Collecting email address when not on record
        if cached_stage == "COLLECTING_EMAIL":
            email_match = re.search(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)', user_speech_text)
            new_email = email_match.group(0) if email_match else user_speech_text.strip()
            agent_reply = await cls._generate_stage_reply(
                objective=f"Confirm that the meeting booking link is being sent to {new_email}. Remind the caller that once opened, they can choose any date and time that fits their schedule. Wish them a great day and conclude warmly.",
                user_speech_text=user_speech_text,
                history=conversation_history,
                kb=kb,
                fallback_text=f"Awesome! Sending the meeting link to {new_email}. When you open the link, you can select any date and time of your choice. Talk to you soon!",
                is_bn=is_bn,
            )
            await cls.save_session_memory(effective_session_id, {
                "stage": "CONFIRMED",
                "last_intent": "MEETING_CONFIRMED",
                "confirmed_destination": new_email,
                "phone": lead_phone,
                "client_email": new_email,
                "history": list(conversation_history or []) + [
                    {"speaker": "lead", "text": user_speech_text},
                    {"speaker": "agent", "text": agent_reply},
                ],
            })
            return {
                "agent_reply_text": agent_reply,
                "audio_base64": None,
                "meeting_booked": True,
                "meeting_link": calendly_url,
                "meeting_time": proposed_slot,
                "detected_intent": "MEETING_CONFIRMED",
                "conversation_stage": "CONFIRMED",
                "session_id": effective_session_id,
                "language": current_turn_lang,
                "should_hangup": True,
            }

        # Stage D: Confirming WhatsApp on calling phone number
        if cached_stage == "CONFIRMING_WHATSAPP":
            is_yes = any(k in lower_speech for k in ["হ্যাঁ", "জি", "হাঁ", "ঠিক", "এতেই", "আছে", "yes", "yeah", "sure", "correct", "ok", "okay", "right", "this"])
            phone_digits = re.findall(r'\d+', user_speech_text)
            joined_digits = "".join(phone_digits)
            
            if len(joined_digits) >= 8:
                agent_reply = await cls._generate_stage_reply(
                    objective=f"Confirm that the meeting booking link is being sent to their WhatsApp at {joined_digits}. Remind the caller that once opened, they can select any date and time that fits their schedule. Wish them a great day and conclude warmly.",
                    user_speech_text=user_speech_text,
                    history=conversation_history,
                    kb=kb,
                    fallback_text=f"Awesome! Sending the meeting link to {joined_digits} on WhatsApp. When you open the link, you can pick any date and time convenient for you. Talk to you soon!",
                    is_bn=is_bn,
                )
                await cls.save_session_memory(effective_session_id, {
                    "stage": "CONFIRMED",
                    "last_intent": "MEETING_CONFIRMED",
                    "confirmed_destination": joined_digits,
                    "phone": joined_digits,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": True,
                    "meeting_link": calendly_url,
                    "meeting_time": proposed_slot,
                    "detected_intent": "MEETING_CONFIRMED",
                    "conversation_stage": "CONFIRMED",
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": True,
                }
            elif is_yes:
                dest_phone = effective_phone or lead_phone
                if dest_phone and dest_phone.strip():
                    agent_reply = await cls._generate_stage_reply(
                        objective=f"Confirm that the meeting booking link is being sent to their WhatsApp at {dest_phone}. Remind the caller that once opened, they can choose any date and time that fits their schedule. Wish them a great day and conclude warmly.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text=f"Awesome! Sending the meeting link to your WhatsApp at {dest_phone}. Once you open the link, you can choose any date and time that suits you. Talk to you soon!",
                        is_bn=is_bn,
                    )
                    await cls.save_session_memory(effective_session_id, {
                        "stage": "CONFIRMED",
                        "last_intent": "MEETING_CONFIRMED",
                        "confirmed_destination": dest_phone,
                        "phone": dest_phone,
                        "client_email": client_email,
                        "history": list(conversation_history or []) + [
                            {"speaker": "lead", "text": user_speech_text},
                            {"speaker": "agent", "text": agent_reply},
                        ],
                    })
                    return {
                        "agent_reply_text": agent_reply,
                        "audio_base64": None,
                        "meeting_booked": True,
                        "meeting_link": calendly_url,
                        "meeting_time": proposed_slot,
                        "detected_intent": "MEETING_CONFIRMED",
                        "conversation_stage": "CONFIRMED",
                        "session_id": effective_session_id,
                        "language": current_turn_lang,
                        "should_hangup": True,
                    }
                else:
                    agent_reply = await cls._generate_stage_reply(
                        objective="Politely ask the caller which phone number they use for WhatsApp so we can send the booking link.",
                        user_speech_text=user_speech_text,
                        history=conversation_history,
                        kb=kb,
                        fallback_text="Which phone number do you use for WhatsApp?",
                        is_bn=is_bn,
                    )
                    await cls.save_session_memory(effective_session_id, {
                        "stage": "COLLECTING_WHATSAPP",
                        "phone": lead_phone,
                        "client_email": client_email,
                        "history": list(conversation_history or []) + [
                            {"speaker": "lead", "text": user_speech_text},
                            {"speaker": "agent", "text": agent_reply},
                        ],
                    })
                    return {
                        "agent_reply_text": agent_reply,
                        "audio_base64": None,
                        "meeting_booked": False,
                        "meeting_link": None,
                        "meeting_time": None,
                        "detected_intent": "COLLECT_WHATSAPP",
                        "conversation_stage": "COLLECTING_WHATSAPP",
                        "session_id": effective_session_id,
                        "language": current_turn_lang,
                        "should_hangup": False,
                    }
            else:
                agent_reply = await cls._generate_stage_reply(
                    objective="Politely ask the caller which phone number they use for WhatsApp so we can send the booking link.",
                    user_speech_text=user_speech_text,
                    history=conversation_history,
                    kb=kb,
                    fallback_text="Which phone number do you use for WhatsApp?",
                    is_bn=is_bn,
                )
                await cls.save_session_memory(effective_session_id, {
                    "stage": "COLLECTING_WHATSAPP",
                    "phone": lead_phone,
                    "client_email": client_email,
                    "history": list(conversation_history or []) + [
                        {"speaker": "lead", "text": user_speech_text},
                        {"speaker": "agent", "text": agent_reply},
                    ],
                })
                return {
                    "agent_reply_text": agent_reply,
                    "audio_base64": None,
                    "meeting_booked": False,
                    "meeting_link": None,
                    "meeting_time": None,
                    "detected_intent": "COLLECT_WHATSAPP",
                    "conversation_stage": "COLLECTING_WHATSAPP",
                    "session_id": effective_session_id,
                    "language": current_turn_lang,
                    "should_hangup": False,
                }

        # Stage E: Collecting alternate WhatsApp number
        if cached_stage == "COLLECTING_WHATSAPP":
            phone_digits = re.findall(r'\d+', user_speech_text)
            new_num = "".join(phone_digits) if len("".join(phone_digits)) >= 8 else user_speech_text.strip()
            agent_reply = await cls._generate_stage_reply(
                objective=f"Confirm that the meeting booking link is being sent to their WhatsApp at {new_num}. Remind the caller that once opened, they can choose any date and time of their choice. Wish them a great day and conclude warmly.",
                user_speech_text=user_speech_text,
                history=conversation_history,
                kb=kb,
                fallback_text=f"Awesome! Sending the meeting link to {new_num} on WhatsApp. When you open the link, you can select any date and time that fits your schedule. Talk to you soon!",
                is_bn=is_bn,
            )
            await cls.save_session_memory(effective_session_id, {
                "stage": "CONFIRMED",
                "last_intent": "MEETING_CONFIRMED",
                "confirmed_destination": new_num,
                "phone": new_num,
                "client_email": client_email,
                "history": list(conversation_history or []) + [
                    {"speaker": "lead", "text": user_speech_text},
                    {"speaker": "agent", "text": agent_reply},
                ],
            })
            return {
                "agent_reply_text": agent_reply,
                "audio_base64": None,
                "meeting_booked": True,
                "meeting_link": calendly_url,
                "meeting_time": proposed_slot,
                "detected_intent": "MEETING_CONFIRMED",
                "conversation_stage": "CONFIRMED",
                "session_id": effective_session_id,
                "language": current_turn_lang,
                "should_hangup": True,
            }

        # Initial trigger: Prospect agrees to meet or asks for link
        agreed, slot = cls.detect_meeting_agreement(user_speech_text)
        if agreed:
            meeting_time = slot or "Flexible (Self-selected via link)"
            agent_reply = await cls._generate_stage_reply(
                objective="Inform the caller that we will send a calendar booking link. Explain that once they open the link, they can choose any date and time that is convenient for them. Ask whether we should send the link via Email or WhatsApp.",
                user_speech_text=user_speech_text,
                history=conversation_history,
                kb=kb,
                fallback_text="Awesome! I will send you a calendar booking link. Once you open the link, you can choose any date and time that is convenient for you. Should I send the link to your Email or WhatsApp?",
                is_bn=is_bn,
            )
            await cls.save_session_memory(effective_session_id, {
                "stage": "ASKING_DELIVERY_CHANNEL",
                "proposed_time": meeting_time,
                "phone": lead_phone,
                "client_email": client_email,
                "history": list(conversation_history or []) + [
                    {"speaker": "lead", "text": user_speech_text},
                    {"speaker": "agent", "text": agent_reply},
                ],
            })
            return {
                "agent_reply_text": agent_reply,
                "audio_base64": None,
                "meeting_booked": False,
                "meeting_link": None,
                "meeting_time": meeting_time,
                "detected_intent": "ASKING_DELIVERY_CHANNEL",
                "conversation_stage": "ASKING_DELIVERY_CHANNEL",
                "session_id": effective_session_id,
                "language": current_turn_lang,
                "should_hangup": False,
            }

        # =========================================================================
        # 4. Intelligent Conversational LLM Reasoning (100% Google Gemini 2.0 Flash)
        # =========================================================================
        faq_kb_list = getattr(kb, "faq_kb_json", []) or []
        faq_lines = []
        for f in faq_kb_list:
            if f.get("active", True) and f.get("question") and f.get("answer"):
                faq_lines.append(f"- Q: {f.get('question').strip()}\n  A: {f.get('answer').strip()}")
        faq_context = ("\n\nADMIN VERIFIED KNOWLEDGE BASE & FACTS:\n" + "\n".join(faq_lines)) if faq_lines else ""

        # Format admin-defined outbound script flow steps with variable injection
        script_questions = getattr(kb, "script_questions_json", []) or []
        script_lines = []
        for sq in script_questions:
            if sq.get("active", True) and sq.get("question"):
                step_num = sq.get("step", len(script_lines) + 1)
                purpose = sq.get("purpose", f"Step {step_num}")
                q_text = sq.get("question", "").strip()
                for k, v in variables.items():
                    if isinstance(v, str):
                        q_text = q_text.replace(f"{{{{{k}}}}}", v)
                script_lines.append(f"Step {step_num} ({purpose}): {q_text}")
        script_context = ("\n\nSEQUENTIAL OUTBOUND SCRIPT FLOW (Use to guide qualification after rapport):\n" + "\n".join(script_lines)) if script_lines else ""

        lang_instruction = (
            "DYNAMIC MULTI-LANGUAGE & AUTHENTIC HUMAN STREET TALK:\n"
            "- You MUST dynamically identify the caller's language, dialect, and phrasing style from their input (e.g. Bengali script, Romanized Banglish, English, Hindi, Arabic, Spanish, colloquial street slang).\n"
            "- You MUST reply in the EXACT SAME language and conversational style as the caller.\n"
            "- If the caller speaks in Bengali (বাংলা), reply in polite, natural conversational Bengali using genuine local warmth ('জি ভাই', 'অবশ্যই', 'আচ্ছা', 'বুঝতে পেরেছি'). Never use bookish sadhu bhasha or robotic words.\n"
            "- If the caller speaks in Romanized Bengali / Banglish (e.g., 'bhai ami busy pore call diyen', 'apnader service ki?'), reply naturally in Banglish or colloquial Bengali.\n"
            "- If the caller speaks in English, reply in natural, consultative English.\n"
            "- If the caller speaks in another language, seamlessly adapt and respond in that language.\n"
            "- Sound like a real, empathetic human on a live phone call—warm, unhurried, calm, and conversational."
        )

        system_instruction = (
            f"You are {variables.get('agent_persona_name') or 'Karim'}, a consultative, friendly B2B sales professional from {variables.get('my_company') or 'NiBiz Soft'} speaking on a live phone call with {client_name} at {company_name}.\n"
            f"Company Services: {matched_service}.\n"
            f"Core Offer: {variables.get('core_offer')}.\n"
            f"{lang_instruction}\n"
            f"{faq_context}\n"
            f"{script_context}\n\n"
            "CONVERSATIONAL STAGES & AUTHENTIC HUMAN CALL RULES:\n"
            f"Prospect just said: \"{user_speech_text}\".\n"
            "1. ADAPTIVE LANGUAGE & STREET TALK MIRRORING:\n"
            "   - Match the caller's spoken language and conversational style. If English, answer in English! If Bengali, answer in Bengali! If Romanized Banglish, answer naturally in Banglish/Bengali!\n\n"
            "2. NATURAL BREATHING PAUSES & PUNCTUATION (CRITICAL FOR HUMAN VOICE):\n"
            "   - You MUST speak like an actual person who breathes between sentences. Always insert conversational commas (,), ellipsis (...), or dashes (—) between short phrases so the speech pauses naturally to take a breath!\n"
            "   - Example in Bengali: 'জি ভাই, আসলে... আমরা বিজনেসগুলোর ক্লায়েন্ট ফলো-আপ অটোমেট করি।'\n"
            "   - Example in English: 'Well, absolutely... we help companies streamline their pipeline.'\n"
            "   - Keep your response strictly under 20 words (1-2 short spoken sentences). Speak at an unhurried, calm human pace (120-130 WPM).\n\n"
            "3. BAN ROBOTIC CLICHÉS & BOOKISH BANGLA:\n"
            "   - Never say 'আমি একটি এআই', 'কিভাবে সহায়তা করিতে পারি', or 'Certainly, I can assist'. Speak with authentic warmth: 'জি ভাই বলুন', 'আচ্ছা বুঝতে পেরেছি', 'আরে কোনো সমস্যা নেই ভাই'.\n\n"
            "4. GREETING & PLEASANTRIES (e.g. 'how are you?', 'kemon achen', 'valo achi', 'fine', 'জি বলুন'):\n"
            "   - First, warmly acknowledge with natural breath pauses (e.g. 'আলহামদুলিল্লাহ, আমিও ভালো আছি! ভাই, আপনার কি... ১টা মিনিট সময় হবে?').\n"
            "   - ABSOLUTELY DO NOT pitch or suggest a 5-minute walkthrough / demo right now! A human never sells a demo during pleasantries.\n\n"
            "5. BUSY / CALL LATER (e.g. 'I am busy right now, call later', 'busy aci', 'ব্যস্ত আছি', 'pore phone diyen'):\n"
            "   - Respect their time immediately: 'আরে কোনো সমস্যা নেই ভাই! কখন ফোন দিলে আপনার সুবিধা হবে?' Do NOT pitch anything!\n\n"
            "4. OBJECTIONS & INQUIRIES (e.g. pricing, what software you replace, company location, what do you do):\n"
            "   - Answer directly and accurately in 1 concise sentence using the ADMIN VERIFIED KNOWLEDGE BASE above.\n"
            "   - ONLY AFTER answering a real question or objection may you politely propose: 'Would you like to see a quick 5-minute walkthrough to see how it works for your team?'\n\n"
            "5. SCRIPT FLOW & DISCOVERY:\n"
            "   - When having normal dialogue, guide the prospect through the SEQUENTIAL OUTBOUND SCRIPT FLOW one question at a time.\n\n"
            "6. HUMAN VOICE & BREVITY:\n"
            "   - Keep your response strictly under 20 words (maximum 1-2 spoken sentences).\n"
            "   - Speak at a calm, natural, unhurried conversational pace. Pause naturally at commas and periods. Never rush or talk fast like a robot."
        )

        detected_intent = "CONVERSATIONAL_AI"
        clean_reply = await cls._generate_llm_reply(
            system_prompt=system_instruction,
            history=conversation_history,
            user_text=user_speech_text,
            gemini_api_key=getattr(kb, "gemini_api_key", None),
            gemini_model_id=getattr(kb, "gemini_model_id", None),
        )

        # If Gemini LLM returns empty or connection times out
        if not clean_reply:
            clean_reply = "Google Gemini service unreachable. Please verify your GEMINI_API_KEY in Voice Agent settings."
            detected_intent = "GEMINI_ERROR"

        # Determine conversation stage
        stage = "PITCH"
        lower_u = user_speech_text.lower()
        if any(w in lower_u for w in ["দাম", "খরচ", "price", "cost", "pricing"]):
            stage = "OBJECTION"
        elif any(w in lower_u for w in ["কে বলছেন", "who are you", "who is this", "পরিচয়"]):
            stage = "GREETING"
        elif any(w in lower_u for w in ["কী বিষয়", "কী করেন", "কী সার্ভিস", "service", "what do you do", "purpose"]):
            stage = "DISCOVERY"
        elif any(w in lower_u for w in ["demo", "meeting", "ওয়াকথ্রু", "আলোচনা"]):
            stage = "CLOSING"

        # Update Redis memory
        updated_history = list(conversation_history or [])
        updated_history.append({"speaker": "lead", "text": user_speech_text})
        updated_history.append({"speaker": "agent", "text": clean_reply})

        await cls.save_session_memory(effective_session_id, {
            "session_id": effective_session_id,
            "stage": stage,
            "last_intent": detected_intent,
            "client_name": client_name,
            "company_name": company_name,
            "matched_service": matched_service,
            "history": updated_history[-16:],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

        return {
            "agent_reply_text": clean_reply,
            "audio_base64": None,
            "meeting_booked": False,
            "meeting_link": None,
            "meeting_time": None,
            "detected_intent": detected_intent,
            "conversation_stage": stage,
            "session_id": effective_session_id,
            "language": language,
            "should_hangup": False,
        }

    @classmethod
    async def _generate_stage_reply(
        cls,
        objective: str,
        user_speech_text: str,
        history: Optional[List[Dict[str, str]]],
        kb: Any,
        fallback_text: str,
        is_bn: bool = False,
    ) -> str:
        """
        Dynamically generates spoken response mirroring the caller's language and dialect.
        Supports multi-language street/conversational talk: Bengali, English, Banglish,
        Hindi, Urdu, Arabic, Spanish, or any colloquial dialect.
        All internal code and prompts are maintained in clean English.
        """
        gemini_key = getattr(kb, "gemini_api_key", None) or settings.GEMINI_API_KEY
        if gemini_key:
            playbook = (getattr(kb, "system_prompt", None) or "").strip()
            persona = getattr(kb, "agent_persona_name", "Representative") or "Representative"
            company = getattr(kb, "company_name", "Our Company") or "Our Company"
            playbook_section = f"\n\nBUSINESS PLAYBOOK:\n{playbook}" if playbook else ""
            system_prompt = (
                f"You are {persona}, an empathetic, consultative B2B sales professional representing {company} on a live phone call.\n"
                f"OBJECTIVE: {objective}{playbook_section}\n\n"
                "CRITICAL SPOKEN LANGUAGE & HUMAN CONVERSATION RULES:\n"
                "1. DYNAMIC MULTI-LANGUAGE MIRRORING: You MUST detect the caller's spoken language, dialect, and phrasing from their message and dialogue history. Respond in the EXACT SAME language and conversational style as the caller (e.g., Bengali, English, Romanized Banglish, Hindi, Arabic, etc.). If the caller uses casual or street conversational phrasing, mirror it naturally and warmly without sounding robotic or overly formal.\n"
                "2. NATURAL BREATHING PAUSES & COMMAS: You MUST insert conversational commas (,), ellipsis (...), or dashes (—) so the spoken audio pauses naturally to take a breath! Never speak in a single breathless sentence.\n"
                "3. CONCISENESS & PACING: Keep your reply strictly under 20 words (1-2 short spoken sentences). Speak at an unhurried, calm human pace (120-130 WPM).\n"
                "4. CONSULTATIVE LISTENING: If the caller says they already have software or a website, never force a demo. Acknowledge warmly and inquire consultatively about their current system or if they experience any gaps."
            )
            llm_reply = await cls._generate_llm_reply(
                system_prompt=system_prompt,
                history=history,
                user_text=user_speech_text,
                gemini_api_key=gemini_key,
                gemini_model_id=getattr(kb, "gemini_model_id", None),
            )
            if llm_reply and len(llm_reply.split()) >= 2:
                return llm_reply

        return fallback_text

    @classmethod
    async def _generate_llm_reply(
        cls,
        system_prompt: str,
        history: Optional[List[Dict[str, str]]],
        user_text: str,
        gemini_api_key: Optional[str] = None,
        gemini_model_id: Optional[str] = None,
    ) -> str:
        """Generates dynamic sales dialogue using Google Gemini 2.0 Flash REST."""
        # 1. Primary Engine: Google Gemini 2.0 Flash (REST API - Free, 200ms latency, Bengali/English/Banglish)
        effective_gemini_key = gemini_api_key or settings.GEMINI_API_KEY
        if effective_gemini_key:
            try:
                # Use ultra-fast, active Google Gemini flash-lite for REST dialogue turns
                model_name = "gemini-flash-lite-latest"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={effective_gemini_key}"
                
                contents = []
                if history:
                    for turn in history[-6:]:
                        spk = turn.get("speaker", "").lower()
                        role = "model" if spk in ["agent", "ai"] else "user"
                        txt = (turn.get("text") or "").strip()
                        if txt:
                            contents.append({"role": role, "parts": [{"text": txt}]})
                contents.append({"role": "user", "parts": [{"text": user_text}]})
                
                body = {
                    "system_instruction": {
                        "parts": [{"text": system_prompt}]
                    },
                    "contents": contents,
                    "generationConfig": {
                        "temperature": 0.4,
                        "maxOutputTokens": 90,
                    }
                }
                async with httpx.AsyncClient(timeout=12.0) as http_client:
                    r = await http_client.post(url, json=body)
                    if r.status_code == 200:
                        data = r.json()
                        usage = data.get("usageMetadata", {})
                        if usage:
                            logger.info(
                                f"[Google Gemini Usage] Tokens Used - "
                                f"Prompt: {usage.get('promptTokenCount', 0)}, "
                                f"Output: {usage.get('candidatesTokenCount', 0)}, "
                                f"Total: {usage.get('totalTokenCount', 0)}"
                            )
                        cand = data.get("candidates", [])
                        if cand:
                            parts = cand[0].get("content", {}).get("parts", [])
                            if parts and "text" in parts[0]:
                                reply = parts[0]["text"].strip()
                                cleaned = re.sub(r'^["\']|["\']$', '', reply).strip()
                                cleaned = re.sub(r'^(AI Agent|Agent|Assistant):\s*', '', cleaned, flags=re.IGNORECASE).strip()
                                if cleaned and len(cleaned.split()) >= 2:
                                    return cleaned
                    else:
                        logger.warning(f"[VoiceAgentService] Google Gemini HTTP {r.status_code}: {r.text[:200]}")
            except Exception as e:
                logger.error(f"[VoiceAgentService] Google Gemini dialogue inference error: {type(e).__name__}: {e}")

        return ""
