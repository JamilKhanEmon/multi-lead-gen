from typing import Dict, List, Any, Tuple
from app.core.logging import logger

class QualificationEngine:

    WEIGHTS = {
        "evidence_quality": 0.25,
        "problem_relevance": 0.20,
        "problem_repetition": 0.15,
        "recency": 0.15,
        "business_impact": 0.10,
        "service_fit": 0.15,
    }

    @classmethod
    def calculate_score(
        cls,
        evidence_quality: float,
        problem_relevance: float,
        problem_repetition: float,
        recency: float,
        business_impact: float,
        service_fit: float,
    ) -> float:
        eq = max(0.0, min(100.0, evidence_quality))
        pr = max(0.0, min(100.0, problem_relevance))
        rep = max(0.0, min(100.0, problem_repetition))
        rec = max(0.0, min(100.0, recency))
        bi = max(0.0, min(100.0, business_impact))
        sf = max(0.0, min(100.0, service_fit))

        score = (
            (cls.WEIGHTS["evidence_quality"] * eq)
            + (cls.WEIGHTS["problem_relevance"] * pr)
            + (cls.WEIGHTS["problem_repetition"] * rep)
            + (cls.WEIGHTS["recency"] * rec)
            + (cls.WEIGHTS["business_impact"] * bi)
            + (cls.WEIGHTS["service_fit"] * sf)
        )
        return round(score, 2)

    @classmethod
    def evaluate_gates(
        cls,
        max_evidence_level: int,
        max_recency: int,
        is_relevant_to_business_type: bool,
        best_service_fit_score: float,
        inferable_sources_count: int,
        has_primary_conflict: bool,
        has_inferable_gaps: bool = False,
        has_direct_contact: bool = True,
        is_industry_verified: bool = True,
        industry_mismatch_reason: str = "",
    ) -> Tuple[bool, List[str]]:
        failed_reasons = []

        if max_evidence_level < 2:
            failed_reasons.append(f"Insufficient evidence depth (Evidence Level {max_evidence_level} < 2 required).")

        if max_recency < 40:
            failed_reasons.append(f"Evidence is stale (Recency score {max_recency} < 40 required, >180 days old).")

        if not is_relevant_to_business_type:
            failed_reasons.append("Identified gap is not active or relevant for this business type.")

        if best_service_fit_score < 55.0:
            failed_reasons.append(f"Service fit score too low ({best_service_fit_score} < 55.0 required).")

        if has_inferable_gaps and inferable_sources_count < 2:
            failed_reasons.append("Inferable findings require at least 2 independent source domains.")

        if has_primary_conflict:
            failed_reasons.append("Active unresolved contradiction between primary sources.")

        if not is_industry_verified:
            failed_reasons.append(f"Industry mismatch: {industry_mismatch_reason or 'Website content does not align with target industry'}.")

        if not has_direct_contact:
            failed_reasons.append("Needs manual outreach review: Direct phone or email not yet verified.")

        fatal_failures = [r for r in failed_reasons if not r.startswith("Needs manual outreach review")]
        passed = len(fatal_failures) == 0
        return passed, failed_reasons

    @classmethod
    def assign_tier(cls, score: float, gates_passed: bool, has_direct_contact: bool = True) -> str:
        if not gates_passed:
            return "Rejected"

        if score >= 80.0 and has_direct_contact:
            return "Strong Potential"
        elif score >= 60.0:
            return "Review Needed"
        else:
            return "Rejected"

    @classmethod
    def generate_explanation(
        cls,
        company_name: str,
        gap_summary: str,
        evidence_level: int,
        sources_count: int,
        recency: int,
        best_service_name: str,
        tier: str,
        gate_failures: List[str],
    ) -> Dict[str, Any]:
        if tier == "Rejected":
            summary = f"{company_name} was rejected because: {'; '.join(gate_failures) or 'Score below threshold'}."
        else:
            summary = (
                f"{company_name} was qualified as '{tier}' because public evidence shows a solvable "
                f"gap ({gap_summary}) corroborated across {sources_count} independent sources (Level {evidence_level}) "
                f"with strong recency ({recency}/100), fitting our service '{best_service_name}'."
            )

        return {
            "summary": summary,
            "why_selected": "Multiple recent, independent public signals corroborated a solvable friction point.",
            "what_problem_detected": gap_summary,
            "evidence_strength": f"Level {evidence_level} with {sources_count} independent domains.",
            "recency_score": recency,
            "recommended_service": best_service_name,
            "uncertainties": "Internal CRM/ERP adoption and internal response speed cannot be verified from public data.",
            "gate_failures": gate_failures,
        }
