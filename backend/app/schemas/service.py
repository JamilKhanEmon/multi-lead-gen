"""
Service Catalog Pydantic Schemas
"""
import uuid
from pydantic import BaseModel


class ServiceResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    category: str
    description: str
    is_active: bool

    class Config:
        from_attributes = True


class ServiceMatchResponse(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID
    service_name: str
    rule_score: float
    llm_score: float
    hybrid_fit_score: float
    why_selected: str

    class Config:
        from_attributes = True
