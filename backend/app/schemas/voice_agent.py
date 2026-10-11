from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class VoiceKnowledgeBaseCreate(BaseModel):
    name: str = "Sales Assistant"
    company_name: str = ""
    agent_persona_name: str = ""
    service_name: str = ""
    service_description: str = ""
    core_offer: str = ""
    first_message: str = "Hello {{client_name}}, this is {{agent_persona_name}} from {{my_company}}. I'm reaching out regarding {{company_name}}'s recent operational audit."
    system_prompt: str
    meeting_platform: str = "Google Meet"
    office_hours_start: str = "10:00"
    office_hours_end: str = "18:00"
    is_active: bool = True
    objections_json: List[Dict[str, str]] = Field(default_factory=list)
    voice_provider: str = "elevenlabs"
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    cloned_voice_id: Optional[str] = None
    cloned_voice_name: Optional[str] = None
    auto_call_enabled: bool = False
    max_daily_calls: int = 50
    country_language_map: Dict[str, str] = Field(default_factory=dict)

class VoiceKnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    agent_persona_name: Optional[str] = None
    service_name: Optional[str] = None
    service_description: Optional[str] = None
    core_offer: Optional[str] = None
    first_message: Optional[str] = None
    system_prompt: Optional[str] = None
    meeting_platform: Optional[str] = None
    office_hours_start: Optional[str] = None
    office_hours_end: Optional[str] = None
    is_active: Optional[bool] = None
    objections_json: Optional[List[Dict[str, str]]] = None
    voice_provider: Optional[str] = None
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: Optional[str] = None
    elevenlabs_model_id: Optional[str] = None
    cloned_voice_id: Optional[str] = None
    cloned_voice_name: Optional[str] = None
    cloned_voice_sample_url: Optional[str] = None
    auto_call_enabled: Optional[bool] = None
    max_daily_calls: Optional[int] = None
    country_language_map: Optional[Dict[str, str]] = None

class VoiceKnowledgeBaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    company_name: str
    agent_persona_name: str
    service_name: str
    service_description: str
    core_offer: str
    first_message: str
    system_prompt: str
    meeting_platform: str
    office_hours_start: str
    office_hours_end: str
    is_active: bool
    objections_json: List[Dict[str, str]] = Field(default_factory=list)
    voice_provider: str = "elevenlabs"
    elevenlabs_api_key_configured: bool = False
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    cloned_voice_id: Optional[str] = None
    cloned_voice_name: Optional[str] = None
    cloned_voice_sample_url: Optional[str] = None
    auto_call_enabled: bool = False
    max_daily_calls: int = 50
    country_language_map: Dict[str, str] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class VoiceCallQueueItemCreate(BaseModel):
    contact_person: str
    contact_title: Optional[str] = None
    company_name: str
    phone: str
    country: str = "Bangladesh"
    language: str = "Bengali"
    exact_problem: str
    selected_for_call: bool = True
    lead_id: Optional[str] = None
    notes: Optional[str] = None

class VoiceCallQueueItemUpdate(BaseModel):
    contact_person: Optional[str] = None
    contact_title: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    exact_problem: Optional[str] = None
    status: Optional[str] = None
    selected_for_call: Optional[bool] = None
    meeting_link: Optional[str] = None
    meeting_time: Optional[str] = None
    notes: Optional[str] = None

class VoiceCallQueueItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lead_id: Optional[str] = None
    contact_person: str
    contact_title: Optional[str] = None
    company_name: str
    phone: str
    country: str = "Bangladesh"
    language: str = "Bengali"
    exact_problem: str
    status: str
    selected_for_call: bool
    call_attempts: int = 0
    meeting_link: Optional[str] = None
    meeting_time: Optional[str] = None
    last_called_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class BatchQueueActionRequest(BaseModel):
    action: str = "select_all"
    item_ids: Optional[List[str]] = None

class VoiceDialogueTurnRequest(BaseModel):
    queue_item_id: Optional[str] = None
    kb_id: Optional[str] = None
    user_speech_text: str
    conversation_history: List[Dict[str, str]] = Field(default_factory=list)
    client_name: Optional[str] = None
    company_name: Optional[str] = None
    exact_problem: Optional[str] = None
    language: Optional[str] = None

class VoiceDialogueTurnResponse(BaseModel):
    agent_reply_text: str
    meeting_booked: bool = False
    meeting_link: Optional[str] = None
    meeting_time: Optional[str] = None
    detected_intent: str = "general_query"
    language: str = "Bengali"
    audio_base64: Optional[str] = None
    audio_url: Optional[str] = None

class VoiceCallLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    queue_item_id: Optional[str] = None
    kb_id: Optional[str] = None
    phone: str
    company_name: str
    contact_person: str
    call_duration_seconds: int
    language_used: str = "Bengali"
    recording_url: Optional[str] = None
    transcript_json: List[Dict[str, Any]]
    sentiment: str
    meeting_booked: bool
    meeting_link: Optional[str] = None
    summary: Optional[str] = None
    created_at: Optional[str] = None
