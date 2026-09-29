"""
Unit Tests for Qualification Engine
"""
from app.engine.qualification_engine import QualificationEngine


def test_score_calculation_weights():
    # Test formula: 0.25*EQ + 0.20*PR + 0.15*Rep + 0.15*Rec + 0.10*BI + 0.15*SF
    score = QualificationEngine.calculate_score(
        evidence_quality=100.0,
        problem_relevance=100.0,
        problem_repetition=100.0,
        recency=100.0,
        business_impact=100.0,
        service_fit=100.0,
    )
    assert score == 100.0

    score_mixed = QualificationEngine.calculate_score(
        evidence_quality=80.0,  # 20.0
        problem_relevance=70.0, # 14.0
        problem_repetition=60.0,# 9.0
        recency=100.0,          # 15.0
        business_impact=80.0,   # 8.0
        service_fit=90.0,       # 13.5
    )
    # 20 + 14 + 9 + 15 + 8 + 13.5 = 79.5
    assert score_mixed == 79.5


def test_hard_qualification_gates():
    # Passed gates: Evidence level 3, recency 70, relevant, service fit 85, no conflict
    passed, failures = QualificationEngine.evaluate_gates(
        max_evidence_level=3,
        max_recency=70,
        is_relevant_to_business_type=True,
        best_service_fit_score=85.0,
        inferable_sources_count=2,
        has_primary_conflict=False,
    )
    assert passed is True
    assert len(failures) == 0

    # Failing gate: Evidence Level < 3
    passed_fail, failures_list = QualificationEngine.evaluate_gates(
        max_evidence_level=1,
        max_recency=100,
        is_relevant_to_business_type=True,
        best_service_fit_score=90.0,
        inferable_sources_count=1,
        has_primary_conflict=False,
    )
    assert passed_fail is False
    assert any("Insufficient evidence depth" in f for f in failures_list)


def test_tier_assignment():
    assert QualificationEngine.assign_tier(85.0, gates_passed=True) == "Strong Potential"
    assert QualificationEngine.assign_tier(68.0, gates_passed=True) == "Review Needed"
    assert QualificationEngine.assign_tier(55.0, gates_passed=True) == "Rejected"
    # Even if score >= 80, if gates failed -> Rejected
    assert QualificationEngine.assign_tier(88.0, gates_passed=False) == "Rejected"


def test_weak_lead_rejection_gates():
    # Weak lead with no evidence and no service fit
    passed, failures = QualificationEngine.evaluate_gates(
        max_evidence_level=0,
        max_recency=0,
        is_relevant_to_business_type=False,
        best_service_fit_score=0.0,
        inferable_sources_count=0,
        has_primary_conflict=False,
    )
    assert passed is False
    assert len(failures) >= 3
    assert any("Insufficient evidence depth" in f for f in failures)
    assert any("not active or relevant" in f for f in failures)
    assert any("Service fit score too low" in f for f in failures)

    score = QualificationEngine.calculate_score(
        evidence_quality=0.0,
        problem_relevance=10.0,
        problem_repetition=0.0,
        recency=0.0,
        business_impact=10.0,
        service_fit=0.0,
    )
    assert score < 60.0
    tier = QualificationEngine.assign_tier(score, passed)
    assert tier == "Rejected"


def test_contactability_gate_rejection():
    # Lead has strong evidence and high service fit, but zero contact details (no phone, no email)
    passed, failures = QualificationEngine.evaluate_gates(
        max_evidence_level=3,
        max_recency=85,
        is_relevant_to_business_type=True,
        best_service_fit_score=90.0,
        inferable_sources_count=2,
        has_primary_conflict=False,
        has_direct_contact=False,  # Neither phone nor email found
    )
    assert passed is False
    assert any("Unreachable: No direct phone number or email address" in f for f in failures)

    # Even with 95 score, tier must be Rejected if unreachable
    score = QualificationEngine.calculate_score(90.0, 90.0, 90.0, 90.0, 90.0, 90.0)
    tier = QualificationEngine.assign_tier(score, passed)
    assert tier == "Rejected"


