"""
Unit tests for DiscoveryOptimizer: LLM query expansion and semantic filtering.
Ensures zero unrelated retail/pharmacies/housing societies contaminate the leads pipeline.
"""
import pytest
from app.engine.discovery_optimizer import DiscoveryOptimizer


def test_real_estate_plan_excludes_housing_societies():
    plan = DiscoveryOptimizer.build_fallback_plan(
        industry="Real Estate",
        location="Dhaka",
        country="Bangladesh",
        city="Dhaka",
    )
    # Check that search queries target developers & corporate agencies
    assert any("developer" in q.lower() or "firms" in q.lower() for q in plan["search_queries"])

    # Check that OSM targets do NOT query residential societies
    assert not any("housing society" in q.lower() for q in plan["osm_queries"])

    # Check negative keywords contains noisy words
    negatives = plan["negative_keywords"]
    assert "housing society" in negatives
    assert "pharmacy" in negatives
    assert "restaurant" in negatives
    assert "mess" in negatives


def test_validate_candidate_accepts_genuine_companies():
    plan = DiscoveryOptimizer.build_fallback_plan("Real Estate", "Dhaka")

    valid_candidates = [
        {"canonical_name": "Shanta Holdings Ltd", "domain": "shantaholdings.com", "snippet": "Leading luxury real estate developer in Dhaka"},
        {"canonical_name": "Concord Real Estate and Development", "domain": "concordgroup.net", "snippet": "Real estate building & construction firm"},
        {"canonical_name": "Assure Development Group", "domain": "assuregroup.com", "snippet": "Premium apartment builders"},
        {"canonical_name": "Bay Developments", "domain": "baydevelopments.com", "snippet": "Architectural developers"},
    ]

    for cand in valid_candidates:
        is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
        assert is_valid is True, f"Expected {cand['canonical_name']} to be valid, but got: {reason}"


def test_validate_candidate_rejects_residential_societies():
    plan = DiscoveryOptimizer.build_fallback_plan("Real Estate", "Dhaka")

    society_candidates = [
        {"canonical_name": "Mohammadpur Housing Society", "domain": "", "snippet": "Residential neighborhood in Mohammadpur"},
        {"canonical_name": "Shekhertek Co-operative Housing Society", "domain": "", "snippet": "Local housing community"},
        {"canonical_name": "Priyanka Housing Society", "domain": "", "snippet": "Residential sector"},
    ]

    for cand in society_candidates:
        is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
        assert is_valid is False, f"Expected {cand['canonical_name']} to be rejected as a society"


def test_validate_candidate_rejects_unrelated_retail_and_services():
    plan = DiscoveryOptimizer.build_fallback_plan("Real Estate", "Dhaka")

    unrelated_candidates = [
        {"canonical_name": "Bismillah Pharmacy & Medical Hall", "domain": "", "snippet": "Medicine retailer"},
        {"canonical_name": "KFC Banani Restaurant", "domain": "kfc.com", "snippet": "Fast food and chicken"},
        {"canonical_name": "Green Valley School and College", "domain": "greenvalley.edu", "snippet": "English medium school"},
        {"canonical_name": "Gulshan Central Mosque & Graveyard", "domain": "", "snippet": "Religious center"},
        {"canonical_name": "Dhaka Bachelor Mess", "domain": "", "snippet": "Hostel accommodation"},
        {"canonical_name": "Lazz Pharma Dhanmondi", "domain": "lazzpharma.com", "snippet": "Pharmacy retail"},
    ]

    for cand in unrelated_candidates:
        is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
        assert is_valid is False, f"Expected {cand['canonical_name']} to be rejected, but got accepted"


def test_validate_candidate_rejects_address_road_names():
    plan = DiscoveryOptimizer.build_fallback_plan("Real Estate", "Dhaka")

    road_candidates = [
        {"canonical_name": "Road No. 12, Banani", "domain": ""},
        {"canonical_name": "Road # 5, Dhanmondi", "domain": ""},
        {"canonical_name": "Lane No. 3, Sector 10", "domain": ""},
        {"canonical_name": "Sector 4 Park", "domain": ""},
    ]

    for cand in road_candidates:
        is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
        assert is_valid is False, f"Expected road {cand['canonical_name']} to be rejected"


def test_validate_candidate_generic_single_words():
    plan = DiscoveryOptimizer.build_fallback_plan("Real Estate", "Dhaka")

    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Real Estate"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Clinic"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Hospital"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Ab"}, plan)[0] is False
