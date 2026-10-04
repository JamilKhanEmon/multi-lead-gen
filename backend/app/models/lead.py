"""
Lead, Scoring, and Feedback Models
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Float, Boolean, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin


class Lead(Base, UUIDMixin, TimestampMixin):
    """Qualified potential lead output."""
    __tablename__ = "leads"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("research_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    tier: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # Strong Potential, Review Needed, Rejected
    final_score: Mapped[float] = mapped_column(Float, nullable=False, index=True)  # 0.0 to 100.0
    is_qualified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    primary_gap_summary: Mapped[str] = mapped_column(Text, nullable=False)
    explanation_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Email & Autonomous Outreach Pipeline Fields
    email_status: Mapped[str] = mapped_column(String(50), default="UNVERIFIED", nullable=False, index=True)  # VALID, NEEDS_REVIEW, INVALID, UNVERIFIED
    verification_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outreach_status: Mapped[str] = mapped_column(String(50), default="PENDING", nullable=False, index=True)  # PENDING, READY_FOR_OUTREACH, NEEDS_REVIEW, SENT, FOLLOWUP_SENT, REPLIED_HOT, REPLIED_NEUTRAL, DISCARDED
    deal_status: Mapped[str] = mapped_column(String(50), default="COLD", nullable=False, index=True)  # COLD, IN_PIPELINE, HOT_LEAD, CLOSED_WON, CLOSED_LOST
    last_contacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    followup_step: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    outreach_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    business: Mapped["Business"] = relationship("Business", back_populates="leads")
    scores: Mapped[List["LeadScore"]] = relationship("LeadScore", back_populates="lead", cascade="all, delete-orphan")
    service_matches: Mapped[List["ServiceMatch"]] = relationship("ServiceMatch", back_populates="lead", cascade="all, delete-orphan")
    feedback_entries: Mapped[List["LeadFeedback"]] = relationship("LeadFeedback", back_populates="lead", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_leads_tier_score", "tier", "final_score"),
    )


class LeadScore(Base, UUIDMixin, TimestampMixin):
    """Detailed 6-factor score breakdown for a lead."""
    __tablename__ = "lead_scores"

    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    evidence_quality: Mapped[float] = mapped_column(Float, nullable=False)  # 25% weight
    problem_relevance: Mapped[float] = mapped_column(Float, nullable=False)  # 20% weight
    problem_repetition: Mapped[float] = mapped_column(Float, nullable=False)  # 15% weight
    recency: Mapped[float] = mapped_column(Float, nullable=False)             # 15% weight
    business_impact: Mapped[float] = mapped_column(Float, nullable=False)    # 10% weight
    service_fit: Mapped[float] = mapped_column(Float, nullable=False)        # 15% weight
    final_score: Mapped[float] = mapped_column(Float, nullable=False, index=True)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="scores")


class LeadFeedback(Base, UUIDMixin, TimestampMixin):
    """Human reviewer feedback on qualified lead dossier."""
    __tablename__ = "lead_feedback"

    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # APPROVED, REJECTED, WRONG_WEAKNESS, WRONG_SERVICE, INSUFFICIENT_EVIDENCE
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="feedback_entries")
