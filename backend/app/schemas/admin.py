"""
System Health & Admin Monitoring Schemas
"""
from typing import Dict, Any, Optional
from pydantic import BaseModel


class ComponentHealth(BaseModel):
    status: str  # healthy, degraded, down
    latency_ms: Optional[float] = None
    details: Optional[Dict[str, Any]] = None


class SystemHealthResponse(BaseModel):
    status: str  # healthy, degraded, down
    components: Dict[str, ComponentHealth]


class SystemMetricsResponse(BaseModel):
    queue_depth: int
    active_runs: int
    total_leads: int
    qualified_leads: int
    worker_concurrency: int


class EmailTemplateResponse(BaseModel):
    id: str
    name: str
    subject: str
    body: str
    sender_name: str
    sender_title: str
    sender_company: str
    sender_email: str
    sender_phone: str
    sender_website: Optional[str] = None
    sign_off: str
    signature_text: Optional[str] = ""
    signature_rendered: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class EmailTemplateUpdate(BaseModel):
    subject: str
    body: str
    sender_name: Optional[str] = "Jamil Khan"
    sender_title: Optional[str] = "Senior Solutions Consultant"
    sender_company: Optional[str] = "Multi-Lead Gen AI"
    sender_email: Optional[str] = "contact@leadgen.local"
    sender_phone: Optional[str] = "+880 1700-000000"
    sender_website: Optional[str] = "https://leadgen.local"
    sign_off: Optional[str] = "Sincerely,"
    signature_text: Optional[str] = ""
    is_active: Optional[bool] = True


class EmailPreviewRequest(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    sender_name: Optional[str] = None
    sender_title: Optional[str] = None
    sender_company: Optional[str] = None
    sender_email: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_website: Optional[str] = None
    sign_off: Optional[str] = None
    signature_text: Optional[str] = None
    # Sample lead variables for testing
    company_name: Optional[str] = "Tropical Homes Ltd."
    contact_person: Optional[str] = "Managing Director"
    location: Optional[str] = "Gulshan-2, Dhaka"
    website: Optional[str] = "tropicalhomesltd.com"
    phone: Optional[str] = "+880 1711-223344"
    primary_gap: Optional[str] = "specifically mobile responsiveness and automated WhatsApp lead booking"


class PersonaSignatureCreate(BaseModel):
    title: str = "Primary Signature"
    raw_content: str
    is_active: bool = True


class PersonaSignatureUpdate(BaseModel):
    title: Optional[str] = None
    raw_content: Optional[str] = None
    is_active: Optional[bool] = None


class PersonaSignatureResponse(BaseModel):
    id: str
    title: str
    raw_content: str
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


