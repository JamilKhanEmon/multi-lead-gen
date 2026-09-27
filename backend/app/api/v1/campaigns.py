"""
FastAPI Endpoints for B2B Meta Ads Campaigns & 2-Step Video Retargeting Funnel.
"""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.campaign import MetaCampaign
from app.schemas.campaign import (
    CampaignResearchRequest,
    CampaignCreativeGenerateRequest,
    CampaignCreate,
    CampaignResponse,
)
from app.engine.meta_intelligence import MetaIntelligenceEngine
from app.services.meta_client import MetaClient
from app.core.logging import logger

router = APIRouter(prefix="/campaigns", tags=["B2B Meta Ads Campaigns"])


@router.post("/research", response_model=Dict[str, Any])
async def conduct_market_and_competitor_research(request: CampaignResearchRequest):
    """
    Executes LLM query expansion and OpenClaw competitor research.
    Returns recommended B2B targeting and live competitor ad angles.
    """
    try:
        results = await MetaIntelligenceEngine.analyze_market_and_competitors(
            service_name=request.service_name,
            industry=request.industry,
            target_location=request.target_location,
            pain_point=request.pain_point,
            core_offer=request.core_offer,
        )
        return results
    except Exception as e:
        logger.error(f"Campaign research failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-creatives", response_model=Dict[str, Any])
async def generate_funnel_creatives(request: CampaignCreativeGenerateRequest):
    """
    Generates 2-Step Video Funnel Creatives:
    - Post 1: 3-second hooks, cold video script, primary copy, headline.
    - Post 2: Retargeting copy, offer details, WhatsApp CTA button, pre-filled message.
    """
    try:
        creatives = await MetaIntelligenceEngine.generate_funnel_creatives(
            service_name=request.service_name,
            industry=request.industry,
            target_location=request.target_location,
            pain_point=request.pain_point,
            core_offer=request.core_offer,
            competitor_insights=request.competitor_insights,
        )
        return creatives
    except Exception as e:
        logger.error(f"Creative generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-storyboard")
async def generate_video_storyboard(payload: Dict[str, Any]):
    """
    Generates a 4-scene Hollywood-grade commercial storyboard with character/hardware anchor consistency.
    """
    from app.services.video_engine import VideoMediaEngine
    try:
        scenes = await VideoMediaEngine.generate_storyboard(
            service_name=payload.get("service_name", "B2B AI System"),
            industry=payload.get("industry", "Manufacturing"),
            selected_topic=payload.get("selected_topic", "Enterprise ROI & Operational Efficiency"),
            reference_image_description=payload.get("reference_image_description"),
        )
        return {"scenes": scenes}
    except Exception as e:
        logger.error(f"Storyboard generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render-scene")
async def render_individual_scene(payload: Dict[str, Any]):
    """
    Renders or regenerates an individual video scene with reference image locking.
    """
    from app.services.video_engine import VideoMediaEngine
    try:
        result = await VideoMediaEngine.render_single_scene(
            scene_number=payload.get("scene_number", 1),
            prompt=payload.get("prompt", ""),
            reference_image_url=payload.get("reference_image_url"),
        )
        return result
    except Exception as e:
        logger.error(f"Scene render failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stitch-video")
async def stitch_scenes_into_video(payload: Dict[str, Any]):
    """
    Stitches multiple scene clips into a single high-impact 20s B2B Meta commercial.
    """
    from app.services.video_engine import VideoMediaEngine
    try:
        result = await VideoMediaEngine.stitch_scenes(
            scenes=payload.get("scenes", []),
            campaign_name=payload.get("campaign_name", "B2B Commercial"),
        )
        return result
    except Exception as e:
        logger.error(f"Video stitching failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-poster")
async def generate_b2b_poster(payload: Dict[str, Any]):
    """
    Generates a high-converting promotional poster image using Google Imagen 3.
    """
    from app.services.video_engine import VideoMediaEngine
    try:
        result = await VideoMediaEngine.generate_b2b_poster(
            service_name=payload.get("service_name", "B2B AI Solution"),
            industry=payload.get("industry", "Manufacturing"),
            headline=payload.get("headline", "Free 1-Day Live On-Site Trial"),
            offer=payload.get("offer", "Zero Risk Demo on your active line"),
            reference_image_url=payload.get("reference_image_url"),
        )
        return result
    except Exception as e:
        logger.error(f"Poster generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.post("", response_model=CampaignResponse)
def create_campaign(payload: CampaignCreate, db: Session = Depends(get_db)):
    """Creates a new B2B Meta campaign draft."""
    try:
        campaign = MetaCampaign(
            name=payload.name,
            industry=payload.industry,
            target_location=payload.target_location,
            service_name=payload.service_name,
            pain_point=payload.pain_point,
            core_offer=payload.core_offer,
            targeting_config=payload.targeting_config,
            competitor_insights=payload.competitor_insights,
            post1_creative=payload.post1_creative,
            post2_creative=payload.post2_creative,
            budget_daily_bdt=payload.budget_daily_bdt,
            retargeting_enabled=payload.retargeting_enabled,
            retargeting_threshold_pct=payload.retargeting_threshold_pct,
            status="READY",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        return campaign.to_dict()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[CampaignResponse])
def list_campaigns(limit: int = 50, db: Session = Depends(get_db)):
    """Lists all saved B2B Meta campaigns."""
    campaigns = db.query(MetaCampaign).order_by(MetaCampaign.created_at.desc()).limit(limit).all()
    return [c.to_dict() for c in campaigns]


@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(campaign_id: str, db: Session = Depends(get_db)):
    """Retrieves a single campaign by ID."""
    campaign = db.query(MetaCampaign).filter(MetaCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign.to_dict()


@router.post("/{campaign_id}/publish")
async def publish_campaign(campaign_id: str, db: Session = Depends(get_db)):
    """Publishes campaign to Meta Ads using 2-step retargeting funnel."""
    campaign = db.query(MetaCampaign).filter(MetaCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    client = MetaClient()
    publish_result = await client.publish_funnel_campaign(
        name=campaign.name,
        targeting_config=campaign.targeting_config or {},
        post1_creative=campaign.post1_creative or {},
        post2_creative=campaign.post2_creative or {},
        budget_daily_bdt=campaign.budget_daily_bdt,
        retargeting_threshold_pct=campaign.retargeting_threshold_pct,
    )

    campaign.meta_campaign_id = publish_result.get("meta_campaign_id")
    campaign.meta_adset_cold_id = publish_result.get("meta_adset_cold_id")
    campaign.meta_adset_retarget_id = publish_result.get("meta_adset_retarget_id")
    campaign.status = "ACTIVE"

    db.commit()
    db.refresh(campaign)

    return {
        "success": True,
        "campaign": campaign.to_dict(),
        "meta_result": publish_result,
    }


@router.post("/{campaign_id}/toggle-status")
async def toggle_campaign_status(campaign_id: str, db: Session = Depends(get_db)):
    """Toggles campaign status between ACTIVE and PAUSED and syncs to Meta."""
    campaign = db.query(MetaCampaign).filter(MetaCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    new_status = "PAUSED" if campaign.status == "ACTIVE" else "ACTIVE"
    campaign.status = new_status

    if campaign.meta_campaign_id:
        client = MetaClient()
        await client.update_campaign_status(campaign.meta_campaign_id, new_status)

    db.commit()
    db.refresh(campaign)
    return {"id": campaign.id, "status": campaign.status}


@router.get("/{campaign_id}/metrics")
def get_live_metrics(campaign_id: str, db: Session = Depends(get_db)):
    """Returns real-time live performance metrics for the campaign."""
    campaign = db.query(MetaCampaign).filter(MetaCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    metrics = MetaClient.calculate_live_metrics(campaign)
    campaign.metrics = metrics
    db.commit()
    return metrics


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str, db: Session = Depends(get_db)):
    """Deletes a campaign and stops/removes it from Meta."""
    campaign = db.query(MetaCampaign).filter(MetaCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.meta_campaign_id:
        client = MetaClient()
        await client.delete_meta_campaign(campaign.meta_campaign_id)

    db.delete(campaign)
    db.commit()
    return {"success": True, "deleted_id": campaign_id}

