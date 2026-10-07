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
