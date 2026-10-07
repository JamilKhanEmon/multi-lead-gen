from datetime import datetime, timedelta, timezone
from app.engine.evidence_engine import EvidenceEngine

def test_recency_decay_curves():
    now = datetime.now(timezone.utc)

    assert EvidenceEngine.calculate_recency_score(now - timedelta(days=15), now) == 100
    assert EvidenceEngine.calculate_recency_score(now - timedelta(days=45), now) == 70
    assert EvidenceEngine.calculate_recency_score(now - timedelta(days=120), now) == 40
    assert EvidenceEngine.calculate_recency_score(now - timedelta(days=250), now) == 10
    assert EvidenceEngine.calculate_recency_score(now - timedelta(days=400), now) == 0

def test_domain_extraction():
    assert EvidenceEngine.extract_domain("https://www.example-builders.com/contact") == "example-builders.com"
    assert EvidenceEngine.extract_domain("http://facebook.com/biz/page") == "facebook.com"

def test_evidence_level_evaluation():
    items = [
        {"source_url": "https://company.com", "confidence": 0.9, "recency_weight": 100, "status": "STRONG"},
        {"source_url": "https://maps.google.com/biz", "confidence": 0.85, "recency_weight": 70, "status": "STRONG"},
        {"source_url": "https://facebook.com/biz", "confidence": 0.9, "recency_weight": 100, "status": "STRONG"},
    ]
    eval_res = EvidenceEngine.evaluate_parameter_evidence(items)
    assert eval_res["evidence_level"] >= 3
    assert eval_res["independent_sources_count"] == 3
    assert eval_res["conflict"] is False
