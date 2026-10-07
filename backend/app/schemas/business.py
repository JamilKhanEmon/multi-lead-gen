import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class BusinessLocationResponse(BaseModel):
    id: uuid.UUID
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]

    class Config:
        from_attributes = True

class BusinessResponse(BaseModel):
    id: uuid.UUID
    canonical_name: str
    domain: Optional[str]
    phone: Optional[str]
    business_type: str
    metadata_json: Dict[str, Any]
    locations: List[BusinessLocationResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True
