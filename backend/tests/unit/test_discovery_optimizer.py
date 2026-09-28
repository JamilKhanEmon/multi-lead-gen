"""
Unit tests for DiscoveryOptimizer: Pure dynamic AI-driven query expansion and semantic filtering.
Validates multi-business, worldwide discovery without hardcoded country or industry limitations.
"""
import pytest
from app.engine.discovery_optimizer import DiscoveryOptimizer


def test_dynamic_fallback_plan_generation():
    # Multi-business test: Real Estate, Dental, Software, Plumbing
    industries = ["Real Estate", "Dental Clinic", "Software Development", "Plumbing Contractor"]
    for ind in industries:
        plan = DiscoveryOptimizer.build_fallback_plan(
            industry=ind,
            location="Chicago, USA",
            city="Chicago",
            country="USA",
        )
        assert len(plan["search_queries"]) >= 3
        assert len(plan["osm_queries"]) >= 2
        assert len(plan["negative_keywords"]) >= 5
        # Ensure target industry itself is never in negative keywords
        assert not any(ind.lower() == neg.lower() for neg in plan["negative_keywords"])


def test_validate_candidate_accepts_genuine_companies():
    plan = DiscoveryOptimizer.build_fallback_plan("Commercial Technology", "New York")

    valid_candidates = [
        {"canonical_name": "Apex Software Technologies Ltd", "domain": "apexsoft.com", "snippet": "Enterprise software consultancy"},
        {"canonical_name": "Metropolitan Dental Group", "domain": "metrodental.com", "snippet": "Specialized oral care clinic"},
        {"canonical_name": "Vanguard Legal Partners", "domain": "vanguardlaw.com", "snippet": "Corporate commercial litigation attorneys"},
        {"canonical_name": "Summit Commercial Builders", "domain": "summitbuilders.com", "snippet": "Commercial construction and engineering"},
    ]

    for cand in valid_candidates:
        is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
        assert is_valid is True, f"Expected {cand['canonical_name']} to be valid, but got: {reason}"


def test_validate_candidate_rejects_negative_keywords():
    plan = {
        "industry": "Commercial Firm",
        "location": "London, UK",
        "negative_keywords": ["housing society", "pharmacy", "restaurant", "hostel", "dormitory", "cemetery"],
    }

    unrelated_candidates = [
        {"canonical_name": "St Mary Housing Society", "domain": ""},
        {"canonical_name": "Boots Pharmacy", "domain": "boots.com"},
        {"canonical_name": "Corner Bistro Restaurant", "domain": "cornerbistro.com"},
        {"canonical_name": "City Hostel & Dormitory", "domain": ""},
    ]

    for cand in unrelated_candidates:
        is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
        assert is_valid is False, f"Expected {cand['canonical_name']} to be rejected by AI negative filter, but got accepted"


def test_validate_candidate_rejects_short_names_and_category_matches():
    plan = DiscoveryOptimizer.build_fallback_plan("Dental Clinic", "London")

    # Too short (< 3 chars)
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Ab"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": ""}, plan)[0] is False

    # Exact match to target industry name alone
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Dental Clinic"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "dental clinic"}, plan)[0] is False


def test_validate_candidate_sub_city_matching():
    plan = {
        "industry": "Dental Clinic",
        "location": "Manhattan, New York, USA",
        "sub_city": "Manhattan",
        "negative_keywords": ["pharmacy"],
    }

    # Same area should pass
    cand_match = {
        "canonical_name": "Manhattan Dental Care Center",
        "domain": "manhattandental.com",
        "address": "5th Avenue, Manhattan, New York",
    }
    is_valid, _ = DiscoveryOptimizer.validate_candidate(cand_match, plan)
    assert is_valid is True

    # Conflicting area with explicit address should fail (prevents cross-zone leakage)
    cand_mismatch = {
        "canonical_name": "Brooklyn Dental Surgery",
        "domain": "brooklyndental.com",
        "address": "Atlantic Ave, Brooklyn, New York",
    }
    is_valid, reason = DiscoveryOptimizer.validate_candidate(cand_mismatch, plan)
    assert is_valid is False
    assert "does not match requested area" in reason


def test_classify_entity_multi_industry():
    assert DiscoveryOptimizer.classify_entity("Summit Builders", "summit.com", "real_estate") == "Real Estate Commercial Firm"
    assert DiscoveryOptimizer.classify_entity("Smile Studio", "smilestudio.com", "dental_clinic") == "Dental Clinic"
    assert DiscoveryOptimizer.classify_entity("Baker Chambers", "bakerlaw.com", "legal_firm") == "Legal Firm"
    assert DiscoveryOptimizer.classify_entity("Apex Solutions", "apexsoft.com", "software_agency") == "Software Agency"
    assert DiscoveryOptimizer.classify_entity("Precision Services", "precision.com", "plumbing_contractor") == "Plumbing Contractor"
