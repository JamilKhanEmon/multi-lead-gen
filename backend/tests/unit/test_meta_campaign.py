"""
Unit tests for B2B Meta Ads Engine, Intelligence, and Funnel Client.
"""
import pytest
from unittest.mock import patch, AsyncMock
from app.engine.meta_intelligence import MetaIntelligenceEngine
from app.services.meta_client import MetaClient
from app.schemas.campaign import CampaignCreate, CampaignResponse
from app.models.campaign import MetaCampaign


@pytest.mark.asyncio
async def test_meta_intelligence_targeting_and_competitor_synthesis():
    """Validates that market and competitor analysis returns correct B2B parameters."""
    with patch("app.engine.meta_intelligence.OllamaClient.analyze", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = {
            "recommended_targeting": {
                "job_titles": ["Managing Director", "QA Manager", "Factory Director"],
                "behaviors": ["Facebook Business Page Admins"],
                "interests": ["Textile Manufacturing", "Defect Detection"],
                "exclusions": ["Students", "Job Seekers"],
            },
            "scraped_competitors": [
                {
                    "brand_or_domain": "Test Vision Systems",
                    "headline": "Stop fabric defects",
                    "video_hook": "Watch this camera spot micro tears",
                    "core_offer": "Free 1-day live demo",
                    "days_running": 30,
                }
            ],
            "winning_angles": ["1-day on-site trial", "Proof-first video"],
        }

        res = await MetaIntelligenceEngine.analyze_market_and_competitors(
            service_name="Computer Vision Defect Detection",
            industry="Manufacturing & Engineering",
            target_location="Chicago, USA",
        )

        assert "targeting" in res
        assert "competitor_insights" in res
        assert "Managing Director" in res["targeting"]["job_titles"]
        assert "Students" in res["targeting"]["exclusions"]


@pytest.mark.asyncio
async def test_meta_intelligence_creatives_generation():
    """Validates that 2-step creatives are properly formed with Post 1 hook and Post 2 WhatsApp CTA."""
    creatives = await MetaIntelligenceEngine.generate_funnel_creatives(
        service_name="Computer Vision Defect Detection",
        industry="Manufacturing & Engineering",
        target_location="Chicago, USA",
        pain_point="Operational wastage",
        core_offer="Free 1-day demo",
    )

    assert "post1" in creatives
    assert "post2" in creatives
    assert len(creatives["post1"]["hooks"]) >= 1
    assert "cold_video_script" in creatives["post1"]
    assert "whatsapp_cta_label" in creatives["post2"]
    assert creatives["post2"]["whatsapp_cta_label"] == "Send WhatsApp Message"


@pytest.mark.asyncio
async def test_meta_client_sandbox_publish_and_metrics():
    """Validates MetaClient sandbox deployment and live metric progression."""
    client = MetaClient()
    assert client.is_live is False

    publish_result = await client.publish_funnel_campaign(
        name="Test Garments Funnel",
        targeting_config={"job_titles": ["MD", "CEO"]},
        post1_creative={"headline": "Test Post 1"},
        post2_creative={"offer_headline": "Test Post 2"},
        budget_daily_bdt=500.0,
        retargeting_threshold_pct=50,
    )

    assert publish_result["success"] is True
    assert "meta_campaign_id" in publish_result
    assert "meta_adset_cold_id" in publish_result
    assert "meta_adset_retarget_id" in publish_result
    assert publish_result["status"] == "ACTIVE"

    # Test metric calculation
    mock_campaign = MetaCampaign(
        id="test-123",
        name="Commercial Tech Funnel",
        industry="Technology",
        target_location="Chicago, USA",
        service_name="Vision AI",
        budget_daily_bdt=500.0,
        retargeting_threshold_pct=50,
        status="ACTIVE",
        metrics={
            "spend_bdt": 0.0,
            "video_views": 0,
            "thruplays_15s": 0,
            "qualified_50pct_viewers": 0,
            "whatsapp_clicks": 0,
            "conversations_started": 0,
            "cost_per_whatsapp_lead": 0.0,
        },
    )

    metrics = MetaClient.calculate_live_metrics(mock_campaign)
    assert metrics["spend_bdt"] > 0
    assert metrics["video_views"] > 0
    assert metrics["thruplays_15s"] > 0
    assert metrics["qualified_50pct_viewers"] > 0
    assert metrics["whatsapp_clicks"] > 0
