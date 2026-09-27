"""
Parameter & Business Type Pydantic Schemas
"""
from typing import Optional
from pydantic import BaseModel


class ParameterResponse(BaseModel):
    id: int
    name: str
    category: str
    detection_type: str
    default_weight: float
    description: str

    class Config:
        from_attributes = True


class BusinessTypeResponse(BaseModel):
    slug: str
    display_name: str
    description: Optional[str]

    class Config:
        from_attributes = True
