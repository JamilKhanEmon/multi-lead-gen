import os
import re
import unicodedata
from typing import Dict, Any, Optional, Tuple, List
from urllib.parse import urlparse
from app.core.logging import logger

DEFAULT_GENERIC_CATALOG: List[Dict[str, Any]] = []


APPOINTMENT_KEYWORDS = {
    "clinic", "dentist", "dental", "salon", "spa", "parlor", "parlour", 
    "barber", "hospital", "doctor", "physiotherapy", "diagnostic", 
    "consultant", "therapy", "chiro", "optom", "veterin", "appointment",
    "aesthetic", "wellness", "counseling"
}

def is_appointment_niche(b_type: str, b_name: str = "") -> bool:
    text = f"{b_type or ''} {b_name or ''}".lower()
    return any(kw in text for kw in APPOINTMENT_KEYWORDS)

def tokenize_text(text: str) -> set:
    if not text:
        return set()
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    words = cleaned.split()
    stopwords = {"and", "or", "the", "in", "of", "for", "with", "a", "an", "to", "on", "at", "by", "is", "custom"}
    return {w for w in words if len(w) > 2 and w not in stopwords}

class FitGateEngine:

    @staticmethod
    async def fetch_active_kb_dict(session) -> Optional[Dict[str, Any]]:
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
                    "master_kb_notes": getattr(kb, "master_kb_notes", "") or "",
                    "services_json": kb.services_json,
                }
        except Exception as e:
            logger.warning(f"FitGate: Could not load active company KB: {e}")
        return None

    @staticmethod
    def normalize_name_nfkc(name: str) -> str:
        if not name:
            return ""
        norm = unicodedata.normalize("NFKC", name)
        norm = norm.lower().strip()
        norm = re.sub(r"[^\w\s]", " ", norm)
        return re.sub(r"\s+", " ", norm).strip()

    @classmethod
    def match_service_cards(
        cls,
        candidate_cards: List[Dict[str, Any]],
        business_type: str,
        business_name: str,
        detected_gap_tags: List[str],
        has_domain: bool,
    ) -> List[Dict[str, Any]]:
        if not candidate_cards:
            candidate_cards = DEFAULT_GENERIC_CATALOG

        prospect_tokens = tokenize_text(f"{business_type} {business_name}")
        scored_cards = []

        for card in candidate_cards:
            if not isinstance(card, dict):
                continue
            card_name = card.get("name") or card.get("key") or "Business Solution"
            card_industries = card.get("target_industries") or ""
            card_problems = card.get("solves_problems") or ""
            card_features = card.get("features") or ""
            card_wedge = card.get("wedge") or ""

            ind_tokens = tokenize_text(card_industries)
            prob_tokens = tokenize_text(card_problems)
            feat_tokens = tokenize_text(f"{card_features} {card_name} {card_wedge}")

            score = 10.0

            industry_overlap = prospect_tokens.intersection(ind_tokens)
            if industry_overlap:
                score += 35.0 + min(len(industry_overlap) * 5.0, 20.0)

            if not has_domain:
                if any(w in feat_tokens or w in prob_tokens for w in ["web", "website", "landing", "online", "presence"]):
                    score += 40.0
            else:
                if "NOT_MOBILE_RESPONSIVE" in detected_gap_tags:
                    if any(w in feat_tokens or w in prob_tokens for w in ["mobile", "responsive", "revamp", "design"]):
                        score += 30.0

                if "NO_LEAD_FORM" in detected_gap_tags or "NO_WHATSAPP" in detected_gap_tags:
                    if any(w in feat_tokens or w in prob_tokens for w in ["crm", "lead", "capture", "inquiry", "pipeline", "whatsapp"]):
                        score += 30.0

                if "NO_TRACKING" in detected_gap_tags or "NO_ANALYTICS" in detected_gap_tags:
                    if any(w in feat_tokens or w in prob_tokens for w in ["marketing", "pixel", "analytics", "tracking", "seo"]):
                        score += 30.0

                if "NO_ONLINE_BOOKING" in detected_gap_tags:
                    if any(w in feat_tokens or w in prob_tokens for w in ["booking", "appointment", "scheduling"]):
                        score += 35.0

            if "MAPS_RATING_GAP" in detected_gap_tags or "LOCAL_DEMAND_AUTOMATION_FIT" in detected_gap_tags:
                if any(w in feat_tokens or w in prob_tokens for w in ["crm", "lead", "automation", "erp", "sales", "inquiry", "pipeline", "booking"]):
                    score += 35.0

            if "SOCIAL_LEAD_FUNNEL_GAP" in detected_gap_tags or "NO_WHATSAPP" in detected_gap_tags:
                if any(w in feat_tokens or w in prob_tokens for w in ["whatsapp", "funnel", "crm", "ads", "social", "marketing", "lead"]):
                    score += 35.0

            # Dynamic semantic relevance between prospect niche and card content
            prob_overlap = prospect_tokens.intersection(prob_tokens)
            if prob_overlap:
                score += min(len(prob_overlap) * 10.0, 30.0)

            feat_overlap = prospect_tokens.intersection(feat_tokens)
            if feat_overlap:
                score += min(len(feat_overlap) * 5.0, 20.0)

            scored_cards.append({
                **card,
                "_match_score": score,
            })

        scored_cards.sort(key=lambda c: c.get("_match_score", 0), reverse=True)
        return scored_cards

    @classmethod
    def evaluate_candidate(
        cls,
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
        analyze_website: bool = False,
    ) -> Dict[str, Any]:
        audit_res = audit_res or {}
        detected_weaknesses = detected_weaknesses or []
        metadata_json = metadata_json or {}
        b_type = (business_type or "").lower()
        company_clean = business_name.strip() if business_name else "Candidate Company"
        city_clean = city.strip() if city else "Target Market"

        from app.engine.deduplication import DeduplicationEngine
        if DeduplicationEngine.is_generic_platform(domain) or DeduplicationEngine.is_directory_or_aggregator(domain, company_clean):
            return {
                "fit_tier": "DROPPED",
                "fit_score": 0.0,
                "passed_gate": False,
                "why_they_need_us": "Entity is a directory, review platform, or public aggregator, not an operating commercial client.",
                "what_they_need": "N/A — Aggregator directory excluded from client outreach.",
                "matched_service": "None (Excluded Directory Platform)",
                "matched_service_url": "",
                "matched_service_wedge": "",
                "matched_service_features": "",
                "recommended_services": [],
                "verified_gaps": [],
                "inferred_opportunities": [],
                "discovery_call_script": "",
                "evidence_tags": ["DIRECTORY_AGGREGATOR_DROPPED"],
                "evidence_signals": [],
            }

        has_clean_domain = bool(domain and "." in domain and not DeduplicationEngine.is_generic_platform(domain))
        has_phone = bool(phone and len(re.sub(r"\D", "", phone)) >= 7)
        has_email = bool(email and "@" in email and "." in email.split("@")[-1])

        mobile_responsive = audit_res.get("mobile_responsive")
        has_contact_form = audit_res.get("has_contact_form")
        has_online_booking = audit_res.get("has_online_booking")
        has_whatsapp = audit_res.get("has_whatsapp") if audit_res.get("has_whatsapp") is not None else metadata_json.get("has_whatsapp")
        broken_links_count = audit_res.get("broken_links_count") or 0
        has_pixel = audit_res.get("has_meta_pixel")
        has_analytics = audit_res.get("has_google_analytics")

        verified_gaps: List[str] = []
        inferred_opportunities: List[str] = []
        evidence_tags: List[str] = []
        evidence_signals: List[str] = []

        is_appointment_biz = is_appointment_niche(b_type, company_clean)

        if analyze_website:
            # MODE 1: Deep Website Technical Audit (Enabled when user checks analyze_website)
            if not has_clean_domain:
                verified_gaps.append("Zero official website: operates exclusively via third-party directory or map listing without an independent domain.")
                inferred_opportunities.append("Absence of an official branded domain suggests warm search inquiries may leak to competitor websites with dedicated landing pages.")
                evidence_tags.append("NO_WEBSITE")
                evidence_signals.append("Zero official domain detected")
            else:
                if mobile_responsive is False or audit_res.get("mobile_overflow") is True:
                    verified_gaps.append("Public website layout breaks on mobile viewports with horizontal scrolling.")
                    inferred_opportunities.append("Mobile layout friction suggests smartphone visitors may experience difficulty navigating services and may bounce prematurely.")
                    evidence_tags.append("NOT_MOBILE_RESPONSIVE")
                    evidence_signals.append("Mobile layout break / horizontal scrolling detected")

                if has_contact_form is False and not has_online_booking:
                    verified_gaps.append("Public website lacks a direct on-site lead capture or inquiry form.")
                    inferred_opportunities.append("Absence of direct inquiry capture suggests prospects browsing after office hours may not have an immediate channel to submit inquiries.")
                    evidence_tags.append("NO_LEAD_FORM")
                    evidence_signals.append("No direct on-site inquiry form found")

                if has_whatsapp is False:
                    verified_gaps.append("No click-to-WhatsApp contact widget or direct messaging integration detected.")
                    inferred_opportunities.append("Lack of instant WhatsApp messaging suggests high-intent mobile users may encounter contact friction.")
                    evidence_tags.append("NO_WHATSAPP")
                    evidence_signals.append("No click-to-WhatsApp widget found")

                if broken_links_count > 0:
                    verified_gaps.append(f"Website contains {broken_links_count} broken/dead hyperlinks (404 errors).")
                    inferred_opportunities.append("Broken navigation links may undermine brand credibility and negatively impact search engine indexation.")
                    evidence_tags.append("BROKEN_LINKS")
                    evidence_signals.append(f"{broken_links_count} broken links detected")

                if has_pixel is False and has_analytics is False:
                    verified_gaps.append("Zero conversion tracking scripts detected (No Google Analytics or Meta Pixel).")
                    inferred_opportunities.append("Missing conversion tracking suggests advertising investments and visitor retargeting cannot be quantitatively measured.")
                    evidence_tags.append("NO_TRACKING")
                    evidence_signals.append("Missing Google Analytics and Meta Pixel")
                elif has_pixel is False:
                    verified_gaps.append("No Meta (Facebook/Instagram) retargeting pixel detected.")
                    inferred_opportunities.append("Missing Meta Pixel suggests social ad campaigns cannot retarget past website visitors.")
                    evidence_tags.append("NO_PIXEL")
                    evidence_signals.append("Missing Meta retargeting pixel")
                elif has_analytics is False:
                    verified_gaps.append("No Google Analytics (GA4) visitor tracking detected.")
                    inferred_opportunities.append("Missing analytics suggests inbound search traffic and visitor retention cannot be analyzed.")
                    evidence_tags.append("NO_ANALYTICS")
                    evidence_signals.append("Missing Google Analytics tracking")

                if is_appointment_biz and has_online_booking is False:
                    verified_gaps.append("No automated appointment scheduling system found on public website.")
                    inferred_opportunities.append("Absence of automated booking suggests staff time may be absorbed by manual phone coordination and appointment scheduling.")
                    evidence_tags.append("NO_ONLINE_BOOKING")
                    evidence_signals.append("No online appointment booking system found")
        else:
            # MODE 2: Social Presence, Google Maps Activity & Software Demo Pitch (DEFAULT)
            # Focuses on actual local activity, rating sentiment, and social presence without website complaints
            raw_rating = metadata_json.get("rating") or metadata_json.get("rating_score") or audit_res.get("rating")
            rating_val = None
            if raw_rating is not None:
                try:
                    rating_val = float(raw_rating)
                except (ValueError, TypeError):
                    rating_val = None

            raw_reviews = metadata_json.get("review_count") or metadata_json.get("reviews_count") or audit_res.get("review_count") or metadata_json.get("reviews")
            rev_label = f"{raw_reviews} reviews" if raw_reviews else "active local customer reviews"

            if rating_val is not None:
                if rating_val < 4.3:
                    verified_gaps.append(f"Google Maps public rating stands at {rating_val}★ ({rev_label}) with customer review sentiment indicating service response gaps in {city_clean}.")
                    inferred_opportunities.append(f"Inconsistent review management on Google Maps can divert local prospective buyers in {city_clean} to higher-rated alternatives.")
                    evidence_tags.append("MAPS_RATING_GAP")
                    evidence_signals.append(f"Google Maps rating {rating_val}★ with customer feedback gaps")
                else:
                    verified_gaps.append(f"Strong verified commercial profile on Google Maps ({rating_val}★, {rev_label}) in {city_clean}, but inbound customer intake and booking remain manual without automated CRM.")
                    inferred_opportunities.append(f"High local buyer demand in {city_clean} creates an immediate opportunity to automate client intake, follow-ups, and sales operations.")
                    evidence_tags.append("LOCAL_DEMAND_AUTOMATION_FIT")
                    evidence_signals.append(f"High-demand local profile ({rating_val}★) lacking automated sales workflow")
            else:
                verified_gaps.append(f"Operating commercial entity in {city_clean} without an automated client intake, inquiry tracking, or lead nurturing system.")
                inferred_opportunities.append(f"Managing customer inquiries manually through phone calls leads to missed follow-ups and lost prospects during peak business hours.")
                evidence_tags.append("MANUAL_OPERATION_BOTTLENECK")
                evidence_signals.append("Manual customer intake and follow-up bottleneck")

            # Social Media Channels & Direct Funnels
            if has_whatsapp is False:
                verified_gaps.append("No direct click-to-WhatsApp messaging channel or automated inquiry funnel detected.")
                inferred_opportunities.append("High-intent mobile visitors cannot immediately message your team, creating friction in prospective client acquisition.")
                evidence_tags.append("NO_WHATSAPP")
                evidence_signals.append("No direct WhatsApp messaging channel found")

            fb = audit_res.get("facebook_url") or metadata_json.get("facebook_url")
            ig = audit_res.get("instagram_url") or metadata_json.get("instagram_url")
            if fb or ig:
                verified_gaps.append("Active social media business profile detected, but lacks direct automated sales funnels, CRM sync, or instant inquiry booking.")
                inferred_opportunities.append("Operating social media without automated lead capture leads to delayed responses and lost prospects during off-hours.")
                evidence_tags.append("SOCIAL_LEAD_FUNNEL_GAP")
                evidence_signals.append("Active social presence lacking automated lead capture funnel")

        for w in detected_weaknesses:
            w_str = str(w).strip()
            if w_str and w_str not in evidence_signals:
                evidence_signals.append(w_str)

        if len(verified_gaps) == 0:
            inferred_opportunities.append(f"Opportunity to expand client pipeline for {company_clean} through targeted Meta & video advertising and automated WhatsApp CRM.")
            evidence_tags.append("MARKETING_GROWTH_OPPORTUNITY")

        candidate_cards = DEFAULT_GENERIC_CATALOG
        if use_company_kb and company_kb:
            kb_services = company_kb.get("services_json")
            if isinstance(kb_services, list) and len(kb_services) > 0:
                candidate_cards = kb_services
            else:
                kb_notes = (company_kb.get("master_kb_notes") or "").strip()
                if kb_notes:
                    parsed_lines = [l.strip().lstrip("-•*").strip() for l in kb_notes.split("\n") if l.strip()]
                    virtual_cards = []
                    for idx, line in enumerate(parsed_lines):
                        if len(line) < 5:
                            continue
                        if ":" in line:
                            svc_title, svc_desc = line.split(":", 1)
                        else:
                            svc_title, svc_desc = line[:40], line
                        svc_clean = svc_title.strip()
                        if svc_clean.lower() in ["core features", "features", "core modules", "modules", "overview", "key features"]:
                            svc_clean = "Real Estate ERP & Growth Automation" if any(w in b_type for w in ["real estate", "property", "developer"]) else "Custom ERP & Workflow Suite"
                        virtual_cards.append({
                            "key": f"note_svc_{idx+1}",
                            "name": svc_clean,
                            "wedge": "Tailored workflow demonstration & gap audit",
                            "features": svc_desc.strip(),
                            "solves_problems": "operational bottlenecks and manual coordination delays",
                            "description": svc_desc.strip(),
                        })
                    if virtual_cards:
                        candidate_cards = virtual_cards

        ranked_cards = cls.match_service_cards(
            candidate_cards=candidate_cards,
            business_type=b_type,
            business_name=company_clean,
            detected_gap_tags=evidence_tags,
            has_domain=has_clean_domain,
        )

        best_card = ranked_cards[0] if ranked_cards else {}
        matched_service_name = best_card.get("name")
        matched_service_url = best_card.get("url") or ""
        matched_service_wedge = best_card.get("wedge")
        matched_service_features = (best_card.get("features") or "").strip().rstrip(".")
        matched_solves = best_card.get("solves_problems")

        # Dynamic industry adaptation when Company KB is not yet populated
        if not matched_service_name:
            if any(w in b_type or w in company_clean.lower() for w in ["real estate", "property", "developer", "builder", "realtor", "construction", "housing"]):
                matched_service_name = "Real Estate Sales & CRM Automation System"
                matched_service_wedge = "5-Minute Interactive Live Demo of Property Sales & Follow-Up Automation"
                matched_service_features = "Automated buyer inquiry capture, installment tracking, and unsold inventory pipeline"
                matched_solves = "buyer inquiries slipping through cracks and untracked sales pipelines"
            elif any(w in b_type or w in company_clean.lower() for w in ["clinic", "dentist", "dental", "doctor", "health", "hospital", "medical", "parlor", "salon"]):
                matched_service_name = "Digital Patient Scheduling & Clinic Management Portal"
                matched_service_wedge = "5-Minute Live Interactive Demonstration of Appointment Automation"
                matched_service_features = "Digital appointment booking, automated SMS/WhatsApp reminders, and digital patient queue"
                matched_solves = "manual phone coordination chaos, missed appointments, and front-desk friction"
            elif any(w in b_type or w in company_clean.lower() for w in ["retail", "pos", "store", "shop", "e-commerce", "ecommerce", "supermarket", "grocery", "restaurant", "cafe"]):
                matched_service_name = "Cloud POS & Automated Inventory / Ordering Platform"
                matched_service_wedge = "Rapid POS Setup Demonstration & Automated Low-Stock Alert System"
                matched_service_features = "Barcode billing, automated stock shrinkage alerts, and WhatsApp ordering flow"
                matched_solves = "manual inventory tracking confusion and checkout bottlenecks"
            elif any(w in b_type or w in company_clean.lower() for w in ["school", "college", "academy", "education", "institute", "university"]):
                matched_service_name = "Automated Campus Management & Student Billing Portal"
                matched_service_wedge = "Live Demonstration of Automated Fee Billing & Parent Notification Portal"
                matched_service_features = "Digital tuition fee collection, attendance notifications, and parent portal"
                matched_solves = "manual fee collection queues and paper-heavy student administration"
            else:
                matched_service_name = "Digital Workflow & Inbound Sales Automation Platform"
                matched_service_wedge = "Tailored 5-Minute Live Demonstration & Operational Gap Audit"
                matched_service_features = "Automated lead capture, instant client WhatsApp routing, and pipeline tracking"
                matched_solves = "operational bottlenecks, manual coordination delays, and lost client inquiries"

        if not matched_service_wedge:
            matched_service_wedge = "Tailored 5-Minute Live Interactive Demonstration"
        if not matched_service_features:
            matched_service_features = "Tailored digital workflow and lead capture automation"
        if not matched_solves:
            matched_solves = "operational friction and lead leakage"

        primary_observation = verified_gaps[0] if verified_gaps else f"Inbound customer capture for {company_clean} relies on manual unautomated coordination."
        primary_implication = inferred_opportunities[0] if inferred_opportunities else f"This suggests {company_clean} may be missing warm prospective client inquiries."

        if analyze_website:
            why_they_need_us = (
                f"• Verified Technical Gap: {primary_observation}\n"
                f"• Business Impact: {primary_implication}\n"
                f"• Strategic Fix: Implementing {matched_service_name} resolves {matched_solves}."
            )
            disc_hook = (
                f"I was reviewing {company_clean}'s digital portal and visitor infrastructure in {city_clean} and noticed: {primary_observation}"
            )
            disc_question = (
                f"When prospective clients search for your services in {city_clean}, how does your team ensure website visitors and inquiries are converted into booked clients?"
            )
            bn_hook = (
                f"আসসালামু আলাইকুম/হ্যালো, আমি কি {company_clean}-এর ওনার বা ম্যানেজমেন্ট টিমের সাথে কথা বলতে পারি? "
                f"আপনাদের {city_clean or 'লোকাল'}-এর ওয়েবসাইট ও ডিজিটাল সিস্টেম দেখে লক্ষ্য করলাম: {primary_observation}"
            )
            bn_question = (
                f"আপনাদের ওয়েবসাইটে যখন প্রতিদিন সম্ভাব্য কাস্টমাররা আসছে, তারা সহজে বুকিং বা যোগাযোগ করতে পারছে কি না, "
                f"নাকি ট্র্যাকিং ও অটোমেশনের অভাবে কিছু ক্লায়েন্ট ড্রপ করে অন্য কোথাও চলে যাচ্ছে?"
            )
            bn_pitch = (
                f"আমরা এই ধরনের টেকনিক্যাল সমস্যা সমাধান এবং ওয়েবসাইটের ভিজিটরদের সরাসরি কাস্টমারে কনভার্ট করার জন্য {matched_service_name}-এর একটি ৫ মিনিটের লাইভ ডেমো রেডি করেছি। "
                f"আপনাদের টিমের জন্য এই সপ্তাহে কি ৫ মিনিট সময় হবে ডেমোটি এক নজর দেখার জন্য?"
            )
        else:
            why_they_need_us = (
                f"• Verified Operational Gap: {primary_observation}\n"
                f"• Business Impact: {primary_implication}\n"
                f"• Strategic Fix: Implementing {matched_service_name} resolves {matched_solves}."
            )
            disc_hook = (
                f"I was reviewing {company_clean}'s local business presence and customer acquisition channels in {city_clean} and noticed: {primary_observation}"
            )
            disc_question = (
                f"When prospective clients reach out to your team from Google Maps or social media in {city_clean}, how does your team ensure inbound inquiries are instantly captured and tracked?"
            )
            bn_hook = (
                f"আসসালামু আলাইকুম/হ্যালো, আমি কি {company_clean}-এর ওনার বা ম্যানেজমেন্ট টিমের সাথে কথা বলতে পারি? "
                f"আপনাদের {city_clean or 'লোকাল'}-এ গুগল ম্যাপস ও কাস্টমার রেটিং পর্যালোচনা করে লক্ষ্য করলাম: {primary_observation}"
            )
            bn_question = (
                f"গুগল ম্যাপস বা সোশ্যাল মিডিয়া থেকে যখন প্রতিদিন নতুন কাস্টমাররা আপনাদের কল বা মেসেজ দেয়, "
                f"আপনারা কি সেগুলো ম্যানুয়ালি হ্যান্ডেল করছেন নাকি কোনো স্বয়ংক্রিয় সিআরএম/সিস্টেম আছে যাতে কোনো কাস্টমার বা লিড মিস না হয়?"
            )
            bn_pitch = (
                f"আমরা আপনাদের মতো {b_type or 'লোকাল'}-এর ব্যবসার জন্য একটি স্পেশালাইজড {matched_service_name} প্রস্তুত করেছি। "
                f"কীভাবে প্রতিটি ইনকোয়ারি স্বয়ংক্রিয়ভাবে সেলসে রূপান্তর করা যায়—এই সপ্তাহে কি ৫ মিনিট সময় দিতে পারবেন লাইভ ডেমোটি দেখার জন্য?"
            )

        modules_prefix = "" if "core modules include:" in matched_service_features.lower() else "Core modules include: "
        what_they_need = (
            f"{matched_service_name}: {matched_service_wedge}. "
            f"{modules_prefix}{matched_service_features}."
        )

        agency_name = (company_kb.get("company_name") or "").strip() if (use_company_kb and company_kb) else ""
        if agency_name:
            pitch_line = f"At {agency_name}, our {matched_service_name} provides {matched_service_wedge}. Would you be open to a 5-minute preview of the live solution modeled for {company_clean}?"
        else:
            pitch_line = f"Our team specializes in resolving this with {matched_service_name} ({matched_service_wedge}). Would you be open to a 5-minute preview of the live solution modeled for {company_clean}?"

        call_script = (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📞 [EN] SALES CALL SCRIPT (ENGLISH OUTREACH)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"1. OPENING EVIDENCE & HOOK:\n"
            f"   \"Hello, is this {company_clean}? {disc_hook}\"\n\n"
            f"2. DISCOVERY PAIN QUESTION (Listen carefully to their response):\n"
            f"   \"{disc_question}\"\n\n"
            f"3. VALUE PITCH & 5-MIN DEMO OFFER:\n"
            f"   \"{pitch_line}\"\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🇧🇩 [BN] সেলস টিম গাইড ও বাংলা স্পিচ (সহজে কথা বলার জন্য)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"১. কল শুরুর হুক (Opening Hook):\n"
            f"   \"{bn_hook}\"\n\n"
            f"২. সমস্যা খোঁজার প্রশ্ন (Discovery Question):\n"
            f"   \"{bn_question}\"\n\n"
            f"৩. সমাধান ও ৫ মিনিটের ডেমো অফার (Closing / Demo Offer):\n"
            f"   \"{bn_pitch}\""
        )

        # Calibrated 0-100 Score
        # 1. Verified Gaps (0 - 30 pts)
        gap_count = len(verified_gaps)
        if gap_count >= 3:
            gaps_score = 30.0
        elif gap_count == 2:
            gaps_score = 24.0
        elif gap_count == 1:
            gaps_score = 16.0
        else:
            gaps_score = 5.0

        # 2. Business Fit & Card Match (0 - 25 pts)
        match_raw = best_card.get("_match_score", 10.0)
        fit_score_component = min(25.0, round(match_raw * 0.35, 1))

        # 3. Contactability (0 - 25 pts)
        contact_score = 0.0
        if has_email:
            contact_score += 15.0
        if has_phone:
            contact_score += 10.0

        # 4. Digital Presence / Market Signals (0 - 15 pts)
        presence_score = 10.0 if has_clean_domain else 4.0
        if city_clean:
            presence_score += 5.0
        presence_score = min(15.0, presence_score)

        # 5. Confidence (0 - 5 pts)
        conf_score = 5.0 if (has_phone or has_email) and not audit_res.get("fetch_error") else 2.0

        total_score = gaps_score + fit_score_component + contact_score + presence_score + conf_score

        # Strict Calibration Rule: without verified email, cap score at 74.0
        if not has_email:
            total_score = min(74.0, total_score)

        total_score = round(min(98.0, max(10.0, total_score)), 1)

        # Calibrated Tier
        if total_score >= 80.0 and has_email:
            fit_tier = "HOT"
        elif total_score >= 50.0:
            fit_tier = "WARM"
        else:
            fit_tier = "COLD"

        rec_names = [c.get("name") for c in ranked_cards[:3] if c.get("name")]

        return {
            "fit_tier": fit_tier,
            "fit_score": total_score,
            "passed_gate": True,
            "why_they_need_us": why_they_need_us,
            "what_they_need": what_they_need,
            "matched_service": matched_service_name,
            "matched_service_url": matched_service_url,
            "matched_service_wedge": matched_service_wedge,
            "matched_service_features": matched_service_features,
            "recommended_services": rec_names,
            "verified_gaps": verified_gaps,
            "inferred_opportunities": inferred_opportunities,
            "discovery_call_script": call_script,
            "evidence_tags": evidence_tags,
            "evidence_signals": evidence_signals,
        }
