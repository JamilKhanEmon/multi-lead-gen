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

def test_resolve_contact_consensus():
    discovery = {
        "phone": "01711223344",
        "email": "old_info@gmail.com",
        "address": "Dhanmondi, Dhaka",
    }
    website = {
        "extracted_phone": "+8801711223344",
        "extracted_email": "sales@acmerealty.com",
        "extracted_address": "House 12, Road 5, Dhanmondi, Dhaka 1209",
    }
    social = {
        "whatsapp_phone": "+8801711223344",
        "phone": "+8801811223344",  # Secondary alternate hotline
        "email": "sales@acmerealty.com",
    }
    res = EvidenceEngine.resolve_contact_consensus(
        discovery_contact=discovery,
        website_contact=website,
        social_contact=social,
        target_domain="acmerealty.com",
    )

    assert res["phone_verified"] is True
    assert "01711223344" in res["primary_phone"]
    assert len(res["phone_sources"]) >= 2
    assert res["secondary_phone"] is not None
    assert res["primary_email"] == "sales@acmerealty.com"
    assert res["email_verified"] is True
    assert "House 12" in res["verified_address"]
    assert res["confidence_score"] >= 0.9

