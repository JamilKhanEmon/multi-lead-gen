import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ResearchRunCreate(BaseModel):
    industry: str = Field(..., example="Any Commercial Business")
    country: Optional[str] = Field(default="", example="United States")
    city: Optional[str] = Field(default="", example="New York")
    sub_city: Optional[str] = Field(default="", example="Manhattan")
    location: Optional[str] = Field(default="")
    depth: str = Field(default="DEEP", example="DEEP")
    business_type_override: Optional[str] = None
    company_limit: Optional[int] = Field(default=0, example=0)
    target_services: List[str] = Field(default_factory=list)
    auto_mail_enabled: bool = Field(default=True)
    use_company_kb: bool = Field(default=True)
    analyze_website: bool = Field(default=False, description="True for deep website technical audit; False for social media & software demo focus")
    sub_areas: List[str] = Field(default_factory=list, description="Approved list of sub-areas to crawl")

class StrategyPreviewRequest(BaseModel):
    industry: str = Field(..., description="Target business type / industry")
    location: str = Field(..., description="Target location or region")
    country: Optional[str] = Field(default="", description="Target country")
    city: Optional[str] = Field(default="", description="Target city")
    analyze_website: bool = Field(default=False)
    max_services: Optional[int] = Field(default=0, ge=0, le=10, description="0 for LLM Self/Auto mode, or 1 to 10 for manual limit")

class ResearchJobResponse(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    business_id: Optional[uuid.UUID]
    task_type: str
    status: str
    attempt: int
    max_attempts: int
    payload_json: Dict[str, Any]
    error_message: Optional[str]

    class Config:
        from_attributes = True

class ResearchRunResponse(BaseModel):
    id: uuid.UUID
    industry: str
    location: str
    depth: str
    status: str
    discovered_count: int
    researched_count: int
    qualified_count: int
    rejected_count: int
    failed_count: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True
