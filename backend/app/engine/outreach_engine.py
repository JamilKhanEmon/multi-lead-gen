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
                "Would you be open to a brief 5-minute chat sometime this week or early next week to see the free audit report we prepared for {company_name}?\n\n"
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
    def _sanitize_company_name(cls, raw_name: str, domain: str = "") -> str:
        name = (raw_name or "").strip()
        GENERIC_STOPS = {
            "careers", "career", "jobs", "job", "hiring", "vacancy", "vacancies",
            "contact", "contact us", "contactus", "about", "about us", "aboutus", "who we are",
            "services", "our services", "service", "pricing", "plans",
            "privacy policy", "terms of service", "terms", "terms and conditions",
            "faq", "faqs", "help", "support", "blog", "blogs", "news", "articles",
            "team", "our team", "portfolio", "projects", "gallery",
            "login", "sign in", "signin", "signup", "sign up", "register", "cart", "checkout", "account", "my account",
            "home", "official", "website", "company", "untitled", "test", "demo"
        }
        name_lower = name.lower()
        if not name or name_lower in GENERIC_STOPS or len(name) < 2:
            if domain:
                dom_parts = (domain or "").lower().split(".")
                subdomain_stops = {"www", "careers", "career", "jobs", "job", "m", "portal", "mail", "app", "dev", "en", "info"}
                if len(dom_parts) >= 3 and dom_parts[0] in subdomain_stops:
                    dom_root = dom_parts[1]
                elif len(dom_parts) >= 2 and dom_parts[0] in subdomain_stops:
                    dom_root = dom_parts[1]
                else:
                    dom_root = dom_parts[0] if dom_parts else ""
                clean_dom = dom_root.replace("-", " ").replace("_", " ").title().strip()
                if clean_dom and clean_dom.lower() not in GENERIC_STOPS and len(clean_dom) >= 2:
                    return clean_dom
            return "your team"
        return name

    _sig_index: int = 0
    _inbox_index: int = 0

    @classmethod
    def _resolve_signature(cls, company_name: str, lead_data: Dict[str, Any]) -> Tuple[str, str, str, str]:
        # 1. First check if a persona was already chosen in runner rotation
        p = lead_data.get("selected_persona")
        if not p:
            personas = lead_data.get("personas") or []
            if personas:
                p = personas[cls._sig_index % len(personas)]
                cls._sig_index = (cls._sig_index + 1) % len(personas)

        sig_block = ""
        sender_name = ""
        sender_title = ""
        sender_company = ""

        if p:
            if isinstance(p, dict):
                raw_sig = (p.get("raw_content") or p.get("raw_signature") or "").strip()
                sender_name = (p.get("name") or "").strip()
                sender_title = (p.get("title") or "").strip()
                sender_company = (p.get("company") or "").strip()
            else:
                raw_sig = getattr(p, "raw_content", "") or ""
                if not raw_sig and hasattr(p, "render_signature"):
                    raw_sig = p.render_signature()
                raw_sig = (raw_sig or "").strip()
                sender_name = (getattr(p, "name", "") or "").strip()
                sender_title = (getattr(p, "title", "") or "").strip()
                sender_company = (getattr(p, "company", "") or "").strip()

            if raw_sig:
                sig_block = raw_sig
            else:
                sig_lines = [s for s in [sender_name, sender_title, sender_company] if s]
                sig_block = "\n".join(sig_lines).strip()
        else:
            custom_tpl = lead_data.get("custom_template")
            if custom_tpl:
                if hasattr(custom_tpl, "render_signature"):
                    sig_block = custom_tpl.render_signature()
                elif isinstance(custom_tpl, dict):
                    parts = []
                    sign_off = custom_tpl.get("sign_off") or "Sincerely,"
                    if sign_off:
                        parts.append(sign_off)
                    name_line = custom_tpl.get("sender_name") or ""
                    if custom_tpl.get("sender_title"):
                        name_line = f"{name_line}\n{custom_tpl['sender_title']}".strip()
                    if custom_tpl.get("sender_company"):
                        name_line = f"{name_line}, {custom_tpl['sender_company']}".strip(", ")
                    if name_line:
                        parts.append(name_line)
                    contact_line = []
                    if custom_tpl.get("sender_email"):
                        contact_line.append(f"Email: {custom_tpl['sender_email']}")
                    if custom_tpl.get("sender_phone"):
                        contact_line.append(f"Phone: {custom_tpl['sender_phone']}")
                    if contact_line:
                        parts.append(" | ".join(contact_line))
                    if custom_tpl.get("sender_website"):
                        parts.append(custom_tpl["sender_website"])
                    sig_block = "\n".join(parts).strip()

        # If still no signature from admin pool or template, fall back strictly to active inbox from_name
        if not sig_block:
            inbox_cfg = lead_data.get("inbox") or lead_data.get("selected_inbox") or {}
            sender_name = inbox_cfg.get("from_name") or lead_data.get("sender_name") or os.getenv("SMTP_FROM_NAME") or ""
            if sender_name and sender_name.strip().lower() not in ["test", ""]:
                sig_block = f"Best regards,\n\n{sender_name.strip()}"
            else:
                sig_block = "Best regards"
        elif not any(sig_block.strip().lower().startswith(greeting) for greeting in ["best regards", "regards", "sincerely", "thanks", "warm regards", "cheers"]):
            sig_block = f"Best regards,\n\n{sig_block}"

        return sig_block, sender_name, sender_title, sender_company

    @classmethod
    async def render_email(
        cls,
        step: int,
        lead_data: Dict[str, Any],
        ai_client: Optional[Any] = None,
    ) -> Tuple[str, str]:
        """
        Dynamically generates hyper-personalized, spam-proof B2B cold emails using LLM.
        Falls back to rule-based template if AI is unavailable or fails.
        """
        import re
        custom_tpl = lead_data.get("custom_template")
        if custom_tpl and lead_data.get("force_template"):
            return cls.render_email_template(step, lead_data)

        raw_company = lead_data.get("company_name") or "Your Team"
        website = lead_data.get("website") or ""
        company_name = cls._sanitize_company_name(raw_company, website)
        raw_contact = str(lead_data.get("contact_person") or "").strip()
        if raw_contact and raw_contact.lower() not in ["there", "sir", "madam", "n/a", "none", "unknown", "team", "executive"]:
            contact_person = raw_contact
        else:
            contact_person = f"Team {company_name}"

        # Clean duplicate 'Team Team' or repeated company name in contact_person
        contact_person = re.sub(r"^(Team\s+)+", "Team ", contact_person, flags=re.IGNORECASE)
        c_parts = contact_person.split()
        if len(c_parts) >= 3 and c_parts[0].lower() == "team" and c_parts[1].lower() == c_parts[2].lower():
            contact_person = f"Team {c_parts[1]}"

        city = str(lead_data.get("city") or lead_data.get("location") or lead_data.get("address") or "").strip()
        industry = str(lead_data.get("industry") or lead_data.get("business_type") or "General Business").strip()
        
        raw_gap = lead_data.get("primary_gap") or "optimizing operational workflows and client acquisition"
        primary_gap = re.sub(r"\s*\[Proof Link:[^\]]*\]", "", str(raw_gap), flags=re.IGNORECASE)
        primary_gap = re.sub(r"\s*\(Proof:[^\)]*\)", "", primary_gap, flags=re.IGNORECASE)
        primary_gap = re.sub(r"\s+", " ", primary_gap).strip()

        raw_why = lead_data.get("why_they_need_us") or lead_data.get("what_they_need") or ""
        why_they_need_us = re.sub(r"\s*\[Proof Link:[^\]]*\]", "", str(raw_why), flags=re.IGNORECASE)
        why_they_need_us = re.sub(r"\s*\(Proof:[^\)]*\)", "", why_they_need_us, flags=re.IGNORECASE)
        why_they_need_us = re.sub(r"\s+", " ", why_they_need_us).strip()
        
        matched_service = lead_data.get("matched_service") or "software and workflow automation"
        website = lead_data.get("website") or ""

        sig_block, sender_name, sender_title, sender_company = cls._resolve_signature(company_name, lead_data)

        try:
            if ai_client is None:
                from app.services.ai_client import AIClient
                ai_client = AIClient(timeout=35.0)

            step_descriptions = {
                1: "Step 1 Initial Cold Outreach: Introduce high-value growth opportunity, mention specific gap respectfully, offer a 5-minute brief walkthrough or conversation sometime this week or early next week.",
                2: "Step 2 Follow-up (Sent 4 days later): Polite, concise check-in referencing previous observation, ask if they'd like a 1-page summary or a 5-minute call.",
                3: "Step 3 Breakup Email (Sent 8 days later): Respectful final note acknowledging they may be busy, closing the file politely while leaving the door open for future collaboration."
            }
            step_instruction = step_descriptions.get(step, step_descriptions[1])

            sender_agency = sender_company.strip() if sender_company else "our team"
            system_prompt = (
                f"You are an elite B2B Sales Director writing tailored, concise, high-converting cold emails on behalf of {sender_agency}.\n\n"
                "STRICT STRUCTURE (Follow this exact 4-part skeleton):\n"
                f"Line 1 (Greeting): Hi {contact_person},\n"
                "Line 2 (Hook & Real Finding): Exactly 1 respectful, natural sentence referencing their company in their market and their ACTUAL verified gap or growth observation from the prompt. Speak directly to their industry.\n"
                f"Line 3 (Value & Matched Solution): 1-2 concise sentences highlighting how {matched_service} eliminates this exact bottleneck and drives tangible business ROI for them.\n"
                "Line 4 (Low-Friction CTA): Exactly 1 friendly sentence asking for a 5-minute brief walkthrough or discussion sometime this week or early next week.\n\n"
                "CRITICAL CONSTRAINTS (ZERO REPETITION / ZERO CANNED PHRASES):\n"
                "- ADAPT STRICTLY TO THE RECIPIENT'S INDUSTRY.\n"
                "- LENGTH: STRICT MAXIMUM 90 WORDS. Keep paragraphs separated by double newlines. Mobile-friendly.\n"
                "- TONE: Human, conversational, executive-level. NO corporate fluff ('Hope you are well', 'Allow me to introduce', 'I am writing to').\n"
                "- NO hardcoded days of the week (never mention Thursday, Monday, etc.).\n"
                "- NEVER include proof links, URLs, raw data brackets, or citations (e.g. absolutely no '[Proof Link: ...]'). Write completely natural, professional business sentences.\n"
                "- Do NOT include the sender signature or sign-off at the end (it is attached automatically).\n"
                "- Output format: Raw JSON only with keys \"subject\" and \"body\": {\"subject\": \"...\", \"body\": \"...\"}"
            )

            user_prompt = (
                f"Email Step: {step_instruction}\n"
                f"Target Company: {company_name}\n"
                f"Recipient: {contact_person}\n"
                f"Industry / Vertical: {industry}\n"
                f"Location / Market: {city}\n"
                f"Website: {website or 'None (Operating via Map / Social presence)'}\n"
                f"Identified Real Gap: {primary_gap}\n"
                f"Operational Context: {why_they_need_us}\n"
                f"Our Matched Solution to Offer: {matched_service}\n\n"
                "Generate the subject line and short body following the exact 4-part structure, strictly tailored to their industry and specific gap."
            )

            res = await ai_client.analyze(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=650,
            )
            if isinstance(res, dict) and res.get("subject") and res.get("body"):
                llm_subject = str(res["subject"]).strip().strip('"')
                llm_body = str(res["body"]).strip()

                # Clean greeting on the first line only without touching the rest of the body
                parts = llm_body.split("\n", 1)
                first_line = parts[0].strip()
                rest = parts[1] if len(parts) > 1 else ""

                # 1. Deduplicate greeting line if name is repeated, e.g. 'Hi Team Company, Company,'
                first_line = re.sub(r"^(Dear|Hello|Hi)\s+([^,]+),\s*\2[,:]?$", r"\1 \2,", first_line, flags=re.IGNORECASE)
                first_line = re.sub(r"^(Hi\s+Team\s+[\w\s]+),\s*[\w\s]+[,:]?$", r"\1,", first_line, flags=re.IGNORECASE)

                # 2. If generic greeting, substitute specific contact person
                if re.match(r"^(Dear|Hello|Hi)\s+(there|sir|madam|sir/madam|all|team)[,:]?$", first_line, flags=re.IGNORECASE):
                    first_line = f"Hi {contact_person},"
                elif not re.match(r"^(Dear|Hello|Hi)\b", first_line, flags=re.IGNORECASE):
                    first_line = f"Hi {contact_person},\n\n{first_line}"

                llm_body = f"{first_line}\n{rest}" if rest else first_line

                # Strip any sign-off the LLM might have written so admin signature attaches cleanly
                for sign_off in ["best regards", "warm regards", "sincerely", "regards", "cheers", "thanks"]:
                    pattern = rf"\n\s*{sign_off}[^\n]*(\n.*)?$"
                    llm_body = re.sub(pattern, "", llm_body, flags=re.IGNORECASE).strip()

                full_body = f"{llm_body}\n\n{sig_block}" if sig_block else llm_body

                logger.info(f"OutreachEngine: LLM successfully generated Step {step} email for '{company_name}'")
                return llm_subject, full_body

        except Exception as e:
            logger.warning(f"OutreachEngine: LLM email generation notice ({e}). Using rule-based fallback.")

        return cls.render_email_template(step, lead_data)

    @classmethod
    def render_email_template(cls, step: int, lead_data: Dict[str, Any]) -> Tuple[str, str]:
        raw_company = lead_data.get("company_name") or "Your Team"
        website = lead_data.get("website") or ""
        company_name = cls._sanitize_company_name(raw_company, website)
        raw_contact = str(lead_data.get("contact_person") or "").strip()
        if raw_contact and raw_contact.lower() not in ["there", "sir", "madam", "n/a", "none", "unknown", "team", "executive", "careers", "contact"]:
            contact_person = raw_contact
        else:
            contact_person = f"Team {company_name}"

        raw_city = str(lead_data.get("city") or lead_data.get("location") or lead_data.get("address") or "").strip()
        has_real_city = bool(raw_city and raw_city.lower() not in ["your area", "your city", "your office in your city", "n/a", "none", "unknown", ""])
        city = raw_city if has_real_city else ""
        import re
        raw_gap = lead_data.get("primary_gap") or "optimizing your online presence and client acquisition"
        primary_gap = re.sub(r"\s*\[Proof Link:[^\]]*\]", "", str(raw_gap), flags=re.IGNORECASE)
        primary_gap = re.sub(r"\s*\(Proof:[^\)]*\)", "", primary_gap, flags=re.IGNORECASE)
        primary_gap = re.sub(r"\s+", " ", primary_gap).strip()
        industry = (lead_data.get("industry") or lead_data.get("business_type") or "").lower()

        sig_block, sender_name, sender_title, sender_company = cls._resolve_signature(company_name, lead_data)

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
            if sig_block and sig_block not in bdy:
                bdy = f"{bdy.rstrip()}\n\n{sig_block}"
            return subj, bdy

        matched_svc = lead_data.get("matched_service") or f"{industry.title() if industry else 'Commercial'} Digital Workflow & Growth Solution"
        has_no_website = bool("Zero official website" in str(primary_gap) or "NO_WEBSITE" in str(lead_data.get("why_they_need_us") or ""))

        sol_text = str(matched_svc).strip() if matched_svc else "streamlining client communication and inquiry capture"
        if has_real_city and city:
            subject = f"Quick question regarding {company_name} ({city})"
            intro_loc = f"in {city}"
        else:
            subject = f"Quick question regarding {company_name}"
            intro_loc = ""

        loc_phrase = f" {intro_loc}" if intro_loc else ""
        gap_phrase = f" regarding {primary_gap}" if primary_gap else ""

        if step == 2:
            subject = f"Following up: {company_name}"
            body = (
                f"Hi {contact_person},\n\n"
                f"Just following up on my previous note regarding {company_name}.\n\n"
                f"We specialize in {sol_text}.\n\n"
                f"Would you be open to a quick 5-minute conversation sometime this week?\n\n"
                f"{sig_block}"
            )
        elif step == 3:
            subject = f"Permission to close your file, {contact_person}?"
            body = (
                f"Hi {contact_person},\n\n"
                f"I haven't heard back, so I assume this isn't an active priority for {company_name} right now.\n\n"
                f"I won't take up any more of your time. If your priorities change in the future, feel free to reach out anytime.\n\n"
                f"Wishing {company_name} continued success!\n\n"
                f"{sig_block}"
            )
        else:
            body = (
                f"Hi {contact_person},\n\n"
                f"I was researching top businesses{loc_phrase} and came across {company_name}{gap_phrase}.\n\n"
                f"We specialize in {sol_text}.\n\n"
                f"Would you be open to a brief 5-minute call sometime this week or early next week to discuss this?\n\n"
                f"{sig_block}"
            )

        # Guarantee signature is always cleanly attached
        if sig_block and not body.endswith(sig_block):
            body = f"{body.rstrip()}\n\n{sig_block}"

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
