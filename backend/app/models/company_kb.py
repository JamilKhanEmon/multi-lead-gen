import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, UUIDMixin

DEFAULT_SERVICES: List[Dict[str, Any]] = []


class CompanyKB(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "company_kb"

    company_name: Mapped[str] = mapped_column(String(255), default="Enterprise Solutions", nullable=False)
    tagline_experience: Mapped[str] = mapped_column(
        String(500),
        default="10+ years of digital transformation & custom software engineering",
        nullable=False,
    )
    headquarters: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    services_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=DEFAULT_SERVICES, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
