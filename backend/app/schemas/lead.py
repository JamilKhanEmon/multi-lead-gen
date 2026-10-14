import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class LeadScoreResponse(BaseModel):
    evidence_quality: float
    problem_relevance: float
    problem_repetition: float
    recency: float
    business_impact: float
    service_fit: float
    final_score: float

    class Config:
        from_attributes = True

class LeadFeedbackCreate(BaseModel):
    action: str = Field(..., example="APPROVED")
    notes: Optional[str] = None

class LeadFeedbackResponse(BaseModel):
    id: uuid.UUID
    action: str
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class LeadResponse(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    run_id: Optional[uuid.UUID] = None
    tier: str
    final_score: float
    is_qualified: bool
    primary_gap_summary: str
    created_at: datetime
    business_name: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    email_status: Optional[str] = "UNVERIFIED"
    verification_notes: Optional[str] = None
    outreach_status: Optional[str] = "PENDING"
    deal_status: Optional[str] = "COLD"
    followup_step: Optional[int] = 0
    last_contacted_at: Optional[datetime] = None
    contact_person: Optional[str] = None
    contact_title: Optional[str] = None
    address: Optional[str] = None
    business_type: Optional[str] = None
    google_maps_url: Optional[str] = None
    google_search_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    fit_tier: Optional[str] = "HOT"
    why_they_need_us: Optional[str] = None
    what_they_need: Optional[str] = None
    discovery_call_script: Optional[str] = None
    matched_service: Optional[str] = None
    phone_verified: Optional[bool] = False
    phone_sources: Optional[List[str]] = None
    secondary_phone: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    meta_ads_url: Optional[str] = None

    class Config:
        from_attributes = True

class EvidenceItemResponse(BaseModel):
    parameter_id: int
    parameter_name: Optional[str] = None
    parameter_category: Optional[str] = None
    parameter_description: Optional[str] = None
    evidence_text: str
    source_url: Optional[str] = None
    source_type: Optional[str] = None
    status: str
    confidence: float
    recency_weight: int
    classification: Optional[str] = None

    class Config:
        from_attributes = True

class ResearchJobSummaryResponse(BaseModel):
    id: uuid.UUID
    task_type: str
    status: str
    attempt: int
    payload_json: Dict[str, Any] = {}
    result_json: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True

class LeadDetailResponse(LeadResponse):
    business_name: str
    domain: Optional[str]
    business_type: str
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    contact_title: Optional[str] = None
    address: Optional[str] = None
    linkedin_url: Optional[str] = None
    explanation_json: Dict[str, Any]
    scores: List[LeadScoreResponse] = []
    feedback_entries: List[LeadFeedbackResponse] = []
    evidence: List[EvidenceItemResponse] = []
    research_jobs: List[ResearchJobSummaryResponse] = []
    all_parameters_matrix: List[Dict[str, Any]] = []
    metadata_json: Optional[Dict[str, Any]] = None
    outreach_logs: List[Dict[str, Any]] = []
    outreach_status: Optional[str] = None
    deal_status: Optional[str] = None

class LeadUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    contact_title: Optional[str] = None
    address: Optional[str] = None
    primary_gap_summary: Optional[str] = None
    tier: Optional[str] = None
    fit_tier: Optional[str] = None
    why_they_need_us: Optional[str] = None
    what_they_need: Optional[str] = None
    discovery_call_script: Optional[str] = None
    matched_service: Optional[str] = None
    approve_for_outreach: Optional[bool] = None
    outreach_status: Optional[str] = None

class StaggeredDispatchCreate(BaseModel):
    lead_ids: Optional[List[uuid.UUID]] = None
    min_delay_sec: int = Field(default=45, ge=1, le=600)
    max_delay_sec: int = Field(default=90, ge=1, le=600)
