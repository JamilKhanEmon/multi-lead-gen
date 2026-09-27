"""
Unit Tests for Service Matcher
"""
from app.engine.service_matcher import ServiceMatcher


def test_service_matching_formula():
    # Parameter 43 (missing WhatsApp) has a deterministic rule for 'whatsapp-automation' (rule_score=1.0)
    # If LLM suggests confidence 0.90:
    # Hybrid = (0.40 * 1.0) + (0.60 * 0.90) = 0.40 + 0.54 = 0.94
    matches = ServiceMatcher.match_services(
        detected_parameter_ids=[43],
        llm_service_suggestions=[{"service_slug": "whatsapp-automation", "confidence": 0.90}],
    )
    assert len(matches) > 0
    top_match = matches[0]
    assert top_match["service_slug"] == "whatsapp-automation"
    assert top_match["hybrid_score"] == 0.94


def test_service_matching_threshold():
    # If a service has hybrid score < 0.65, it should be excluded
    matches = ServiceMatcher.match_services(
        detected_parameter_ids=[],
        llm_service_suggestions=[{"service_slug": "ai-search", "confidence": 0.50}],
    )
    # (0.40 * 0.0) + (0.60 * 0.50) = 0.30 < 0.65 threshold
    assert len(matches) == 0
