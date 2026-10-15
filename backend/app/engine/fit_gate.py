import os
import re
import unicodedata
from typing import Dict, Any, Optional, Tuple, List
import urllib.parse
from urllib.parse import urlparse, quote
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

    @staticmethod
    def parse_master_kb_products(kb_notes: str) -> List[Dict[str, Any]]:
        """
        Parses master_kb_notes into structured product cards with target industries,
        overview, core features, problems solved, and value wedge.
        Prevents internal bullet points (like 'Production Scheduling & Batch Tracking')
        from being wrongly treated as standalone services.
        """
        if not kb_notes or not kb_notes.strip():
            return []

        # Split by numbered headings like '1. ', '2. ', etc.
        blocks = re.split(r'\n(?=\d+\.\s+)', kb_notes.strip())
        products = []
        for b in blocks:
            header_match = re.match(r'^(\d+)\.\s+([^\n:]+):?', b.strip())
            if not header_match:
                continue
            p_num = header_match.group(1)
            p_name = header_match.group(2).strip()

            url_m = re.search(r'[-*]\s*Website Link:\s*([^\n]+)', b, re.IGNORECASE)
            overview_m = re.search(r'[-*]\s*Overview:\s*([^\n]+)', b, re.IGNORECASE)
            ind_m = re.search(r'[-*]\s*Target Industries:\s*([^\n]+)', b, re.IGNORECASE)
            feat_m = re.search(r'[-*]\s*(?:Core )?Features:\s*([\s\S]*?)(?=[-*]\s*(?:Problems Solved|Value Wedge)|$)', b, re.IGNORECASE)
            prob_m = re.search(r'[-*]\s*Problems Solved:\s*([^\n]+)', b, re.IGNORECASE)
            wedge_m = re.search(r'[-*]\s*(?:Value Wedge|Wedge):\s*([^\n]+)', b, re.IGNORECASE)

            products.append({
                'key': f'prod_{p_num}',
                'name': p_name,
                'url': url_m.group(1).strip() if url_m else '',
                'overview': overview_m.group(1).strip() if overview_m else '',
                'target_industries': ind_m.group(1).strip() if ind_m else '',
                'features': re.sub(r'\s+', ' ', feat_m.group(1)).strip() if feat_m else (overview_m.group(1).strip() if overview_m else ''),
                'solves_problems': prob_m.group(1).strip() if prob_m else '',
                'wedge': wedge_m.group(1).strip() if wedge_m else '5-Minute Tailored Interactive Walkthrough',
            })

        return products

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

            gmaps_url = metadata_json.get("google_maps_url") or audit_res.get("google_maps_url") or f"https://www.google.com/maps/search/{urllib.parse.quote(company_clean + ' ' + city_clean)}"
            if rating_val is not None:
                if rating_val < 4.3:
                    verified_gaps.append(f"Google Maps public rating stands at {rating_val}★ ({rev_label}) with customer review sentiment indicating response bottlenecks.")
                    inferred_opportunities.append(f"Inconsistent review management on Google Maps can divert local prospective buyers in {city_clean} to higher-rated alternatives.")
                    evidence_tags.append("MAPS_RATING_GAP")
                    evidence_signals.append(f"Google Maps rating {rating_val}★ with customer feedback gaps (Proof: {gmaps_url})")
                else:
                    verified_gaps.append(f"Strong verified commercial profile on Google Maps ({rating_val}★, {rev_label}) in {city_clean}, but customer intake and booking remain manual without automated CRM.")
                    inferred_opportunities.append(f"High local buyer demand in {city_clean} creates an immediate opportunity to automate client intake, follow-ups, and sales operations.")
                    evidence_tags.append("LOCAL_DEMAND_AUTOMATION_FIT")
                    evidence_signals.append(f"High-demand local profile ({rating_val}★) lacking automated sales workflow (Proof: {gmaps_url})")
            else:
                # No Maps rating found, look strictly at real presence signals
                if has_clean_domain:
                    verified_gaps.append(f"Official web domain ({domain}) lacks direct appointment scheduling or interactive lead capture.")
                    inferred_opportunities.append(f"Adding interactive booking on {domain} can directly convert visitors into clients.")
                    evidence_tags.append("NO_ONLINE_BOOKING")
                    evidence_signals.append(f"Website lacking instant booking channel (Domain: {domain})")
                elif fb or ig:
                    verified_gaps.append(f"Operating via social media without an official website or automated inquiry booking funnel.")
                    inferred_opportunities.append("Reliance solely on social media messages creates manual bottlenecks during busy hours.")
                    evidence_tags.append("NO_WEBSITE")
                    evidence_signals.append("Operating without official website")
                elif has_phone:
                    verified_gaps.append(f"Customer acquisition relies exclusively on direct phone calls with no verified digital booking channel.")
                    inferred_opportunities.append("Missing digital booking leaves inquiries unanswered after hours.")
                    evidence_tags.append("MANUAL_PHONE_ONLY")
                    evidence_signals.append("Customer acquisition phone-only")
                else:
                    verified_gaps.append(f"No verified official website or online inquiry portal found for {company_clean} in {city_clean}.")
                    inferred_opportunities.append("Establishing an official digital presence will capture local online search traffic.")
                    evidence_tags.append("NO_DIGITAL_PRESENCE")
                    evidence_signals.append("No verified website found")

            # Social Media Channels & Direct Funnels
            if has_whatsapp is False:
                verified_gaps.append("No direct click-to-WhatsApp messaging channel or automated inquiry funnel detected.")
                inferred_opportunities.append("High-intent mobile visitors cannot immediately message your team, creating friction in prospective client acquisition.")
                evidence_tags.append("NO_WHATSAPP")
                evidence_signals.append("No direct WhatsApp messaging channel found")

            fb = audit_res.get("facebook_url") or metadata_json.get("facebook_url")
            ig = audit_res.get("instagram_url") or metadata_json.get("instagram_url")
            is_dormant = audit_res.get("social_is_dormant", False)
            recency_txt = audit_res.get("social_post_recency")

            if fb or ig:
                social_link = fb or ig
                if is_dormant:
                    verified_gaps.append(f"Official Facebook page has been inactive/dormant ({recency_txt or 'no recent posts'}). Profile is losing warm prospective local clients.")
                    inferred_opportunities.append(f"Reviving regular social media posting and running localized campaigns will re-engage warm customers in {city_clean}.")
                    evidence_tags.append("DORMANT_SOCIAL_PAGE")
                    evidence_signals.append(f"Dormant Facebook page with zero recent posts (Proof: {social_link})")
                else:
                    verified_gaps.append(f"Active social media business profile detected ({recency_txt or 'active posts'}), but lacks direct automated sales funnels, CRM sync, or instant inquiry booking.")
                    inferred_opportunities.append("Operating social media without automated lead capture leads to delayed responses and lost prospects during off-hours.")
                    evidence_tags.append("SOCIAL_LEAD_FUNNEL_GAP")
                    evidence_signals.append(f"Active social presence lacking automated lead capture funnel (Proof: {social_link})")

        for w in detected_weaknesses:
            w_str = str(w).strip()
            if w_str and w_str not in evidence_signals:
                evidence_signals.append(w_str)

        if len(verified_gaps) == 0:
            inferred_opportunities.append(f"Opportunity to expand client pipeline for {company_clean} through targeted Meta & video advertising and automated WhatsApp CRM.")
            evidence_tags.append("MARKETING_GROWTH_OPPORTUNITY")

        DISALLOWED_SERVICE_HEADERS = {
            "company overview", "overview", "company profile", "about us", "who we are", "about",
            "introduction", "table of contents", "index", "mission", "vision", "services",
            "our services", "core features", "features", "core modules", "modules", "key features",
            "summary", "background", "company information", "profile"
        }

        candidate_cards = DEFAULT_GENERIC_CATALOG
        if use_company_kb and company_kb:
            kb_services = company_kb.get("services_json")
            if isinstance(kb_services, list) and len(kb_services) > 0:
                candidate_cards = kb_services
            else:
                kb_notes = (company_kb.get("master_kb_notes") or "").strip()
                if kb_notes:
                    prods = cls.parse_master_kb_products(kb_notes)
                    if prods:
                        candidate_cards = prods

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

        # Guard against generic or header-matched names slipping through
        if matched_service_name and matched_service_name.lower().strip(" :-#*") in DISALLOWED_SERVICE_HEADERS:
            matched_service_name = None

        # Dynamic fallback when Company KB has no matching card
        if not matched_service_name:
            clean_b_type = (b_type or "Business").replace("_", " ").title()
            matched_service_name = f"{clean_b_type} Operations & Workflow Automation System"
            matched_service_wedge = "Tailored 5-Minute Live Interactive Demonstration"
            matched_service_features = "Automated customer inquiry capture, instant messaging routing, and digital operations pipeline"
            matched_solves = "operational bottlenecks, manual coordination delays, and lost client inquiries"

        if not matched_service_wedge:
            matched_service_wedge = "Tailored 5-Minute Live Interactive Demonstration"
        if not matched_service_features:
            matched_service_features = "Tailored digital workflow and lead capture automation"
        if not matched_solves:
            matched_solves = "operational friction and lead leakage"

        clean_gaps = [re.sub(r"\s*\[Proof Link:[^\]]*\]", "", str(g)).strip() for g in verified_gaps]
        clean_gaps = [g for g in clean_gaps if g]
        primary_observation = clean_gaps[0] if clean_gaps else f"Online client intake for {company_clean} relies on manual coordination without automated tracking."
        primary_implication = inferred_opportunities[0] if inferred_opportunities else f"This suggests {company_clean} may be missing prospective client inquiries during peak hours."

        gap_category = "Technical Gap" if analyze_website else "Operational Gap"
        why_they_need_us = (
            f"• Verified {gap_category}: {primary_observation}\n"
            f"• Business Impact: {primary_implication}\n"
            f"• Strategic Fix: Implementing {matched_service_name} resolves {matched_solves}."
        )

        modules_prefix = "" if "core modules include:" in matched_service_features.lower() else "Core modules include: "
        what_they_need = (
            f"{matched_service_name}: {matched_service_wedge}. "
            f"{modules_prefix}{matched_service_features}."
        )

        call_script = None

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

    @classmethod
    async def generate_dynamic_call_script(
        cls,
        company_name: str,
        city: str,
        industry: str,
        verified_gaps: List[str],
        matched_service: str,
        ai_client: Optional[Any] = None,
    ) -> Optional[str]:
        # Telephone discovery call scripts are completely disabled and skipped
        return None
