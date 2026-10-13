import uuid
from typing import Optional, Dict, Any
from sqlalchemy import String, Integer, Float, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, UUIDMixin

class AISettings(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ai_settings"

    # Primary provider configuration
    primary_provider: Mapped[str] = mapped_column(String(50), default="groq", nullable=False)
    primary_model: Mapped[str] = mapped_column(String(150), default="qwen/qwen3.8-27b", nullable=False)
    
    # Fallback configuration
    enable_fallback: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fallback_provider: Mapped[Optional[str]] = mapped_column(String(50), default="openrouter", nullable=True)
    fallback_model: Mapped[Optional[str]] = mapped_column(String(150), default="meta-llama/llama-3.3-70b-instruct:free", nullable=True)
    
    # Provider API keys (Stored securely)
    groq_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    openrouter_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    openai_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Generation parameters
    max_tokens: Mapped[int] = mapped_column(Integer, default=250, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    
    # Custom model aliases or metadata
    metadata_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=dict, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
