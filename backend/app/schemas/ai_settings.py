import uuid
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class AISettingsResponse(BaseModel):
    id: Optional[uuid.UUID] = None
    primary_provider: str
    primary_model: str
    enable_fallback: bool = True
    fallback_provider: Optional[str] = None
    fallback_model: Optional[str] = None
    
    # Masked keys for secure UI display
    groq_api_key_masked: Optional[str] = None
    openrouter_api_key_masked: Optional[str] = None
    openai_api_key_masked: Optional[str] = None
    custom_api_key_masked: Optional[str] = None
    custom_base_url: Optional[str] = None
    
    has_groq_key: bool = False
    has_openrouter_key: bool = False
    has_openai_key: bool = False
    has_custom_key: bool = False
    
    max_tokens: int = 250
    temperature: float = 0.0
    is_active: bool = True

    class Config:
        from_attributes = True

class AISettingsUpdate(BaseModel):
    primary_provider: str = Field(..., description="groq, openrouter, openai, or custom")
    primary_model: str = Field(..., description="Exact model ID e.g. qwen/qwen3.8-27b or google/gemini-2.0-flash-exp:free")
    enable_fallback: bool = Field(default=True)
    fallback_provider: Optional[str] = Field(default=None)
    fallback_model: Optional[str] = Field(default=None)
    
    # New keys provided by admin (if blank or masked '...', existing value is retained)
    groq_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    custom_api_key: Optional[str] = None
    custom_base_url: Optional[str] = None
    
    max_tokens: Optional[int] = 250
    temperature: Optional[float] = 0.0

class AITestRequest(BaseModel):
    provider: str = Field(..., description="groq, openrouter, openai, or custom")
    model: str = Field(...)
    api_key: Optional[str] = None
    custom_base_url: Optional[str] = None

class AITestResponse(BaseModel):
    success: bool
    latency_ms: float
    provider: str
    model: str
    message: str
    response_sample: Optional[Dict[str, Any]] = None
