"""
Pydantic Schemas for Meta B2B Campaigns, Intelligence, and Funnel Configs.
"""
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class MetaTargetingConfig(BaseModel):
    job_titles: List[str] = Field(default_factory=list)
    behaviors: List[str] = Field(default_factory=list)
    interests: List[str] = Field(default_factory=list)
    exclusions: List[str] = Field(default_factory=list)
    age_min: int = 24
    age_max: int = 65


class CompetitorAdInsight(BaseModel):
    brand_or_domain: str
    headline: str
    video_hook: str
    core_offer: str
    days_running: int = 30
    engagement_signal: str = "High"


class CompetitorMarketAnalysis(BaseModel):
    scraped_competitors: List[CompetitorAdInsight] = Field(default_factory=list)
    market_pain_points: List[str] = Field(default_factory=list)
    winning_angles: List[str] = Field(default_factory=list)
    recommended_positioning: str = ""


class Post1Creative(BaseModel):
    hooks: List[str] = Field(default_factory=list)
    selected_hook: str = ""
    cold_video_script: str = ""
    primary_copy: str = ""
    headline: str = ""
    video_url: Optional[str] = None


class Post2Creative(BaseModel):
    retargeting_copy: str = ""
    offer_headline: str = ""
    offer_description: str = ""
    whatsapp_cta_label: str = "Send WhatsApp Message"
    whatsapp_number: str = ""
    prefill_message: str = ""


class CampaignResearchRequest(BaseModel):
    service_name: str
    industry: str
    target_location: str
    pain_point: Optional[str] = None
    core_offer: Optional[str] = None


class CampaignCreativeGenerateRequest(BaseModel):
    service_name: str
    industry: str
    target_location: str
    pain_point: str
    core_offer: str
    competitor_insights: Optional[Dict[str, Any]] = None


class CampaignCreate(BaseModel):
    name: str
    industry: str
    target_location: str
    service_name: str
    pain_point: Optional[str] = None
    core_offer: Optional[str] = None
    targeting_config: Dict[str, Any] = Field(default_factory=dict)
    competitor_insights: Optional[Dict[str, Any]] = Field(default_factory=dict)
    post1_creative: Dict[str, Any] = Field(default_factory=dict)
    post2_creative: Dict[str, Any] = Field(default_factory=dict)
    budget_daily_bdt: float = 500.0
    retargeting_enabled: bool = True
    retargeting_threshold_pct: int = 50


class CampaignResponse(BaseModel):
    id: str
    name: str
    industry: str
    target_location: str
    service_name: str
    pain_point: Optional[str] = None
    core_offer: Optional[str] = None
    targeting_config: Dict[str, Any]
    competitor_insights: Optional[Dict[str, Any]] = None
    post1_creative: Dict[str, Any]
    post2_creative: Dict[str, Any]
    budget_daily_bdt: float
    retargeting_enabled: bool
    retargeting_threshold_pct: int
    meta_campaign_id: Optional[str] = None
    status: str
    metrics: Dict[str, Any]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True
