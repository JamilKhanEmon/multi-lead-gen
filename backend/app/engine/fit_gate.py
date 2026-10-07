"""
Fit Gate & Sales Intelligence Engine (v2 Demand-Side Pipeline)
Evaluates live digital buying signals, enforces strict fit-gating,
and produces evidence-based sales pitches and 30-second discovery call scripts.
"""
import os
import re
import unicodedata
from typing import Dict, Any, Optional, Tuple, List
from urllib.parse import urlparse
from app.core.logging import logger

# Multi-Tenant B2B Digital & Software Service Catalog
SERVICE_CATALOG = {
    "web_dev": {
        "name": "Web Design & Development (Site in 7 Days)",
        "wedge": "High-Converting Mobile Landing Page / Website Revamp",
        "description": "Custom modern responsive website with instant WhatsApp & lead capture forms.",
    },
    "crm_lead": {
        "name": "Custom CRM & Lead Capture Pipeline",
        "wedge": "Automated Lead Capture & Inquiry Notification System",
        "description": "On-site buyer inquiry capture, automated WhatsApp/SMS notifications, and team sales tracking.",
    },
    "erp_management": {
        "name": "Custom Enterprise ERP (Inventory, Accounts & Operations)",
        "wedge": "Lightweight Cloud Billing & Daily Operations Tracker",
        "description": "End-to-end ERP customized for Real Estate, Hospitals, Schools, Restaurants, or Supply Chain.",
    },
    "digital_marketing": {
        "name": "Digital Marketing & SMS Outreach Wedge",
        "wedge": "Targeted SMS Blast & Local Google SEO Audit",
        "description": "Targeted local SEO, SMS campaigns, and Meta conversion tracking setup.",
    },
    "ecommerce_portal": {
        "name": "E-Commerce & Digital Ordering System",
        "wedge": "Online Product Showcase with Direct WhatsApp Ordering",
        "description": "Full e-commerce platform with automated payment gateway, delivery tracking, and stock sync.",
    }
}


class FitGateEngine:
    """
    Demand-Side Qualification & Sales Pitch Engine.
    Filters out healthy businesses with no pain points (prevents spamming).
    Supports both Branded Company KB Mode and Generic AI Pitch Mode.
    """

    @staticmethod
    async def fetch_active_kb_dict(session) -> Optional[Dict[str, Any]]:
        """Safely fetch the active Company KB from database."""
        try:
            from app.models.company_kb import CompanyKB
            from sqlalchemy.future import select
            stmt = select(CompanyKB).where(CompanyKB.is_active == True).order_by(CompanyKB.created_at.desc()).limit(1)
            res = await session.execute(stmt)
            kb = res.scalar_one_or_none()
            if kb:
                return {
                    "company_name": kb.company_name,
                    "tagline_experience": kb.tagline_experience,
                    "headquarters": kb.headquarters,
                    "contact_phone": kb.contact_phone,
                    "contact_email": kb.contact_email,
                    "website_url": kb.website_url,
                    "services_json": kb.services_json,
                }
        except Exception as e:
            logger.warning(f"FitGate: Could not load active company KB: {e}")
        return None

    @staticmethod
    def normalize_name_nfkc(name: str) -> str:
        """NFKC normalization (converts unicode math-italic glyphs like 𝙎𝙦𝙪𝙖𝙧𝙚 to ASCII), lowercase, strip punctuation."""
        if not name:
            return ""
        norm = unicodedata.normalize("NFKC", name)
        norm = norm.lower().strip()
        norm = re.sub(r"[^\w\s]", " ", norm)
        return re.sub(r"\s+", " ", norm).strip()

    @staticmethod
    def evaluate_candidate(
        business_name: str,
        domain: Optional[str],
        phone: Optional[str],
        email: Optional[str],
        business_type: Optional[str] = "commercial",
        city: Optional[str] = "Dhaka",
        audit_res: Optional[Dict[str, Any]] = None,
        detected_weaknesses: Optional[List[str]] = None,
        metadata_json: Optional[Dict[str, Any]] = None,
        company_kb: Optional[Dict[str, Any]] = None,
        use_company_kb: bool = True,
    ) -> Dict[str, Any]:
        """
        Runs candidate through Demand-Side Fit Gate.
        Supports both Branded Company KB mode and Generic AI Consultative mode.
        """
        audit_res = audit_res or {}
        detected_weaknesses = detected_weaknesses or []
        metadata_json = metadata_json or {}
        b_type = (business_type or "").lower()
        company_clean = business_name.strip() if business_name else "Candidate Company"
        city_clean = city.strip() if city else "Dhaka"

        has_clean_domain = bool(domain and "." in domain and not any(p in domain.lower() for p in [
            "facebook.com", "instagram.com", "google.com", "maps.google.com"
        ]))
        has_phone = bool(phone and len(re.sub(r"\D", "", phone)) >= 7)
        has_email = bool(email and "@" in email)

        # Audit checks
        mobile_responsive = audit_res.get("mobile_responsive")
        has_contact_form = audit_res.get("has_contact_form")
        has_online_booking = audit_res.get("has_online_booking")
        has_whatsapp = audit_res.get("has_whatsapp")
        broken_links_count = audit_res.get("broken_links_count") or 0
        has_pixel = audit_res.get("has_meta_pixel")
        has_analytics = audit_res.get("has_google_analytics")

        evidence_signals: List[str] = []
        evidence_tags: List[str] = []

        # 1. Detect Website & Digital Presence Gaps
        if not has_clean_domain:
            evidence_signals.append("Zero official website — relies exclusively on third-party map listing or social pages without an independent domain.")
            evidence_tags.append("NO_WEBSITE")
        else:
            if mobile_responsive is False:
                evidence_signals.append("Official website is not mobile-responsive (layout breaks on smartphones, leaking mobile search traffic).")
                evidence_tags.append("NOT_MOBILE_RESPONSIVE")

            if has_contact_form is False and not has_online_booking:
                evidence_signals.append("Website has no direct inquiry or lead capture form — visitors cannot submit requests directly on-site.")
                evidence_tags.append("NO_LEAD_FORM")

            if broken_links_count > 0:
                evidence_signals.append(f"Website contains {broken_links_count} dead/broken links causing customer trust and SEO drop.")
                evidence_tags.append("BROKEN_LINKS")

            if has_pixel is False and has_analytics is False:
                evidence_signals.append("No conversion tracking detected (Missing Google Analytics & Meta Pixel) — marketing budget is unmeasured.")
                evidence_tags.append("NO_ANALYTICS")

        # Weakness strings passed from scraper/audit
        for w in detected_weaknesses:
            w_str = str(w)
            if w_str not in evidence_signals:
                evidence_signals.append(w_str)

        # 2. Hard Gate Evaluation (Dada Directive)
        # If company has a healthy modern website, mobile responsive, working form, analytics, and 0 detected weaknesses:
        is_healthy_modern_site = (
            has_clean_domain
            and mobile_responsive is not False
            and (has_contact_form is True or has_online_booking is True)
            and len(evidence_signals) == 0
        )

        if is_healthy_modern_site:
            return {
                "fit_tier": "DROPPED",
                "fit_score": 2.0,
                "passed_gate": False,
                "why_they_need_us": "Healthy modern website with active lead capture and no observable operational bottlenecks.",
                "what_they_need": "N/A — Company currently operates a modern digital setup.",
                "matched_service": "None (Dropped to avoid cold pitching satisfied client)",
                "discovery_call_script": "",
                "evidence_tags": ["HEALTHY_SITE_DROPPED"]
            }

        # 3. Match Specific Service & Formulate Evidence
        if not has_clean_domain:
            matched_svc_key = "web_dev"
            why_they_need_us = (
                f"{company_clean} does not have an official website or branded web presence. "
                f"Prospective clients searching Google in {city_clean} cannot find an authoritative page, "
                f"causing warm inquiries to leak to competitor websites."
            )
            what_they_need = "Modern corporate website launched in 7 days with automated WhatsApp & direct lead capture forms."
            disc_question = "How are you currently capturing Google search visitors looking for your services in your area?"
            disc_hook = f"I noticed {company_clean} doesn't have an official website yet and relies solely on third-party listings."

        elif any(t in evidence_tags for t in ["NO_LEAD_FORM", "NOT_MOBILE_RESPONSIVE"]):
            matched_svc_key = "crm_lead"
            why_they_need_us = (
                f"Website has no interactive lead capture or instant booking mechanism. "
                f"Mobile visitors cannot easily submit inquiries, leading to high bounce rates and lost prospects."
            )
            what_they_need = "High-converting lead funnel with instant WhatsApp inquiry button & CRM pipeline to track prospect follow-ups."
            disc_question = "When potential clients land on your website, what percentage of them convert into direct phone or WhatsApp inquiries?"
            disc_hook = f"I was reviewing your website and noticed there's no immediate lead capture form for visitors on mobile."

        elif any(kw in b_type for kw in ["restaurant", "food", "cafe", "dining", "retail", "shop", "store"]):
            matched_svc_key = "ecommerce_portal" if "store" in b_type or "retail" in b_type else "erp_management"
            why_they_need_us = (
                f"Orders and client interactions are handled manually over the phone without automated digital ordering, table booking, or stock sync."
            )
            what_they_need = "Digital management system with real-time order tracking, WhatsApp notifications, and automated billing."
            disc_question = "How are you currently managing daily order tracking, inventory updates, and repeat customer notifications?"
            disc_hook = f"I noticed that orders and customer bookings are still being taken manually over phone calls."

        elif any(kw in b_type for kw in ["real estate", "hospital", "school", "clinic", "developer", "property"]):
            matched_svc_key = "erp_management"
            why_they_need_us = (
                f"High-ticket inquiry volume requires structured sales pipeline tracking; without automated CRM/ERP, sales reps lose follow-ups."
            )
            what_they_need = "Vertical Industry ERP / CRM tailored for client management, automated payment schedules, and sales rep activity tracking."
            disc_question = "How is your sales team currently logging prospect follow-ups and ensuring no warm buyer inquiry slips through the cracks?"
            disc_hook = f"I saw your active property/service offerings in {city_clean} and noticed the inquiry flow could be automated directly into a sales pipeline."

        else:
            matched_svc_key = "digital_marketing"
            why_they_need_us = (
                f"Digital presence lacks modern conversion tracking (Google Analytics / Meta Pixel) and structured local SEO hooks."
            )
            what_they_need = "Conversion-focused SEO overhaul, automated SMS inquiry notifications, and digital marketing wedge."
            disc_question = "Are you currently tracking where your best customer inquiries are originating from each week?"
            disc_hook = f"I noticed your online presence has a clear growth opportunity regarding local search conversion tracking."

        # Resolve catalog (incorporating dynamic Company KB services if active)
        catalog = SERVICE_CATALOG
        if use_company_kb and company_kb and company_kb.get("services_json"):
            kb_services = company_kb.get("services_json")
            if isinstance(kb_services, list):
                custom_cat = {}
                for s in kb_services:
                    if isinstance(s, dict) and s.get("key"):
                        custom_cat[s["key"]] = {
                            "name": s.get("name", "Custom Digital Solution"),
                            "wedge": s.get("wedge", "Custom Audit & Automation Wedge"),
                            "description": s.get("description", ""),
                        }
                if custom_cat:
                    catalog = {**SERVICE_CATALOG, **custom_cat}

        svc_info = catalog.get(matched_svc_key, catalog.get("web_dev", SERVICE_CATALOG["web_dev"]))
        matched_service = svc_info["name"]

        # 4. Compute Demand-Side Fit Score (0 to 12 scale)
        # Email (+3), Website (+2), Clear Gap (+3), Phone (+1), Dhaka (+1), No Website (+1), Evidence depth (+1)
        score = 0.0
        if has_email:
            score += 3.0
        if has_clean_domain:
            score += 2.0
        else:
            score += 1.0  # Web dev pitch bonus
        if len(evidence_signals) > 0:
            score += 3.0
        if has_phone:
            score += 1.0
        if city_clean:
            score += 1.0
        if len(evidence_signals) >= 2:
            score += 2.0

        score = min(12.0, score)

        # 5. Fit Tier
        if score >= 8.0 and (has_email or has_phone):
            fit_tier = "HOT"
        elif score >= 5.0:
            fit_tier = "WARM"
        else:
            fit_tier = "COLD"

        # 6. Discovery-First Sales Call Script (for sales executives / calling reps)
        if use_company_kb and company_kb and company_kb.get("company_name"):
            agency_name = company_kb.get("company_name").strip()
            wedge_offer = svc_info.get("wedge", "specialized audit report")
            pitch_line = f"At {agency_name}, we specialize in solving this with our {wedge_offer}. Would you be open to a 5-minute preview of the custom audit report we prepared for {company_clean}?"
        else:
            # Generic AI Consultation Mode (Zero Company Hardcoding)
            pitch_line = f"We specialize in solving this with modern digital automation and conversion optimization. Would you be open to a 5-minute preview of the custom audit report prepared for {company_clean}?"

        call_script = (
            f"1. OPENING EVIDENCE:\n"
            f"   \"Hello, is this {company_clean}? I was reviewing your online presence in {city_clean} and {disc_hook}\"\n\n"
            f"2. DISCOVERY QUESTION (Wait for their answer):\n"
            f"   \"{disc_question}\"\n\n"
            f"3. VALUE PITCH ({matched_service}):\n"
            f"   \"{pitch_line}\""
        )

        return {
            "fit_tier": fit_tier,
            "fit_score": score,
            "passed_gate": True,
            "why_they_need_us": why_they_need_us,
            "what_they_need": what_they_need,
            "matched_service": matched_service,
            "discovery_call_script": call_script,
            "evidence_tags": evidence_tags,
            "evidence_signals": evidence_signals,
        }
