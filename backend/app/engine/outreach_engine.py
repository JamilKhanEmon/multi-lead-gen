import os
import random
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List

from app.core.logging import logger

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

    POSITIVE_KEYWORDS = [
        "interested", "tell me more", "call", "schedule", "pricing", "quote",
        "meeting", "send details", "let's talk", "lets talk", "sure", "sounds good",
        "yes", "demo", "cost", "more info", "available", "zoom"
    ]

    NEGATIVE_KEYWORDS = [
        "unsubscribe", "remove", "stop", "not interested", "dont contact",
        "don't contact", "leave me alone", "spam", "wrong person", "cease"
    ]

    @classmethod
    def render_email(cls, step: int, lead_data: Dict[str, Any]) -> Tuple[str, str]:
        company_name = lead_data.get("company_name") or "Your Team"
        contact_person = lead_data.get("contact_person") or "there"
        city = lead_data.get("city") or "your area"
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

            replacements = {
                "{{company_name}}": company_name,
                "{{business_name}}": company_name,
                "{{contact_person}}": contact_person,
                "{{location}}": city,
                "{{address}}": city,
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
                "{city}": city,
                "{primary_gap}": primary_gap,
                "{sender_name}": sender_name,
                "{sender_title}": sender_title,
                "{sender_company}": sender_company,
            }
            for tag, val in replacements.items():
                subj = subj.replace(tag, str(val))
                bdy = bdy.replace(tag, str(val))
            return subj, bdy

        if any(w in industry for w in ["dental", "clinic", "health", "medical", "doctor", "care"]):
            value_pitch = "increase direct patient bookings and modernize your digital inquiry capture"
            call_to_action = f"preview the patient acquisition audit we prepared specifically for {company_name}"
        elif any(w in industry for w in ["real estate", "property", "developer", "realty", "builder"]):
            value_pitch = "capture high-ticket property buyers and instantly qualify inquiry leads"
            call_to_action = f"see the tailored property buyer funnel recommendations for {company_name}"
        elif any(w in industry for w in ["restaurant", "cafe", "food", "dining", "catering"]):
            value_pitch = "drive direct table reservations and WhatsApp customer inquiries without intermediary commissions"
            call_to_action = f"check out the digital reservation flow we modeled for {company_name}"
        elif any(w in industry for w in ["roofing", "contractor", "plumbing", "hvac", "solar", "construction"]):
            value_pitch = "convert local emergency searchers into high-margin estimate requests"
            call_to_action = f"see the estimate capture analysis we put together for {company_name}"
        elif any(w in industry for w in ["law", "legal", "attorney", "accounting", "consulting"]):
            value_pitch = "enhance client trust and capture premium retainer consultations"
            call_to_action = f"review the client intake optimization audit for {company_name}"
        else:
            value_pitch = "resolve key conversion bottlenecks and significantly increase your monthly inbound client inquiries"
            call_to_action = f"see the free growth audit report we prepared for {company_name}"

        if step == 2:
            subject = f"Following up: Growth opportunity for {company_name}"
            body = (
                f"Hi {contact_person},\n\n"
                f"Just following up on my previous note regarding {company_name}. I know you're busy managing operations in {city}.\n\n"
                f"Did you have a chance to review our observation regarding {primary_gap}?\n\n"
                f"We help businesses in your space {value_pitch}. Happy to email over a concise 1-page summary if that's more convenient.\n\n"
                f"{sig_block}"
            )
        elif step == 3:
            subject = f"Permission to close your file, {contact_person}?"
            body = (
                f"Hi {contact_person},\n\n"
                f"I haven't heard back, so I assume addressing {primary_gap} isn't an active priority for {company_name} right now.\n\n"
                f"I won't take up any more of your time. If you ever want to explore modernizing this in the future to {value_pitch}, feel free to reach out anytime.\n\n"
                f"Wishing {company_name} continued success!\n\n"
                f"{sig_block}"
            )
        else:
            subject = f"Quick question regarding {company_name} ({city})"
            body = (
                f"Hi {contact_person},\n\n"
                f"I was researching established businesses in {city} and came across {company_name}.\n\n"
                f"While reviewing your digital touchpoints online, I noticed a key opportunity regarding {primary_gap}.\n\n"
                f"We recently helped similar businesses in your industry {value_pitch} by over 30% within 48 hours.\n\n"
                f"Would you be open to a brief 3-minute chat this week to {call_to_action}?\n\n"
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
        db: Optional[Any] = None
    ) -> Tuple[bool, str]:
        inboxes = await cls.get_active_inboxes(db=db)

        if dry_run or not inboxes:
            logger.info(f"[OUTREACH SIMULATOR] Dispatching to {recipient_email} | Subject: '{subject}' | (Simulated 200 OK)")
            await asyncio.sleep(0.5)
            return True, "Simulated delivery successful (Dry-Run Mode)"

        # Randomly choose one active inbox from available inboxes for load balancing
        selected_inbox = random.choice(inboxes)

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
    def classify_reply_sentiment(cls, reply_text: str) -> Tuple[str, str]:
        if not reply_text:
            return "NEUTRAL", "Empty reply content"

        clean = reply_text.lower()

        for neg in cls.NEGATIVE_KEYWORDS:
            if neg in clean:
                return "NEGATIVE", f"Opt-out or negative intent detected: '{neg}'"

        for pos in cls.POSITIVE_KEYWORDS:
            if pos in clean:
                return "POSITIVE", f"Hot lead interest signal detected: '{pos}'"

        return "NEUTRAL", "General response or inquiry"
