"""
Users, Security Audits, System Events, Benchmarks, and Model Trace Models
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, Float, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin


class User(Base, UUIDMixin, TimestampMixin):
    """User account for dashboard access."""
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="member", nullable=False)  # super_admin, admin, member
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    permissions_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class AuditLog(Base, UUIDMixin, TimestampMixin):
    """Immutable security and action audit log."""
    __tablename__ = "audit_logs"

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # LOGIN, RESEARCH_CREATE, LEAD_FEEDBACK, CONFIG_CHANGE
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    details_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)


class SystemEvent(Base, UUIDMixin, TimestampMixin):
    """System error, warning, or degradation event log."""
    __tablename__ = "system_events"

    component: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # openclaw, ollama, postgres, redis, worker
    level: Mapped[str] = mapped_column(String(20), nullable=False)  # INFO, WARNING, ERROR, CRITICAL
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class BenchmarkResult(Base, UUIDMixin, TimestampMixin):
    """Evaluation benchmark run against golden dataset."""
    __tablename__ = "benchmark_results"

    run_name: Mapped[str] = mapped_column(String(100), nullable=False)
    total_companies: Mapped[int] = mapped_column(nullable=False)
    precision: Mapped[float] = mapped_column(Float, nullable=False)
    recall: Mapped[float] = mapped_column(Float, nullable=False)
    false_positive_rate: Mapped[float] = mapped_column(Float, nullable=False)
    useful_lead_rate: Mapped[float] = mapped_column(Float, nullable=False)
    metrics_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class ModelRun(Base, UUIDMixin, TimestampMixin):
    """Execution trace of local LLM (Ollama) calls for evaluation."""
    __tablename__ = "model_runs"

    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    validation_passed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    input_tokens: Mapped[Optional[int]] = mapped_column(nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(nullable=True)
