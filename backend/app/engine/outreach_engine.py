import os
import random
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List

from app.core.logging import logger

class ClassificationResult(tuple):
    """
    Tuple subclass (label, reason) that also exposes .source ('OPENCLAW' | 'RULE_LOGIC').
    Maintains 100% backward compatibility with 2-element tuple unpacking:
      label, reason = await OutreachEngine.classify_reply_sentiment(...)
    while allowing callers to read res.source for dashboard display.
    """
    label: str
    reason: str
    source: str

    def __new__(cls, label: str, reason: str, source: str = "OPENCLAW"):
        instance = super().__new__(cls, (label, reason))
        instance.label = label
        instance.reason = reason
        instance.source = source
        return instance

class OutreachEngine:

    INBOX_STATS = {}
    _inbox_index = 0

    TEMPLATES = {
        1: {
            "name": "Step 1: Strategic Initial Pitch",
            "subject": "Quick question regarding {company_name} ({city})",
            "body": (
                "Hi {contact_person},\n\n"
                "I was researching top businesses in {city} and came across {company_name}.\n\n"
                "While reviewing your website, I noticed a key growth opportunity regarding {primary_gap}.\n\n"
                "We recently helped a similar company in your industry address this and increase their monthly inbound inquiries by over 30%.\n\n"
                "Would you be open to a brief 5-minute chat this Thursday to see the free audit report we prepared for {company_name}?\n\n"
                "Best regards,\n\n"
                "{sender_name}\n"
                "{sender_title}\n"
                "{sender_company}"
            )
        },
        2: {
            "name": "Step 2: Gentle Follow-up (Day 4)",
            "subject": "Following up: Growth opportunity for {company_name}",
            "body": (
                "Hi {contact_person},\n\n"
                "Just following up on my previous note regarding {company_name}. I know you're busy managing operations in {city}.\n\n"
                "Did you have a chance to review our observation regarding {primary_gap}?\n\n"
                "Happy to email over a concise 1-page summary if that's more convenient.\n\n"
                "Best regards,\n\n"
                "{sender_name}\n"
                "{sender_title}\n"
                "{sender_company}"
            )
        },
        3: {
            "name": "Step 3: Final Break-up (Day 8)",
            "subject": "Permission to close your file, {contact_person}?",
            "body": (
                "Hi {contact_person},\n\n"
                "I haven't heard back, so I assume addressing {primary_gap} isn't an active priority for {company_name} right now.\n\n"
                "I won't take up any more of your time. If you ever want to explore modernizing this in the future, feel free to reach out anytime.\n\n"
                "Wishing {company_name} continued success!\n\n"
                "Warm regards,\n\n"
                "{sender_name}\n"
                "{sender_title}\n"
                "{sender_company}"
            )
        }
    }

    # ── LLM-based classification — no keyword lists needed ──────────────────

    @classmethod
    def render_email(cls, step: int, lead_data: Dict[str, Any]) -> Tuple[str, str]:
        company_name = lead_data.get("company_name") or "Your Team"
        raw_contact = str(lead_data.get("contact_person") or "").strip()
        if raw_contact and raw_contact.lower() not in ["there", "sir", "madam", "n/a", "none", "unknown", "team"]:
            contact_person = raw_contact
        else:
            contact_person = f"Team {company_name}"

        raw_city = str(lead_data.get("city") or lead_data.get("location") or lead_data.get("address") or "").strip()
        has_real_city = bool(raw_city and raw_city.lower() not in ["your area", "your city", "your office in your city", "n/a", "none", "unknown", ""])
        city = raw_city if has_real_city else ""
        primary_gap = lead_data.get("primary_gap") or "optimizing your online presence and client acquisition"
        industry = (lead_data.get("industry") or lead_data.get("business_type") or "").lower()

        personas = lead_data.get("personas") or []
        sig_block = ""
        if personas:
            p = personas[hash(company_name) % len(personas)]
            if isinstance(p, dict):
                raw_sig = p.get("raw_content") or p.get("raw_signature") or ""
                if not raw_sig and (p.get("name") or p.get("title")):
                    raw_sig = f"{p.get('name', '')}\n{p.get('title', '')}\n{p.get('company', '')}".strip()
                sig_block = raw_sig.strip()
                sender_name = p.get("name") or ""
                sender_title = p.get("title") or ""
                sender_company = p.get("company") or os.getenv("COMPANY_NAME", "")
            else:
                raw_sig = getattr(p, "raw_content", "") or ""
                if not raw_sig and hasattr(p, "render_signature"):
                    raw_sig = p.render_signature()
                elif not raw_sig and (getattr(p, "name", None) or getattr(p, "title", None)):
                    raw_sig = f"{getattr(p, 'name', '')}\n{getattr(p, 'title', '')}\n{getattr(p, 'company', '')}".strip()
                sig_block = raw_sig.strip()
                sender_name = getattr(p, "name", "")
                sender_title = getattr(p, "title", "")
                sender_company = getattr(p, "company", os.getenv("COMPANY_NAME", ""))
        else:
            sender_name = lead_data.get("sender_name") or os.getenv("SMTP_FROM_NAME") or ""
            if str(sender_name).strip().lower() == "test":
                sender_name = ""
            sender_title = lead_data.get("sender_title") or ""
            sender_company = lead_data.get("sender_company") or os.getenv("COMPANY_NAME") or ""
            sig_lines = [s for s in [sender_name, sender_title, sender_company] if s]
            sig_block = lead_data.get("signature_text") or ("\n".join(sig_lines) if sig_lines else "")

        custom_tpl = lead_data.get("custom_template")
        if custom_tpl and step == 1:
            subj = custom_tpl.get("subject") if isinstance(custom_tpl, dict) else getattr(custom_tpl, "subject", "")
            bdy = custom_tpl.get("body") if isinstance(custom_tpl, dict) else getattr(custom_tpl, "body", "")
            
            if not sig_block and hasattr(custom_tpl, "render_signature"):
                sig_block = custom_tpl.render_signature()

            if not sig_block or sig_block.strip().lower() == "test":
                sig_lines = [s for s in [sender_name, sender_title, sender_company] if s]
                sig_block = "\n".join(sig_lines) if sig_lines else ""

            # Clean location in subject/body if no real city is detected
            if not has_real_city:
                subj = subj.replace(" in {{location}}", f" - {company_name}").replace(" in {city}", f" - {company_name}")
                subj = subj.replace("{{location}}", company_name).replace("{city}", company_name)
                bdy = bdy.replace(" located in {{location}}", "").replace(" in {{location}}", "")
                bdy = bdy.replace(" located in {city}", "").replace(" in {city}", "")
                bdy = bdy.replace("{{location}}", company_name).replace("{city}", company_name)
            else:
                subj = subj.replace("{{location}}", city).replace("{city}", city)
                bdy = bdy.replace("{{location}}", city).replace("{city}", city)

            # Prevent robotic "Dear there" greeting leaks
            bdy = bdy.replace("Dear there,", f"Hi {contact_person},").replace("Dear there", f"Hi {contact_person}")
            bdy = bdy.replace("Dear {{contact_person}}", f"Hi {contact_person}")

            replacements = {
                "{{company_name}}": company_name,
                "{{business_name}}": company_name,
                "{{contact_person}}": contact_person,
                "{{address}}": city or company_name,
                "{{website}}": lead_data.get("website") or "",
                "{{domain}}": lead_data.get("website") or "",
                "{{phone}}": lead_data.get("phone") or "",
                "{{primary_gap}}": f" ({primary_gap})" if primary_gap else "",
                "{{why_they_need_us}}": lead_data.get("why_they_need_us") or primary_gap,
                "{{what_they_need}}": lead_data.get("what_they_need") or "",
                "{{matched_service}}": lead_data.get("matched_service") or "",
                "{{signature}}": sig_block,
                "{{sender_name}}": sender_name,
                "{{sender_title}}": sender_title,
                "{{sender_company}}": sender_company,
                "{company_name}": company_name,
                "{contact_person}": contact_person,
                "{primary_gap}": primary_gap,
                "{sender_name}": sender_name,
                "{sender_title}": sender_title,
                "{sender_company}": sender_company,
            }
            for tag, val in replacements.items():
                subj = subj.replace(tag, str(val))
                bdy = bdy.replace(tag, str(val))
            
            # Post-cleanup: Remove accidental double placeholders or punctuation
            subj = subj.replace("in your city", company_name).replace("your city", company_name).strip()
            bdy = bdy.replace("in your city", f"in {city}" if has_real_city else "").replace("..).", ".)")
            return subj, bdy

        if any(w in industry for w in ["dental", "clinic", "health", "medical", "doctor", "care"]):
            value_pitch = "increase direct patient bookings and modernize your digital inquiry capture"
        matched_svc = lead_data.get("matched_service") or ""
        has_no_website = bool("Zero official website" in str(primary_gap) or "NO_WEBSITE" in str(lead_data.get("why_they_need_us") or ""))

        if has_no_website:
            value_pitch = f"launch a high-converting branded website and automated client inquiry portal tailored for your {industry or 'business'}"
            call_to_action = f"see the live interactive software demo and portal prototype we modeled for {company_name}"
        elif any(w in industry for w in ["clinic", "doctor", "dental", "dentist", "healthcare", "therapy"]):
            value_pitch = f"streamline patient bookings and automate appointment coordination with {matched_svc or 'custom clinic software'}"
            call_to_action = f"see a 5-minute interactive live software demo and patient acquisition system for {company_name}"
        elif any(w in industry for w in ["real estate", "property", "developer", "realty", "builder"]):
            value_pitch = f"capture high-intent property buyers and automate lead follow-ups with {matched_svc or 'custom real estate CRM software'}"
            call_to_action = f"walk through a 5-minute interactive live software demo and buyer acquisition funnel for {company_name}"
        elif any(w in industry for w in ["restaurant", "cafe", "food", "dining", "catering"]):
            value_pitch = f"drive direct table reservations and WhatsApp customer inquiries with {matched_svc or 'automated ordering software'}"
            call_to_action = f"check out the 5-minute live software demo we modeled for {company_name}"
        elif any(w in industry for w in ["roofing", "contractor", "plumbing", "hvac", "solar", "construction"]):
            value_pitch = f"convert local project inquiries and automate quotes with {matched_svc or 'contractor management software'}"
            call_to_action = f"see the 5-minute live software demonstration prepared for {company_name}"
        else:
            value_pitch = f"automate client acquisition and eliminate manual operational delays with {matched_svc or 'specialized growth software'}"
            call_to_action = f"review a brief 5-minute interactive live software demo prepared for {company_name}"

        if step == 2:
            subject = f"Following up: Live Demo & Solution for {company_name}"
            body = (
                f"Hi {contact_person},\n\n"
                f"Just following up on my previous note regarding {company_name}. I know you're busy managing operations in {city}.\n\n"
                f"We specialize in helping businesses in your space {value_pitch}.\n\n"
                f"Would you be open to a quick 5-minute chat this week to walk through the live demo, or would you prefer a concise 1-page overview by email?\n\n"
                f"{sig_block}"
            )
        elif step == 3:
            subject = f"Permission to close your file, {contact_person}?"
            body = (
                f"Hi {contact_person},\n\n"
                f"I haven't heard back, so I assume modernizing systems to {value_pitch} isn't an active priority for {company_name} right now.\n\n"
                f"I won't take up any more of your time. If you ever want to see the interactive demo in the future, feel free to reach out anytime.\n\n"
                f"Wishing {company_name} continued success!\n\n"
                f"{sig_block}"
            )
        else:
            subject = f"Quick question regarding {company_name} ({city})"
            body = (
                f"Hi {contact_person},\n\n"
                f"I was researching top businesses in {city} and came across {company_name}.\n\n"
                f"We develop specialized systems and marketing solutions to help companies in your industry {value_pitch}.\n\n"
                f"We currently have a ready 5-minute interactive live software demo showcasing exactly how this works.\n\n"
                f"Would you be open to a brief 5-minute call this Thursday to {call_to_action}?\n\n"
                f"{sig_block}"
            )

        return subject, body

    @classmethod
    def get_dynamic_iana_timezone(
        cls,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        country: Optional[str] = None,
        city: Optional[str] = None
    ) -> str:
        if lat is not None and lon is not None and (lat != 0 or lon != 0):
            try:
                from timezonefinder import TimezoneFinder
                tf = TimezoneFinder()
                tz_str = tf.timezone_at(lat=float(lat), lng=float(lon))
                if tz_str:
                    return tz_str
            except Exception:
                pass

        text_search = f"{city or ''} {country or ''}".strip().lower()
        if any(k in text_search for k in ["new york", "usa", "us", "united states", "florida", "est"]):
            return "America/New_York"
        elif any(k in text_search for k in ["los angeles", "california", "pst"]):
            return "America/Los_Angeles"
        elif any(k in text_search for k in ["chicago", "texas", "cst"]):
            return "America/Chicago"
        elif any(k in text_search for k in ["london", "uk", "united kingdom", "england", "gb"]):
            return "Europe/London"
        elif any(k in text_search for k in ["paris", "france", "germany", "berlin", "spain", "italy"]):
            return "Europe/Paris"
        elif any(k in text_search for k in ["dubai", "uae", "united arab emirates", "abu dhabi"]):
            return "Asia/Dubai"
        elif any(k in text_search for k in ["riyadh", "saudi"]):
            return "Asia/Riyadh"
        elif any(k in text_search for k in ["tokyo", "japan"]):
            return "Asia/Tokyo"
        elif any(k in text_search for k in ["sydney", "australia", "melbourne"]):
            return "Australia/Sydney"
        elif any(k in text_search for k in ["toronto", "canada"]):
            return "America/Toronto"

        return "Asia/Dhaka"

    @classmethod
    def is_within_target_business_hours(
        cls,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        country: Optional[str] = None,
        city: Optional[str] = None
    ) -> Tuple[bool, str]:
        from zoneinfo import ZoneInfo

        iana_tz = cls.get_dynamic_iana_timezone(lat=lat, lon=lon, country=country, city=city)
        try:
            target_time = datetime.now(ZoneInfo(iana_tz))
        except Exception:
            target_time = datetime.now(timezone.utc) + timedelta(hours=6)

        weekday = target_time.weekday()
        hour = target_time.hour
        minute = target_time.minute

        is_middle_east = iana_tz.startswith("Asia/Dubai") or iana_tz.startswith("Asia/Riyadh") or iana_tz.startswith("Asia/Qatar")
        if is_middle_east:
            if weekday in (4, 5):
                return False, f"Target Location Weekend ({target_time.strftime('%A')} in {iana_tz})"
        else:
            if weekday in (5, 6):
                return False, f"Target Location Weekend ({target_time.strftime('%A')} in {iana_tz})"

        current_minutes = hour * 60 + minute
        start_minutes = 9 * 60
        end_minutes = 17 * 60 + 30

        if not (start_minutes <= current_minutes <= end_minutes):
            return False, f"Outside Target Office Hours ({target_time.strftime('%I:%M %p %Z')} in {iana_tz})"

        return True, f"Within Target Office Hours ({target_time.strftime('%I:%M %p %A %Z')} in {iana_tz})"

    @classmethod
    def is_within_business_hours(cls, target_timezone_offset_hours: int = 6) -> bool:
        is_ok, _ = cls.is_within_target_business_hours(country=None, city=None)
        return is_ok

    @classmethod
    async def get_active_inboxes(cls, db: Optional[Any] = None) -> List[Dict[str, Any]]:
        """
        Dynamically fetches active SMTP inboxes configured in the Admin database.
        Filters out inboxes that have reached their daily limit.
        Falls back to .env configuration if no database inboxes are found.
        """
        from app.models.email_template import SMTPInbox
        from sqlalchemy import select

        raw_inboxes = []
        try:
            if db is not None:
                stmt = select(SMTPInbox).where(SMTPInbox.is_active == True)
                res = await db.execute(stmt)
                raw_inboxes = res.scalars().all()
            else:
                from app.db.session import AsyncSessionLocal
                async with AsyncSessionLocal() as session:
                    stmt = select(SMTPInbox).where(SMTPInbox.is_active == True)
                    res = await session.execute(stmt)
                    raw_inboxes = res.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching active SMTP inboxes from DB: {e}")

        # Seed in-memory INBOX_STATS from today's persistent DB logs
        try:
            from app.models.autopilot import EmailOutreachLog
            now_utc = datetime.now(timezone.utc)
            t_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc)
            s_stmt = select(EmailOutreachLog).where(
                EmailOutreachLog.sent_at >= t_start,
                EmailOutreachLog.status.in_(["SENT", "MANUAL_REPLY_SENT", "DELIVERED"])
            )
            if db is not None:
                p_logs = (await db.execute(s_stmt)).scalars().all()
            else:
                from app.db.session import AsyncSessionLocal
                async with AsyncSessionLocal() as s_sess:
                    p_logs = (await s_sess.execute(s_stmt)).scalars().all()

            for ib in raw_inboxes:
                ib_str = str(ib.id)
                db_c = sum(1 for l in p_logs if ib_str in (l.error_message or "") or (ib.from_email and ib.from_email.lower() in (l.error_message or "").lower()))
                cls.INBOX_STATS[ib_str] = max(cls.INBOX_STATS.get(ib_str, 0), db_c)
        except Exception:
            pass

        available_inboxes = []
        for ib in raw_inboxes:
            sent_today = cls.INBOX_STATS.get(str(ib.id), 0)
            if sent_today < ib.daily_limit:
                available_inboxes.append({
                    "id": str(ib.id),
                    "host": ib.host,
                    "port": ib.port,
                    "user": ib.username,
                    "password": ib.password,
                    "from_email": ib.from_email,
                    "from_name": ib.from_name,
                    "daily_limit": ib.daily_limit
                })

        # If all hit daily limit, fallback to active ones
        if not available_inboxes and raw_inboxes:
            for ib in raw_inboxes:
                available_inboxes.append({
                    "id": str(ib.id),
                    "host": ib.host,
                    "port": ib.port,
                    "user": ib.username,
                    "password": ib.password,
                    "from_email": ib.from_email,
                    "from_name": ib.from_name,
                    "daily_limit": ib.daily_limit
                })

        # Backward compatibility fallback
        if not available_inboxes:
            available_inboxes = cls.get_active_smtp_inboxes()

        return available_inboxes

    @classmethod
    async def is_smtp_configured(cls, db: Optional[Any] = None) -> bool:
        inboxes = await cls.get_active_inboxes(db=db)
        return len(inboxes) > 0

    @classmethod
    def get_active_smtp_inboxes(cls) -> List[Dict[str, Any]]:
        inboxes = []
        try:
            from app.core.config import settings
            base_host = settings.SMTP_HOST or os.getenv("SMTP_HOST")
            base_user = settings.SMTP_USER or os.getenv("SMTP_USER")
            base_pass = settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD")
            base_port = settings.SMTP_PORT or int(os.getenv("SMTP_PORT", "587"))
            base_from = settings.SMTP_FROM_EMAIL or os.getenv("SMTP_FROM_EMAIL", base_user or "")
            base_name = settings.SMTP_FROM_NAME or os.getenv("SMTP_FROM_NAME", "")
        except Exception:
            base_host = os.getenv("SMTP_HOST")
            base_user = os.getenv("SMTP_USER")
            base_pass = os.getenv("SMTP_PASSWORD")
            base_port = int(os.getenv("SMTP_PORT", "587"))
            base_from = os.getenv("SMTP_FROM_EMAIL", base_user or "")
            base_name = os.getenv("SMTP_FROM_NAME", "")

        if base_host and base_user:
            inboxes.append({
                "id": 1,
                "host": base_host,
                "port": base_port,
                "user": base_user,
                "password": base_pass,
                "from_email": base_from,
                "from_name": base_name,
                "daily_limit": 30
            })

        for i in range(2, 21):
            h = os.getenv(f"SMTP_HOST_{i}")
            u = os.getenv(f"SMTP_USER_{i}")
            p = os.getenv(f"SMTP_PASSWORD_{i}")
            port = int(os.getenv(f"SMTP_PORT_{i}", "587"))
            fe = os.getenv(f"SMTP_FROM_EMAIL_{i}", u or "")
            fn = os.getenv(f"SMTP_FROM_NAME_{i}", os.getenv("SMTP_FROM_NAME", ""))

            if h and u:
                inboxes.append({
                    "id": i,
                    "host": h,
                    "port": port,
                    "user": u,
                    "password": p,
                    "from_email": fe,
                    "from_name": fn,
                    "daily_limit": 30
                })

        return inboxes

    @classmethod
    async def dispatch_smtp_email(
        cls,
        recipient_email: str,
        subject: str,
        body: str,
        dry_run: bool = False,
        db: Optional[Any] = None,
        account_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        inboxes = await cls.get_active_inboxes(db=db)

        if not inboxes:
            inboxes = cls.get_active_smtp_inboxes()

        if dry_run or not inboxes:
            logger.info(f"[OUTREACH SIMULATOR] Dispatching to {recipient_email} | Subject: '{subject}' | (Simulated 200 OK)")
            await asyncio.sleep(0.5)
            return True, "Simulated delivery successful (Dry-Run Mode)"

        selected_inbox = None
        if account_id:
            selected_inbox = next((ib for ib in inboxes if str(ib.get("id")) == str(account_id)), None)
            if not selected_inbox:
                selected_inbox = next((ib for ib in inboxes if str(ib.get("from_email")) == str(account_id) or str(ib.get("user")) == str(account_id)), None)

        # Sequential Round-Robin sequence to preserve sender reputation across inboxes
        if not selected_inbox and inboxes:
            selected_inbox = inboxes[cls._inbox_index % len(inboxes)]
            cls._inbox_index = (cls._inbox_index + 1) % len(inboxes)

        smtp_host = selected_inbox["host"]
        smtp_port = selected_inbox["port"]
        smtp_user = selected_inbox["user"]
        smtp_pass = selected_inbox["password"]
        from_email = selected_inbox["from_email"]
        from_name = selected_inbox["from_name"]

        inbox_id = str(selected_inbox["id"])
        cls.INBOX_STATS[inbox_id] = cls.INBOX_STATS.get(inbox_id, 0) + 1

        loop = asyncio.get_running_loop()

        def _send():
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{from_name} <{from_email}>"
                msg["To"] = recipient_email
                msg.attach(MIMEText(body, "plain"))

                if smtp_port == 465:
                    server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
                else:
                    server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                    server.starttls()

                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)

                server.sendmail(from_email, [recipient_email], msg.as_string())
                server.quit()
                return True, f"Sent via SMTP Inbox #{inbox_id} ({from_email}) successfully"
            except Exception as e:
                logger.error(f"SMTP Dispatch Error (Inbox #{inbox_id}) to {recipient_email}: {e}")
                return False, str(e)

        return await loop.run_in_executor(None, _send)

    @classmethod
    async def classify_reply_sentiment(cls, reply_text: str) -> ClassificationResult:
        """
        Reply intent classifier with dual-engine intelligence:
          1. Tries OpenClaw AI first (OpenClaw's active LLM agent via WebSocket / API).
          2. If OpenClaw is offline or fails, falls back instantly to deterministic Rule Logic.
        Returns a ClassificationResult exposing label, reason, and source ('OPENCLAW' | 'RULE_LOGIC').
        """
        if not reply_text or not reply_text.strip():
            return ClassificationResult("NEUTRAL", "Empty reply — no content to classify", "RULE_LOGIC")

        clean = reply_text.strip().lower()

        # ── 1. Try OpenClaw AI Deep Reasoning First ───────────────────────────
        try:
            from app.services.ai_client import AIClient

            system_prompt = (
                "You are an expert B2B sales reply analyzer. "
                "Your job is to read a reply to a cold outreach email and classify the prospect's intent.\n\n"
                "Classification rules:\n"
                "- HOT_LEAD: The prospect shows genuine interest. They ask about pricing, want a call/demo, "
                "ask for more details, say yes/sure/sounds good, or want to schedule something.\n"
                "- NEUTRAL: The prospect is neither clearly interested nor rejecting. "
                "They say 'maybe later', 'let me think', ask a generic question, or give a non-committal response.\n"
                "- REJECTED: The prospect clearly does not want further contact. "
                "They say not interested, no needed, unsubscribe, stop, wrong person, leave me alone, spam, or similar.\n\n"
                "Important: Understand full context, not just keywords. Sarcasm, politeness, and ambiguity should be handled intelligently.\n\n"
                "Respond ONLY with a valid JSON object in this exact format:\n"
                '{"label": "HOT_LEAD" | "NEUTRAL" | "REJECTED", "reason": "one concise sentence explaining why"}'
            )

            user_prompt = (
                f"Classify the intent of this cold email reply:\n\n"
                f"---\n{reply_text.strip()[:1500]}\n---"
            )

            ai = AIClient(timeout=12.0)
            result = await ai.analyze(system_prompt=system_prompt, user_prompt=user_prompt)

            if isinstance(result, dict) and result.get("label"):
                source = result.get("_source", "OPENCLAW")
                # If it was actually evaluated by OpenClaw / Cloud LLM
                if source != "RULE_LOGIC":
                    label = str(result.get("label", "")).strip().upper()
                    reason = str(result.get("reason", "OpenClaw AI classification")).strip()
                    if label in ("HOT_LEAD", "NEUTRAL", "REJECTED"):
                        logger.info(f"[OpenClaw AI Classifier] Result: {label} | Reason: {reason} (Engine: {source})")
                        return ClassificationResult(label, reason, "OPENCLAW")

        except Exception as e:
            logger.warning(f"[Reply Classifier] OpenClaw AI unreachable or failed ({e}). Falling back to Rule Logic.")

        # ── 2. Fallback: High-Precision Semantic Pattern Matching & Rule Logic ──
        try:
            logger.info("[Reply Classifier] Executing Deterministic Rule Logic Engine.")

            # Check for explicit rejections
            rejection_indicators = [
                "no needed", "not needed", "no need", "dont need", "don't need", "doesn't need", "does not need",
                "not interested", "no thanks", "no thank you", "no, thanks", "no, thank you",
                "unsubscribe", "remove me", "take me off", "stop emailing", "please stop",
                "do not contact", "dont contact", "don't contact", "leave me alone",
                "never email", "wrong person", "wrong email", "not looking", "not required",
                "not for us", "we already have", "we have a vendor", "we have someone",
                "opt out", "spam", "please remove", "cease and desist"
            ]
            for indicator in rejection_indicators:
                if indicator in clean:
                    logger.info(f"[Rule Logic Classifier] Matched REJECTED on: '{indicator}'")
                    return ClassificationResult("REJECTED", f"Prospect explicitly declined ('{indicator}')", "RULE_LOGIC")

            # Check for explicit positive interest
            hot_indicators = [
                "great, i want to talk", "i want to talk", "want to talk", "call me",
                "let's talk", "lets talk", "let's chat", "lets chat",
                "interested", "schedule a call", "schedule a demo", "send pricing",
                "how much", "what is the price", "what is the cost",
                "send details", "send more info", "tell me more", "share details",
                "sounds good", "yes please", "yes, please", "sure, send", "book a demo",
                "send a proposal", "send quote", "free to talk", "available for a call",
                "let's connect", "lets connect"
            ]
            for indicator in hot_indicators:
                if indicator in clean:
                    logger.info(f"[Rule Logic Classifier] Matched HOT_LEAD on: '{indicator}'")
                    return ClassificationResult("HOT_LEAD", f"Prospect showed clear interest ('{indicator}')", "RULE_LOGIC")

            return ClassificationResult("NEUTRAL", "Prospect reply is neutral / non-committal", "RULE_LOGIC")

        except Exception as fallback_err:
            logger.error(f"[Reply Classifier] Rule engine fail-safe triggered: {fallback_err}")
            # Ultimate safeguard: treat as NEUTRAL so email is safely preserved in inbox
            return ClassificationResult("NEUTRAL", "Safe default: Review manually in inbox", "RULE_LOGIC")
