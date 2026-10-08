from typing import Dict, Any, Optional, List
from pydantic import BaseModel

class ComponentHealth(BaseModel):
    status: str
    latency_ms: Optional[float] = None
    details: Optional[Dict[str, Any]] = None

class SystemHealthResponse(BaseModel):
    status: str
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
    sender_name: Optional[str] = ""
    sender_title: Optional[str] = ""
    sender_company: Optional[str] = ""
    sender_email: Optional[str] = ""
    sender_phone: Optional[str] = ""
    sender_website: Optional[str] = ""
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
    company_name: Optional[str] = "Acme Enterprise"
    contact_person: Optional[str] = "Managing Director"
    location: Optional[str] = "Metro City"
    website: Optional[str] = "acme.example.com"
    phone: Optional[str] = "+1 555-0199"
    primary_gap: Optional[str] = "specifically mobile responsiveness and automated lead capture"

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

class CompanyKBResponse(BaseModel):
    id: str
    company_name: str
    tagline_experience: str
    headquarters: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    website_url: Optional[str] = None
    master_kb_notes: Optional[str] = None
    services_json: List[Dict[str, Any]]
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class CompanyKBUpdate(BaseModel):
    company_name: Optional[str] = None
    tagline_experience: Optional[str] = None
    headquarters: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    website_url: Optional[str] = None
    master_kb_notes: Optional[str] = None
    services_json: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


