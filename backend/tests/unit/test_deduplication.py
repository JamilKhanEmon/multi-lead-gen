"""
Unit Tests for Deduplication Engine
"""
from app.engine.deduplication import DeduplicationEngine


def test_name_normalization():
    assert DeduplicationEngine.normalize_name("Apex Builders Ltd.") == "apex builders"
    assert DeduplicationEngine.normalize_name("Apex Builders Limited") == "apex builders"
    assert DeduplicationEngine.normalize_name("Apex Builder") == "apex builder"


def test_domain_normalization():
    assert DeduplicationEngine.normalize_domain("https://www.apexbuilders.com/contact/") == "apexbuilders.com"
    assert DeduplicationEngine.normalize_domain("http://apexbuilders.com") == "apexbuilders.com"
    assert DeduplicationEngine.normalize_domain(None) is None


def test_phone_normalization():
    assert DeduplicationEngine.normalize_phone("+880 1711-000001") == "01711000001"
    assert DeduplicationEngine.normalize_phone("01711-000001") == "01711000001"
    assert DeduplicationEngine.normalize_phone(None) is None


def test_duplicate_detection():
    # Same domain -> duplicate
    is_dup, reason = DeduplicationEngine.are_duplicate_candidates(
        "Apex Builders Ltd", "https://apex.com", None,
        "Apex Builders Group", "http://www.apex.com", None,
    )
    assert is_dup is True
    assert "Identical verified domain" in reason

    # Same normalized phone -> duplicate
    is_dup_phone, _ = DeduplicationEngine.are_duplicate_candidates(
        "Apex Builders", None, "+8801711000001",
        "Apex Ltd", None, "01711000001",
    )
    assert is_dup_phone is True
