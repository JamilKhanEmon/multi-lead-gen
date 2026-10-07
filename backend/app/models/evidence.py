import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, Float, Integer, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin

class Source(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sources"

    url: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    last_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    snapshots: Mapped[List["SourceSnapshot"]] = relationship("SourceSnapshot", back_populates="source", cascade="all, delete-orphan")
    evidence_items: Mapped[List["Evidence"]] = relationship("Evidence", back_populates="source")

class SourceSnapshot(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "source_snapshots"

    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), default="text/html", nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    source: Mapped["Source"] = relationship("Source", back_populates="snapshots")

class Evidence(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "evidence"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter_id: Mapped[int] = mapped_column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sources.id", ondelete="SET NULL"), nullable=True, index=True)
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("research_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    
    evidence_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    classification: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    recency_weight: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    conflict: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    screenshot_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    business: Mapped["Business"] = relationship("Business", back_populates="evidence")
    parameter: Mapped["Parameter"] = relationship("Parameter", back_populates="evidence_items")
    source: Mapped[Optional["Source"]] = relationship("Source", back_populates="evidence_items")

    __table_args__ = (
        Index("idx_evidence_biz_param", "business_id", "parameter_id"),
        Index("idx_evidence_status", "status"),
    )

class ParameterResult(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "parameter_results"

    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter_id: Mapped[int] = mapped_column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    evidence_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    business: Mapped["Business"] = relationship("Business", back_populates="parameter_results")
