"""
Evidence Engine: Evaluates evidence quality, repetition, source independence,
recency decay curves, conflict detection, and Evidence Levels (0 to 4).
"""
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse
from app.core.logging import logger


class EvidenceEngine:
    """Evaluates supporting evidence integrity and calculates Evidence Levels."""

    @staticmethod
    def calculate_recency_score(published_at: Optional[datetime], collected_at: datetime) -> int:
        """
        Calculates recency weight (0 to 100) based on days elapsed:
        0–30 days = 100
        31–90 days = 70
        91–180 days = 40
        181–365 days = 10
        > 365 days = 0
        """
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
        """Extracts canonical network location domain from URL."""
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
        """
        Evaluates a cluster of evidence items for a single parameter.
        Returns:
            evidence_level: int (0 to 4)
            independent_sources_count: int
            conflict: bool
            average_confidence: float
            max_recency: int
            status: str
        """
        if not evidence_items:
            return {
                "evidence_level": 0,
                "independent_sources_count": 0,
                "conflict": False,
                "average_confidence": 0.0,
                "max_recency": 0,
                "status": "UNKNOWN",
            }

        # Track independent domains
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

        # Check for real conflicts: when the SAME parameter has contradictory evidence (PASS vs WEAK/STRONG)
        by_param = {}
        for item in evidence_items:
            pid = item.get("parameter_id", 0)
            by_param.setdefault(pid, []).append(item.get("status", "WEAK"))

        conflict = False
        for pid, p_statuses in by_param.items():
            if "PASS" in p_statuses and any(s in ("WEAK", "STRONG") for s in p_statuses):
                conflict = True
                break

        # Calculate Evidence Level:
        # LEVEL 0: No evidence
        # LEVEL 1: One weak signal
        # LEVEL 2: Two related observable signals
        # LEVEL 3: Three or more independent/repeated signals
        # LEVEL 4: Multiple strong recent independent sources
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
            avg_confidence *= 0.7  # Penalize confidence if sources disagree

        return {
            "evidence_level": level,
            "independent_sources_count": independent_count,
            "conflict": conflict,
            "average_confidence": round(avg_confidence, 2),
            "max_recency": max_recency,
            "status": primary_status,
        }
