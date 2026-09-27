"""
Research Run & Worker Job Execution Models
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin


class ResearchRun(Base, UUIDMixin, TimestampMixin):
    """Batched research operation initiated by user or schedule."""
    __tablename__ = "research_runs"

    industry: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    depth: Mapped[str] = mapped_column(String(20), default="STANDARD", nullable=False)  # QUICK, STANDARD, DEEP
    status: Mapped[str] = mapped_column(String(50), default="PENDING", nullable=False, index=True)  # PENDING, RUNNING, COMPLETED, CANCELLED, FAILED
    
    discovered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    researched_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    qualified_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    jobs: Mapped[List["ResearchJob"]] = relationship("ResearchJob", back_populates="run", cascade="all, delete-orphan")


class ResearchJob(Base, UUIDMixin, TimestampMixin):
    """Single queue task within a research run."""
    __tablename__ = "research_jobs"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("research_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    business_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=True, index=True)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # website_research, social_research, review_research, etc.
    status: Mapped[str] = mapped_column(String(50), default="QUEUED", nullable=False, index=True)  # QUEUED, RUNNING, COMPLETED, FAILED, UNAVAILABLE
    attempt: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    result_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    run: Mapped["ResearchRun"] = relationship("ResearchRun", back_populates="jobs")

    __table_args__ = (
        Index("idx_job_dedupe_task", "run_id", "business_id", "task_type"),
    )


class SchedulerRun(Base, UUIDMixin, TimestampMixin):
    """Record of OpenClaw automation webhook triggers."""
    __tablename__ = "scheduler_runs"

    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)  # webhook_cron, revalidation
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
