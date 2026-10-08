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
        has_whatsapp = audit_res.get("has_whatsapp")
        broken_links_count = audit_res.get("broken_links_count") or 0
        has_pixel = audit_res.get("has_meta_pixel")
        has_analytics = audit_res.get("has_google_analytics")

        verified_gaps: List[str] = []
        inferred_opportunities: List[str] = []
        evidence_tags: List[str] = []
        evidence_signals: List[str] = []

        is_appointment_biz = is_appointment_niche(b_type, company_clean)

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

        for w in detected_weaknesses:
            w_str = str(w).strip()
            if w_str and w_str not in evidence_signals:
                evidence_signals.append(w_str)

        is_healthy_modern_site = (
            has_clean_domain
            and mobile_responsive is not False
            and (has_contact_form is True or has_online_booking is True)
            and len(verified_gaps) == 0
        )

        if is_healthy_modern_site:
            return {
                "fit_tier": "DROPPED",
                "fit_score": 5.0,
                "passed_gate": False,
                "why_they_need_us": "Healthy modern digital presence with active lead capture and no observable operational bottlenecks.",
                "what_they_need": "N/A — Company currently operates a modern digital setup.",
                "matched_service": "None (Dropped to avoid cold pitching satisfied client)",
                "matched_service_url": "",
                "matched_service_wedge": "",
                "matched_service_features": "",
                "recommended_services": [],
                "verified_gaps": [],
                "inferred_opportunities": [],
                "discovery_call_script": "",
                "evidence_tags": ["HEALTHY_SITE_DROPPED"],
                "evidence_signals": [],
            }

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
        matched_service_name = best_card.get("name") or "Custom Digital Solution"
        matched_service_url = best_card.get("url") or ""
        matched_service_wedge = best_card.get("wedge") or "Specialized Automation & Growth Audit"
        matched_service_features = (best_card.get("features") or "Tailored digital workflow and lead capture automation").strip().rstrip(".")
        matched_solves = best_card.get("solves_problems") or "operational friction and lead leakage"

        primary_observation = verified_gaps[0] if verified_gaps else "Inquiry flow and digital presence lack modern conversion optimization."
        primary_implication = inferred_opportunities[0] if inferred_opportunities else f"This suggests {company_clean} may be missing warm prospective client inquiries."

        why_they_need_us = (
            f"Public audit indicates: {primary_observation} {primary_implication} "
            f"Implementing {matched_service_name} addresses {matched_solves}."
        )

        modules_prefix = "" if "core modules include:" in matched_service_features.lower() else "Core modules include: "
        what_they_need = (
            f"{matched_service_name}: {matched_service_wedge}. "
            f"{modules_prefix}{matched_service_features}."
        )

        disc_hook = (
            f"I was reviewing {company_clean}'s online presence in {city_clean} and noted: {primary_observation}"
        )
        disc_question = (
            f"When prospective clients search for your services in {city_clean}, how does your team ensure inbound inquiries are instantly captured and tracked?"
        )

        agency_name = (company_kb.get("company_name") or "").strip() if (use_company_kb and company_kb) else ""
        if agency_name:
            pitch_line = f"At {agency_name}, our {matched_service_name} specifically provides {matched_service_wedge}. Would you be open to a 5-minute preview of the custom audit report prepared for {company_clean}?"
        else:
            pitch_line = f"Our team specializes in resolving this with {matched_service_name} ({matched_service_wedge}). Would you be open to a 5-minute preview of the custom audit report prepared for {company_clean}?"

        call_script = (
            f"1. OPENING EVIDENCE:\n"
            f"   \"Hello, is this {company_clean}? {disc_hook}\"\n\n"
            f"2. DISCOVERY QUESTION (Wait for their answer):\n"
            f"   \"{disc_question}\"\n\n"
            f"3. VALUE PITCH ({matched_service_name}):\n"
            f"   \"{pitch_line}\""
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
