"""
Qualification Engine: Enforces deterministic scoring, hard qualification gates,
tier assignments, and human-readable explainability.
"""
from typing import Dict, List, Any, Tuple
from app.core.logging import logger


class QualificationEngine:
    """Computes lead qualification score and applies hard qualification gates."""

    # Weights for the 6 factors (total 100%)
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
        """
        Calculates final score using normalized 0-100 factors:
        score = 0.25*EQ + 0.20*PR + 0.15*Rep + 0.15*Rec + 0.10*BI + 0.15*SF
        """
        # Enforce 0-100 bounds on all inputs
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
        """
        Validates all mandatory hard qualification gates.
        Returns: (passed: bool, failed_reasons: List[str])
        """
        failed_reasons = []

        # Gate 1: Solvable gap has verifiable Evidence Level >= 2
        if max_evidence_level < 2:
            failed_reasons.append(f"Insufficient evidence depth (Evidence Level {max_evidence_level} < 2 required).")

        # Gate 2: Most recent supporting evidence has Recency >= 40 (within last 180 days)
        if max_recency < 40:
            failed_reasons.append(f"Evidence is stale (Recency score {max_recency} < 40 required, >180 days old).")

        # Gate 3: Solvable gap is active for the identified business type
        if not is_relevant_to_business_type:
            failed_reasons.append("Identified gap is not active or relevant for this business type.")

        # Gate 4: Service fit score >= 55.0
        if best_service_fit_score < 55.0:
            failed_reasons.append(f"Service fit score too low ({best_service_fit_score} < 55.0 required).")

        # Gate 5: Inferable gaps require at least two independent sources
        if has_inferable_gaps and inferable_sources_count < 2:
            failed_reasons.append("Inferable findings require at least 2 independent source domains.")

        # Gate 6: No unresolved active contradictions
        if has_primary_conflict:
            failed_reasons.append("Active unresolved contradiction between primary sources.")

        # Gate 7: Direct Contact Channel Required (At least one phone number or email address must exist)
        if not has_direct_contact:
            failed_reasons.append("Unreachable: No direct phone number or email address available for outreach.")

        # Gate 8: Target Industry Semantic Verification (Prevents cross-vertical bleed e.g. Dental vs Real Estate)
        if not is_industry_verified:
            failed_reasons.append(f"Industry mismatch: {industry_mismatch_reason or 'Website content does not align with target industry'}.")

        passed = len(failed_reasons) == 0
        return passed, failed_reasons

    @classmethod
    def assign_tier(cls, score: float, gates_passed: bool) -> str:
        """
        Assigns lead tier based on score and gates:
        80–100: Strong Potential (if gates passed)
        60–79: Review Needed (if gates passed)
        Below 60 or failed gates: Rejected
        """
        if not gates_passed:
            return "Rejected"

        if score >= 80.0:
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
        """Generates structured explainability dossier answering all 7 required questions."""
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
