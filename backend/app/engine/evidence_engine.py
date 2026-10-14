from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse
from app.core.logging import logger

class EvidenceEngine:

    @staticmethod
    def calculate_recency_score(published_at: Optional[datetime], collected_at: datetime) -> int:
        ref_date = published_at or collected_at
        now = datetime.now(timezone.utc)
        if ref_date.tzinfo is None:
            ref_date = ref_date.replace(tzinfo=timezone.utc)

        delta_days = (now - ref_date).days

        if delta_days <= 30:
            return 100
        elif delta_days <= 90:
            return 70
        elif delta_days <= 180:
            return 40
        elif delta_days <= 365:
            return 10
        else:
            return 0

    @staticmethod
    def extract_domain(url: str) -> str:
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            if domain.startswith("www."):
                domain = domain[4:]
            return domain
        except Exception:
            return url.lower()

    @classmethod
    def evaluate_parameter_evidence(
        cls,
        evidence_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not evidence_items:
            return {
                "evidence_level": 0,
                "independent_sources_count": 0,
                "conflict": False,
                "average_confidence": 0.0,
                "max_recency": 0,
                "status": "UNKNOWN",
            }

        domains = set()
        confidences = []
        recencies = []
        statuses = []

        for item in evidence_items:
            url = item.get("source_url", "")
            if url:
                domains.add(cls.extract_domain(url))

            confidences.append(item.get("confidence", 0.5))
            recencies.append(item.get("recency_weight", 0))
            statuses.append(item.get("status", "WEAK"))

        independent_count = len(domains)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        max_recency = max(recencies) if recencies else 0

        by_param = {}
        for item in evidence_items:
            pid = item.get("parameter_id", 0)
            by_param.setdefault(pid, []).append(item.get("status", "WEAK"))

        conflict = False
        for pid, p_statuses in by_param.items():
            if "PASS" in p_statuses and any(s in ("WEAK", "STRONG") for s in p_statuses):
                conflict = True
                break

        weak_or_strong_items = [item for item in evidence_items if item.get("status") in ("WEAK", "STRONG")]
        if not weak_or_strong_items:
            level = 0
        elif independent_count >= 3:
            if max_recency >= 40 and avg_confidence >= 0.8:
                level = 4
            else:
                level = 3
        elif independent_count >= 2 or len(weak_or_strong_items) >= 2:
            level = 2
        else:
            level = 1

        primary_status = "STRONG" if any(s == "STRONG" for s in statuses) else "WEAK"
        if conflict:
            avg_confidence *= 0.7

        return {
            "evidence_level": level,
            "independent_sources_count": independent_count,
            "conflict": conflict,
            "average_confidence": round(avg_confidence, 2),
            "max_recency": max_recency,
            "status": primary_status,
        }

    @classmethod
    def resolve_contact_consensus(
        cls,
        discovery_contact: Optional[Dict[str, Any]] = None,
        website_contact: Optional[Dict[str, Any]] = None,
        social_contact: Optional[Dict[str, Any]] = None,
        target_domain: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Multi-source cross-verification and majority consensus engine for phone, email, and address.
        Cross-checks contacts across Google Maps / Discovery, Official Website, and Facebook / Social.
        Selects primary contact with verified confidence, plus secondary / WhatsApp backup lines.
        """
        import re

        def _clean_phone(raw: Optional[str]) -> Optional[str]:
            if not raw or not isinstance(raw, str):
                return None
            digits = re.sub(r"[^\d+]", "", raw.strip())
            return digits if len(re.sub(r"[^\d]", "", digits)) >= 7 else None

        def _norm_phone(raw: Optional[str]) -> Optional[str]:
            if not raw:
                return None
            digits = re.sub(r"[^\d]", "", str(raw))
            if digits.startswith("880") and len(digits) == 13:
                return digits[2:]
            if len(digits) >= 10:
                return digits[-10:]
            return digits

        phone_candidates = []
        if discovery_contact:
            p = _clean_phone(discovery_contact.get("phone"))
            if p:
                phone_candidates.append({"phone": p, "source": "Google Maps / Discovery"})
        if website_contact:
            p = _clean_phone(website_contact.get("extracted_phone") or website_contact.get("phone"))
            if p:
                phone_candidates.append({"phone": p, "source": "Official Website"})
        if social_contact:
            p = _clean_phone(social_contact.get("whatsapp_phone") or social_contact.get("phone"))
            if p:
                phone_candidates.append({"phone": p, "source": "Facebook / WhatsApp"})

        phones_by_norm: Dict[str, Dict[str, Any]] = {}
        for cand in phone_candidates:
            norm = _norm_phone(cand["phone"])
            if not norm:
                continue
            if norm not in phones_by_norm:
                phones_by_norm[norm] = {
                    "raw": cand["phone"],
                    "sources": [],
                }
            if cand["source"] not in phones_by_norm[norm]["sources"]:
                phones_by_norm[norm]["sources"].append(cand["source"])

        def _phone_priority(item):
            norm, data = item
            count = len(data["sources"])
            has_fb = any("Facebook" in s for s in data["sources"])
            has_web = any("Website" in s for s in data["sources"])
            priority_score = count * 10 + (3 if has_fb else 0) + (2 if has_web else 0)
            return priority_score

        sorted_phones = sorted(phones_by_norm.items(), key=_phone_priority, reverse=True)

        primary_phone = None
        secondary_phone = None
        phone_verified = False
        phone_sources = []

        if sorted_phones:
            best_norm, best_data = sorted_phones[0]
            primary_phone = best_data["raw"]
            phone_sources = best_data["sources"]
            phone_verified = len(best_data["sources"]) >= 2
            if len(sorted_phones) > 1:
                _, sec_data = sorted_phones[1]
                secondary_phone = sec_data["raw"]

        whatsapp_phone = None
        if social_contact and social_contact.get("whatsapp_phone"):
            whatsapp_phone = _clean_phone(social_contact.get("whatsapp_phone"))
        elif primary_phone and ("01" in primary_phone or "+8801" in primary_phone):
            whatsapp_phone = primary_phone

        email_candidates = []
        if discovery_contact and discovery_contact.get("email"):
            email_candidates.append({"email": str(discovery_contact["email"]).strip().lower(), "source": "Google Maps / Discovery"})
        if website_contact and (website_contact.get("extracted_email") or website_contact.get("email")):
            em = str(website_contact.get("extracted_email") or website_contact.get("email")).strip().lower()
            email_candidates.append({"email": em, "source": "Official Website"})
        if social_contact and social_contact.get("email"):
            email_candidates.append({"email": str(social_contact["email"]).strip().lower(), "source": "Facebook"})

        emails_by_addr: Dict[str, List[str]] = {}
        for cand in email_candidates:
            em = cand["email"]
            if "@" in em and "." in em.split("@")[-1]:
                emails_by_addr.setdefault(em, []).append(cand["source"])

        def _email_priority(item):
            addr, sources = item
            domain_match = False
            if target_domain:
                dom_clean = target_domain.lower().replace("www.", "").split("/")[0]
                domain_match = dom_clean in addr
            return len(sources) * 5 + (10 if domain_match else 0)

        sorted_emails = sorted(emails_by_addr.items(), key=_email_priority, reverse=True)

        primary_email = None
        secondary_email = None
        email_verified = False
        email_sources = []

        if sorted_emails:
            best_em, best_sources = sorted_emails[0]
            primary_email = best_em
            email_sources = list(set(best_sources))
            email_verified = len(email_sources) >= 2 or (target_domain and target_domain.lower() in best_em)
            if len(sorted_emails) > 1:
                sec_em, _ = sorted_emails[1]
                secondary_email = sec_em

        addresses = []
        if website_contact and website_contact.get("extracted_address"):
            addresses.append(str(website_contact["extracted_address"]).strip())
        if discovery_contact and discovery_contact.get("address"):
            addresses.append(str(discovery_contact["address"]).strip())
        if social_contact and social_contact.get("address"):
            addresses.append(str(social_contact["address"]).strip())

        verified_address = max(addresses, key=len) if addresses else None

        confidence_score = 0.5
        if phone_verified:
            confidence_score += 0.3
        elif primary_phone:
            confidence_score += 0.15
        if email_verified:
            confidence_score += 0.2
        elif primary_email:
            confidence_score += 0.1

        return {
            "primary_phone": primary_phone,
            "secondary_phone": secondary_phone,
            "whatsapp_phone": whatsapp_phone,
            "phone_verified": phone_verified,
            "phone_sources": phone_sources,
            "primary_email": primary_email,
            "secondary_email": secondary_email,
            "email_verified": email_verified,
            "email_sources": email_sources,
            "verified_address": verified_address,
            "confidence_score": min(1.0, round(confidence_score, 2)),
        }
