"""
Service Catalog & Matching Models
"""
import uuid
from typing import Optional, List
from sqlalchemy import String, Text, Float, Integer, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin


class Service(Base, UUIDMixin, TimestampMixin):
    """Catalog of services provided by our agency/business."""
    __tablename__ = "services"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    rules: Mapped[List["ServiceRule"]] = relationship("ServiceRule", back_populates="service", cascade="all, delete-orphan")
    matches: Mapped[List["ServiceMatch"]] = relationship("ServiceMatch", back_populates="service", cascade="all, delete-orphan")


class ServiceRule(Base, TimestampMixin):
    """Deterministic rule mapping a parameter ID to a target service."""
    __tablename__ = "service_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter_id: Mapped[int] = mapped_column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)  # 0.0 to 1.0 confidence boost
    rationale: Mapped[str] = mapped_column(Text, nullable=False)

    service: Mapped["Service"] = relationship("Service", back_populates="rules")


class ServiceMatch(Base, UUIDMixin, TimestampMixin):
    """Result of hybrid service matching (40% rules + 60% LLM)."""
    __tablename__ = "service_matches"

    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_score: Mapped[float] = mapped_column(Float, nullable=False)
    llm_score: Mapped[float] = mapped_column(Float, nullable=False)
    hybrid_fit_score: Mapped[float] = mapped_column(Float, nullable=False, index=True)  # >= 0.65 threshold
    why_selected: Mapped[str] = mapped_column(Text, nullable=False)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="service_matches")
    service: Mapped["Service"] = relationship("Service", back_populates="matches")
