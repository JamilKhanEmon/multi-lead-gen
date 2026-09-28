"""
Research Run & Task Execution Pydantic Schemas
"""
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
    depth: str = Field(default="DEEP", example="DEEP")  # QUICK, STANDARD, DEEP
    company_limit: int = Field(default=0, ge=0, le=1000000)
    business_type_override: Optional[str] = None
    target_services: List[str] = Field(default_factory=list)


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
