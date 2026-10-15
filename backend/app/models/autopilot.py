import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, Integer, Float, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin

class AutopilotCampaign(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "autopilot_campaigns"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    keywords: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    country: Mapped[str] = mapped_column(String(100), default="Bangladesh", nullable=False, index=True)
    sub_cities: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    
    daily_lead_limit: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    daily_email_limit: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    is_unlimited_leads: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_mail_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    use_global_template: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    use_company_kb: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    analyze_website: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    
    status: Mapped[str] = mapped_column(String(50), default="IDLE", nullable=False, index=True)
    current_city_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    total_leads_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_emails_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_replies_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_hot_deals_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    @property
    def batch_size(self) -> int:
        if self.is_unlimited_leads:
            return 0
        return self.daily_lead_limit or 0

    @batch_size.setter
    def batch_size(self, val: int):
        if val <= 0:
            self.is_unlimited_leads = True
            self.daily_lead_limit = 0
        else:
            self.is_unlimited_leads = False
            self.daily_lead_limit = val

    outreach_logs: Mapped[List["EmailOutreachLog"]] = relationship("EmailOutreachLog", back_populates="campaign", cascade="all, delete-orphan")

class EmailOutreachLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "email_outreach_logs"

    lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=True, index=True)
    campaign_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("autopilot_campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    
    step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body_snippet: Mapped[str] = mapped_column(Text, nullable=False)
    
    status: Mapped[str] = mapped_column(String(50), default="QUEUED", nullable=False, index=True)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    reply_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reply_sentiment: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    campaign: Mapped[Optional["AutopilotCampaign"]] = relationship("AutopilotCampaign", back_populates="outreach_logs")
    lead: Mapped["Lead"] = relationship("Lead")
