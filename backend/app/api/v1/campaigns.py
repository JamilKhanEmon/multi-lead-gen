from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.audit import User
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
async def conduct_market_and_competitor_research(
    request: CampaignResearchRequest,
    current_user: User = Depends(get_current_user),
):
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
async def generate_funnel_creatives(
    request: CampaignCreativeGenerateRequest,
    current_user: User = Depends(get_current_user),
):
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
async def generate_video_storyboard(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="AI Video Storyboard generation is locked by administrator. Please upload video files directly.",
    )

@router.post("/render-scene")
async def render_individual_scene(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="AI Scene rendering is locked by administrator. Please upload video files directly.",
    )

@router.post("/stitch-video")
async def stitch_scenes_into_video(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="AI Video stitching is locked by administrator. Please upload video files directly.",
    )

@router.post("/generate-poster")
async def generate_b2b_poster(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="AI Poster generation is locked by administrator. Please upload poster image directly.",
    )

@router.post("", response_model=CampaignResponse)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        await db.commit()
        await db.refresh(campaign)
        return campaign.to_dict()
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(MetaCampaign).order_by(MetaCampaign.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    campaigns = res.scalars().all()
    return [c.to_dict() for c in campaigns]

@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(MetaCampaign).where(MetaCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign.to_dict()

@router.post("/{campaign_id}/publish")
async def publish_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(MetaCampaign).where(MetaCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
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

    await db.commit()
    await db.refresh(campaign)

    return {
        "success": True,
        "campaign": campaign.to_dict(),
        "meta_result": publish_result,
    }

@router.post("/{campaign_id}/toggle-status")
async def toggle_campaign_status(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(MetaCampaign).where(MetaCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    new_status = "PAUSED" if campaign.status == "ACTIVE" else "ACTIVE"
    campaign.status = new_status

    if campaign.meta_campaign_id:
        client = MetaClient()
        await client.update_campaign_status(campaign.meta_campaign_id, new_status)

    await db.commit()
    await db.refresh(campaign)
    return {"id": campaign.id, "status": campaign.status}

@router.get("/{campaign_id}/metrics")
async def get_live_metrics(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(MetaCampaign).where(MetaCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    metrics = MetaClient.calculate_live_metrics(campaign)
    campaign.metrics = metrics
    await db.commit()
    return metrics

@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(MetaCampaign).where(MetaCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.meta_campaign_id:
        client = MetaClient()
        await client.delete_meta_campaign(campaign.meta_campaign_id)

    await db.delete(campaign)
    await db.commit()
    return {"success": True, "deleted_id": campaign_id}

