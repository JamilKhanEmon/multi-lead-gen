import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, UUIDMixin

DEFAULT_SERVICES: List[Dict[str, Any]] = [
    {
        "key": "real_estate_erp",
        "name": "Real Estate & Construction ERP (N-RealEstate)",
        "features": "Online buyer lead capture, installment schedule & payment reminder automation, property inventory management, customer portal.",
        "pitch_angle": "Automates lead-to-booking pipeline and payment collections with zero manual errors."
    },
    {
        "key": "garments_erp",
        "name": "Garments & Apparel Manufacturing ERP (N-Apparel)",
        "features": "Fabric inventory tracking, production line scheduling, order cost calculation, commercial documentation, export workflow tracking.",
        "pitch_angle": "Reduces production bottleneck delays and prevents raw material stockouts in export garment factories."
    },
    {
        "key": "crm_whatsapp",
        "name": "Automated B2B CRM & WhatsApp Auto-Followup Engine",
        "features": "Instant WhatsApp auto-responder, multi-agent inbox, automated sales pipeline, inquiry qualification within 60 seconds.",
        "pitch_angle": "Stops inquiry loss from slow response times and boosts lead conversion rates."
    },
    {
        "key": "custom_erp",
        "name": "Custom Enterprise ERP & Financial Accounting System",
        "features": "Multi-branch financial ledger, automated invoicing, warehouse inventory control, HR/Payroll, real-time executive dashboard.",
        "pitch_angle": "Unifies disconnected Excel sheets into a single, high-speed centralized operational platform."
    },
    {
        "key": "healthcare_erp",
        "name": "Hospital & Diagnostic Clinic Management System",
        "features": "Doctor appointment scheduling, patient EMR, lab test report generation, billing & WhatsApp notification reminders.",
        "pitch_angle": "Streamlines clinic queues and delivers digital lab reports straight to patients' phones."
    },
    {
        "key": "headless_web",
        "name": "High-Converting Headless Web Platform & Booking Portal",
        "features": "Ultra-fast Next.js architecture, interactive product catalog, direct WhatsApp ordering, automated SEO & lead capture.",
        "pitch_angle": "Converts social media visitors into verified high-intent business inquiries."
    },
    {
        "key": "pos_retail",
        "name": "Cloud Point of Sale (POS) & Multi-Store Inventory",
        "features": "Barcode scanning, real-time multi-branch stock sync, low-stock WhatsApp alerts, daily profit/loss reports.",
        "pitch_angle": "Prevents retail theft and inventory mismatch across physical stores."
    },
    {
        "key": "lead_funnel",
        "name": "High-Intent Meta & Video Ad Lead Funnel",
        "features": "Laser-targeted video creative, localized audience targeting, instant lead qualification forms.",
        "pitch_angle": "Generates steady daily buyer inquiries directly into your sales pipeline."
    }
]



class CompanyKB(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "company_kb"

    company_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    tagline_experience: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    headquarters: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    master_kb_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    services_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=DEFAULT_SERVICES, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

