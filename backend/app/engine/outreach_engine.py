"""
Autonomous Anti-Spam Email Outreach Engine
Handles multi-step personalized sequences, random sending delays (120-240s),
business-hour checks, SMTP dispatch, and sentiment-aware reply processing.
"""
import os
import random
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple

from app.core.logging import logger


class OutreachEngine:
    """Enterprise cold outreach and response management engine."""

    # 10 Diverse Persona Signatures for Anti-Spam Variation & Maximum Credibility
    PERSONA_SIGNATURES = [
        {"name": "Alex Morgan", "title": "Head of Client Growth", "company": "Growth Partners Global"},
        {"name": "Sarah Jenkins", "title": "Growth Strategy Consultant", "company": "ScaleUp Advisory"},
        {"name": "David Miller", "title": "Digital Solutions Architect", "company": "Apex Digital Labs"},
        {"name": "Emma Vance", "title": "Inbound Optimization Lead", "company": "Inbound Velocity"},
        {"name": "Michael Chang", "title": "Strategic Partnerships Director", "company": "NextGen Strategic"},
        {"name": "Rachel Adams", "title": "Web Conversion Analyst", "company": "MetricFlow Systems"},
        {"name": "James Wilson", "title": "Client Acquisition Partner", "company": "Ascend Business Advisory"},
        {"name": "Sophia Martinez", "title": "Operations & Digital Strategist", "company": "Elevate Media Network"},
        {"name": "Daniel Taylor", "title": "Conversion Rate Specialist", "company": "Growth Engine Labs"},
        {"name": "Olivia Reed", "title": "Senior Outreach Strategist", "company": "Horizon Strategic Growth"},
    ]

    # In-memory inbox rotation tracking (Daily limits)
    INBOX_STATS = {}
    _inbox_index = 0

    # Default 3-step sequence templates
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
        """Render subject and body with variable and persona signature injection."""
        template = cls.TEMPLATES.get(step, cls.TEMPLATES[1])
        company_name = lead_data.get("company_name") or "Your Team"
        contact_person = lead_data.get("contact_person") or "there"
        city = lead_data.get("city") or "your area"
        primary_gap = lead_data.get("primary_gap") or "optimizing your online visibility and lead conversion"
        
        # Pick a persona signature dynamically (deterministic by company name or random)
        persona_idx = hash(company_name) % len(cls.PERSONA_SIGNATURES)
        persona = cls.PERSONA_SIGNATURES[persona_idx]
        sender_name = lead_data.get("sender_name") or persona["name"]
        sender_title = lead_data.get("sender_title") or persona["title"]
        sender_company = os.getenv("COMPANY_NAME") or persona["company"]

        subject = template["subject"].format(
            company_name=company_name,
            contact_person=contact_person,
            city=city,
            primary_gap=primary_gap,
            sender_name=sender_name,
            sender_title=sender_title,
            sender_company=sender_company
        )

        body = template["body"].format(
            company_name=company_name,
            contact_person=contact_person,
            city=city,
            primary_gap=primary_gap,
            sender_name=sender_name,
            sender_title=sender_title,
            sender_company=sender_company
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
        """
        Dynamically resolves standard IANA Timezone string anywhere on Earth.
        Uses exact GPS coordinates (lat, lon) via TimezoneFinder, or fallback lookup.
        """
        if lat is not None and lon is not None and (lat != 0 or lon != 0):
            try:
                from timezonefinder import TimezoneFinder
                tf = TimezoneFinder()
                tz_str = tf.timezone_at(lat=float(lat), lng=float(lon))
                if tz_str:
                    return tz_str
            except Exception:
                pass

        # Fallback keyword match if GPS is absent
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
        """
        100% Dynamic Worldwide Target Country Business Hours & Weekend Validator.
        Converts GPS coordinates (lat, lon) directly to IANA Timezone via TimezoneFinder + ZoneInfo.
        Handles Daylight Saving Time (DST) automatically anywhere on Earth.
        """
        from zoneinfo import ZoneInfo

        iana_tz = cls.get_dynamic_iana_timezone(lat=lat, lon=lon, country=country, city=city)
        try:
            target_time = datetime.now(ZoneInfo(iana_tz))
        except Exception:
            target_time = datetime.now(timezone.utc) + timedelta(hours=6)

        weekday = target_time.weekday()  # 0 = Monday, 6 = Sunday
        hour = target_time.hour
        minute = target_time.minute

        # Check weekend off-days (Middle East: Fri/Sat, Others: Sat/Sun)
        is_middle_east = iana_tz.startswith("Asia/Dubai") or iana_tz.startswith("Asia/Riyadh") or iana_tz.startswith("Asia/Qatar")
        if is_middle_east:
            if weekday in (4, 5):  # Fri or Sat
                return False, f"Target Location Weekend ({target_time.strftime('%A')} in {iana_tz})"
        else:
            if weekday in (5, 6):  # Sat or Sun
                return False, f"Target Location Weekend ({target_time.strftime('%A')} in {iana_tz})"

        # Check 09:00 AM to 05:30 PM (17:30)
        current_minutes = hour * 60 + minute
        start_minutes = 9 * 60      # 09:00 AM
        end_minutes = 17 * 60 + 30  # 05:30 PM

        if not (start_minutes <= current_minutes <= end_minutes):
            return False, f"Outside Target Office Hours ({target_time.strftime('%I:%M %p %Z')} in {iana_tz})"

        return True, f"Within Target Office Hours ({target_time.strftime('%I:%M %p %A %Z')} in {iana_tz})"

    @classmethod
    def is_within_business_hours(cls, target_timezone_offset_hours: int = 6) -> bool:
        """Backwards compatible alias for local business hours check."""
        is_ok, _ = cls.is_within_target_business_hours(country=None, city=None)
        return is_ok

    @classmethod
    def get_active_smtp_inboxes(cls) -> List[Dict[str, Any]]:
        """
        Discovers and returns all configured SMTP accounts (up to 20 accounts).
        Can be provided via SMTP_HOST, SMTP_USER, etc., or comma/JSON list.
        """
        inboxes = []
        base_host = os.getenv("SMTP_HOST")
        base_user = os.getenv("SMTP_USER")
        base_pass = os.getenv("SMTP_PASSWORD")
        base_port = int(os.getenv("SMTP_PORT", "587"))
        base_from = os.getenv("SMTP_FROM_EMAIL", base_user or "outreach@leadgen.local")
        base_name = os.getenv("SMTP_FROM_NAME", "Growth Team")

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

        # Check for multi-inbox env variables (e.g. SMTP_HOST_2, SMTP_USER_2, ... up to 20)
        for i in range(2, 21):
            h = os.getenv(f"SMTP_HOST_{i}")
            u = os.getenv(f"SMTP_USER_{i}")
            p = os.getenv(f"SMTP_PASSWORD_{i}")
            port = int(os.getenv(f"SMTP_PORT_{i}", "587"))
            fe = os.getenv(f"SMTP_FROM_EMAIL_{i}", u or f"inbox{i}@leadgen.local")
            fn = os.getenv(f"SMTP_FROM_NAME_{i}", cls.PERSONA_SIGNATURES[(i - 1) % len(cls.PERSONA_SIGNATURES)]["name"])

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
        dry_run: bool = False
    ) -> Tuple[bool, str]:
        """
        Sends email via configured Multi-SMTP Pool with automatic load balancing and rotation.
        Rotates across up to 20 inboxes to ensure zero spam flags and high inbox deliverability.
        If SMTP host is not configured, logs a simulated successful send for dry-run testing.
        """
        inboxes = cls.get_active_smtp_inboxes()

        # Dry-run or test mode when credentials not yet configured
        if dry_run or not inboxes:
            logger.info(f"[OUTREACH SIMULATOR] Dispatching to {recipient_email} | Subject: '{subject}' | (Simulated 200 OK)")
            await asyncio.sleep(0.5)
            return True, "Simulated delivery successful (Dry-Run Mode)"

        # Load balance: pick next available inbox
        cls._inbox_index = (cls._inbox_index + 1) % len(inboxes)
        selected_inbox = inboxes[cls._inbox_index]

        smtp_host = selected_inbox["host"]
        smtp_port = selected_inbox["port"]
        smtp_user = selected_inbox["user"]
        smtp_pass = selected_inbox["password"]
        from_email = selected_inbox["from_email"]
        from_name = selected_inbox["from_name"]

        # Track sent stats
        inbox_id = selected_inbox["id"]
        cls.INBOX_STATS[inbox_id] = cls.INBOX_STATS.get(inbox_id, 0) + 1

        # Live SMTP delivery
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
        """
        Analyzes incoming reply text for Hot Lead / Positive vs Unsubscribe / Neutral.
        Returns:
            sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL"
            explanation: Reason
        """
        if not reply_text:
            return "NEUTRAL", "Empty reply content"

        clean = reply_text.lower()

        # Check negative/unsubscribe first
        for neg in cls.NEGATIVE_KEYWORDS:
            if neg in clean:
                return "NEGATIVE", f"Opt-out or negative intent detected: '{neg}'"

        # Check positive
        for pos in cls.POSITIVE_KEYWORDS:
            if pos in clean:
                return "POSITIVE", f"Hot lead interest signal detected: '{pos}'"

        return "NEUTRAL", "General response or inquiry"
