import pytest
from app.engine.discovery_optimizer import DiscoveryOptimizer

def test_dynamic_fallback_plan_generation():
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

    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Ab"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": ""}, plan)[0] is False

    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "Dental Clinic"}, plan)[0] is False
    assert DiscoveryOptimizer.validate_candidate({"canonical_name": "dental clinic"}, plan)[0] is False

def test_validate_candidate_sub_city_matching():
    plan = {
        "industry": "Dental Clinic",
        "location": "Manhattan, New York, USA",
        "sub_city": "Manhattan",
        "negative_keywords": ["pharmacy"],
    }

    cand_match = {
        "canonical_name": "Manhattan Dental Care Center",
        "domain": "manhattandental.com",
        "address": "5th Avenue, Manhattan, New York",
    }
    is_valid, _ = DiscoveryOptimizer.validate_candidate(cand_match, plan)
    assert is_valid is True

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

@pytest.mark.asyncio
async def test_verify_industry_fit_accepts_matching_industry():
    test_cases = [
        ("Dental Clinic", "Smile Dental Surgery", "smiledental.com", "Smile Dental Clinic & Orthodontics"),
        ("Solar Energy Installation", "SunPower Systems", "sunpowersolar.com", "SunPower Solar Energy & Panel Installation"),
        ("Roofing Contractor", "Apex Roofers Ltd", "apexroofers.com", "Premier Roofing Contractor & Roof Replacement"),
        ("Gym & Fitness Studio", "Iron Pulse Gym", "ironpulsefit.com", "Iron Pulse Fitness Studio and Training"),
    ]

    for ind, bname, dom, title in test_cases:
        is_fit, reason = await DiscoveryOptimizer.verify_industry_fit(
            target_industry=ind,
            business_name=bname,
            domain=dom,
            page_title=title,
            meta_description="Providing professional commercial services.",
        )
        assert is_fit is True, f"Failed for {ind}: {reason}"
        assert ("Direct dynamic industry keyword matched" in reason or "Industry synonym verified" in reason)

@pytest.mark.asyncio
async def test_verify_industry_fit_rejects_negative_keywords():
    is_fit, reason = await DiscoveryOptimizer.verify_industry_fit(
        target_industry="Dental Clinic",
        business_name="Apex Holdings & Realty",
        domain="apexrealty.com",
        page_title="Apex Real Estate | Luxury Apartments for Sale",
        meta_description="Find your dream home or commercial property with prime real estate developer.",
        negative_keywords=["apartments for sale", "real estate developer", "housing society"],
    )
    assert is_fit is False
    assert "Matched dynamic negative filter" in reason

def test_validate_candidate_snippet_negative_rejection():
    plan = {
        "industry": "Dental Clinic",
        "location": "Dhaka",
        "negative_keywords": ["apartments for sale", "housing society", "real estate"],
    }
    cand = {
        "canonical_name": "Gulshan Modern Center",
        "domain": "gulshancenter.com",
        "snippet": "Exclusive real estate agency offering commercial plots and apartments for sale.",
    }
    is_valid, reason = DiscoveryOptimizer.validate_candidate(cand, plan)
    assert is_valid is False
    assert "matched AI negative filter" in reason

