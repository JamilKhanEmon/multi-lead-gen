import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, UUIDMixin

DEFAULT_SERVICES: List[Dict[str, Any]] = [
    {
        "key": "web_dev",
        "name": "Web Design & Development (Site in 7 Days)",
        "wedge": "High-Converting Mobile Landing Page / Website Revamp",
        "description": "Custom modern responsive website with instant WhatsApp & lead capture forms.",
    },
    {
        "key": "crm_lead",
        "name": "Custom CRM & Lead Capture Pipeline",
        "wedge": "Automated Lead Capture & Inquiry Notification System",
        "description": "On-site buyer inquiry capture, automated WhatsApp/SMS notifications, and team sales tracking.",
    },
    {
        "key": "erp_management",
        "name": "Custom Enterprise ERP (Inventory, Accounts & Operations)",
        "wedge": "Lightweight Cloud Billing & Daily Operations Tracker",
        "description": "End-to-end ERP customized for Real Estate, Hospitals, Schools, Restaurants, or Supply Chain.",
    },
    {
        "key": "digital_marketing",
        "name": "Digital Marketing & SMS Outreach Wedge",
        "wedge": "Targeted SMS Blast & Local Google SEO Audit",
        "description": "Targeted local SEO, SMS campaigns, and Meta conversion tracking setup.",
    },
    {
        "key": "ecommerce_portal",
        "name": "E-Commerce & Digital Ordering System",
        "wedge": "Online Product Showcase with Direct WhatsApp Ordering",
        "description": "Full e-commerce platform with automated payment gateway, delivery tracking, and stock sync.",
    },
]

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
