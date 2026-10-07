from app.engine.service_matcher import ServiceMatcher

def test_service_matching_formula():
    matches = ServiceMatcher.match_services(
        detected_parameter_ids=[43],
        llm_service_suggestions=[{"service_slug": "whatsapp-automation", "confidence": 0.90}],
    )
    assert len(matches) > 0
    top_match = matches[0]
    assert top_match["service_slug"] == "whatsapp-automation"
    assert top_match["hybrid_score"] == 0.94

def test_service_matching_threshold():
    matches = ServiceMatcher.match_services(
        detected_parameter_ids=[],
        llm_service_suggestions=[{"service_slug": "ai-search", "confidence": 0.50}],
    )
    assert len(matches) == 0
