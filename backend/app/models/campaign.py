import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Float, Integer, Boolean, DateTime, JSON
from app.models.base import Base

class MetaCampaign(Base):
    __tablename__ = "meta_campaigns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, default="Untitled B2B Campaign")
    industry = Column(String(100), nullable=False)
    target_location = Column(String(255), nullable=False)
    service_name = Column(String(255), nullable=False)
    pain_point = Column(Text, nullable=True)
    core_offer = Column(Text, nullable=True)

    targeting_config = Column(JSON, nullable=False, default=dict)

    competitor_insights = Column(JSON, nullable=True, default=dict)

    post1_creative = Column(JSON, nullable=False, default=dict)

    post2_creative = Column(JSON, nullable=False, default=dict)

    budget_daily_bdt = Column(Float, nullable=False, default=500.0)
    retargeting_enabled = Column(Boolean, nullable=False, default=True)
    retargeting_threshold_pct = Column(Integer, nullable=False, default=50)

    meta_campaign_id = Column(String(100), nullable=True)
    meta_adset_cold_id = Column(String(100), nullable=True)
    meta_adset_retarget_id = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False, default="DRAFT")

    metrics = Column(JSON, nullable=False, default=lambda: {
        "spend_bdt": 0.0,
        "impressions": 0,
        "video_views": 0,
        "thruplays_15s": 0,
        "qualified_50pct_viewers": 0,
        "whatsapp_clicks": 0,
        "conversations_started": 0,
        "cost_per_whatsapp_lead": 0.0,
    })

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "industry": self.industry,
            "target_location": self.target_location,
            "service_name": self.service_name,
            "pain_point": self.pain_point,
            "core_offer": self.core_offer,
            "targeting_config": self.targeting_config or {},
            "competitor_insights": self.competitor_insights or {},
            "post1_creative": self.post1_creative or {},
            "post2_creative": self.post2_creative or {},
            "budget_daily_bdt": self.budget_daily_bdt,
            "retargeting_enabled": self.retargeting_enabled,
            "retargeting_threshold_pct": self.retargeting_threshold_pct,
            "meta_campaign_id": self.meta_campaign_id,
            "status": self.status,
            "metrics": self.metrics or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
