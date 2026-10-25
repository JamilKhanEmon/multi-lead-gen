import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey, Index, Float
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin

DEFAULT_OBJECTIONS: List[Dict[str, str]] = []
DEFAULT_SCRIPT_QUESTIONS: List[Dict[str, Any]] = []
DEFAULT_FAQ_KB: List[Dict[str, Any]] = []

DEFAULT_COUNTRY_LANGUAGE_MAP: Dict[str, str] = {
    "Bangladesh": "Bengali",
    "India": "Bengali",
    "United States": "English",
    "United Kingdom": "English",
    "Canada": "English",
    "Australia": "English",
    "United Arab Emirates": "Arabic",
    "Saudi Arabia": "Arabic",
    "Qatar": "Arabic",
    "Spain": "Spanish",
    "Global": "English"
}

class VoiceKnowledgeBase(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "voice_knowledge_bases"

    name: Mapped[str] = mapped_column(String(255), default="Sales Assistant", nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), default="Global Enterprise Solutions", nullable=False)
    agent_persona_name: Mapped[str] = mapped_column(String(100), default="Alex", nullable=False)
    service_name: Mapped[str] = mapped_column(String(255), default="Client Acquisition & Conversion Systems", nullable=False)
    service_description: Mapped[str] = mapped_column(Text, default="Automated buyer lead qualification and operational gap fixing.", nullable=False)
    core_offer: Mapped[str] = mapped_column(String(255), default="100% Risk-Free 14-Day Pilot Implementation", nullable=False)
    
    first_message: Mapped[str] = mapped_column(
        Text, 
        default="Hello {{client_name}}, this is {{agent_persona_name}} from {{my_company}}. I'm reaching out regarding {{company_name}}'s digital presence and website audit.", 
        nullable=False
    )
    system_prompt: Mapped[str] = mapped_column(
        Text,
        default="""You are an elite, consultative B2B Sales Executive.
Goal: Mention the exact flaw/problem identified at {{company_name}}: "{{exact_problem}}".
Rule: Keep EVERY response under 18 words (maximum 8 seconds of speech).
Do NOT give long lectures. If they ask about pricing, highlight our risk-free pilot: "{{core_offer}}".
Pivot quickly to book a 10-minute Zoom or Google Meet demo: "Does tomorrow 11 AM or 3 PM work better for you?"
When a time is agreed, confirm the slot and state that the meeting link is being dispatched via WhatsApp/SMS.""",
        nullable=False
    )
    
    meeting_platform: Mapped[str] = mapped_column(String(50), default="Google Meet", nullable=False)
    calendly_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    calendly_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    office_hours_start: Mapped[str] = mapped_column(String(10), default="10:00", nullable=False)
    office_hours_end: Mapped[str] = mapped_column(String(10), default="18:00", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    objections_json: Mapped[list] = mapped_column(JSONB, default=DEFAULT_OBJECTIONS, nullable=False)
    script_questions_json: Mapped[list] = mapped_column(JSONB, default=DEFAULT_SCRIPT_QUESTIONS, nullable=False)
    faq_kb_json: Mapped[list] = mapped_column(JSONB, default=DEFAULT_FAQ_KB, nullable=False)

    # ElevenLabs & Telephony Settings
    voice_provider: Mapped[str] = mapped_column(String(50), default="elevenlabs", nullable=False)
    elevenlabs_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    elevenlabs_voice_id: Mapped[str] = mapped_column(String(100), default="21m00Tcm4TlvDq8ikWAM", nullable=False) # Rachel / default
    elevenlabs_model_id: Mapped[str] = mapped_column(String(100), default="eleven_multilingual_v2", nullable=False)
    elevenlabs_agent_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    elevenlabs_llm: Mapped[str] = mapped_column(String(50), default="gemini-1.5-flash", nullable=False)
    
    cloned_voice_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cloned_voice_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cloned_voice_sample_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # ElevenLabs Studio Controls
    interruptible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    voice_stability: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    voice_similarity: Mapped[float] = mapped_column(Float, default=0.75, nullable=False)
    voice_speed: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    agent_timezone: Mapped[str] = mapped_column(String(50), default="Asia/Dhaka", nullable=False)

    # Dynamic Speech Prompts (Zero Hardcoded Speech, Admin sets manually)
    whatsapp_prompt_question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email_prompt_question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meeting_confirmation_speech: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Auto-Call Autopilot
    auto_call_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_daily_calls: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    country_language_map: Mapped[dict] = mapped_column(JSONB, default=DEFAULT_COUNTRY_LANGUAGE_MAP, nullable=False)

    call_logs: Mapped[List["VoiceCallLog"]] = relationship("VoiceCallLog", back_populates="knowledge_base")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "company_name": self.company_name,
            "agent_persona_name": self.agent_persona_name,
            "service_name": self.service_name,
            "service_description": self.service_description,
            "core_offer": self.core_offer,
            "first_message": self.first_message,
            "system_prompt": self.system_prompt,
            "meeting_platform": self.meeting_platform,
            "calendly_url": self.calendly_url or "",
            "calendly_api_key_configured": bool(self.calendly_api_key),
            "office_hours_start": self.office_hours_start,
            "office_hours_end": self.office_hours_end,
            "is_active": self.is_active,
            "objections_json": self.objections_json or [],
            "script_questions_json": self.script_questions_json or [],
            "faq_kb_json": self.faq_kb_json or [],
            "voice_provider": self.voice_provider,
            "elevenlabs_api_key_configured": bool(self.elevenlabs_api_key),
            "elevenlabs_voice_id": self.elevenlabs_voice_id,
            "elevenlabs_model_id": self.elevenlabs_model_id,
            "elevenlabs_agent_id": self.elevenlabs_agent_id,
            "elevenlabs_llm": self.elevenlabs_llm or "gemini-1.5-flash",
            "cloned_voice_id": self.cloned_voice_id,
            "cloned_voice_name": self.cloned_voice_name,
            "cloned_voice_sample_url": self.cloned_voice_sample_url,
            "interruptible": self.interruptible if self.interruptible is not None else True,
            "voice_stability": self.voice_stability if self.voice_stability is not None else 0.5,
            "voice_similarity": self.voice_similarity if self.voice_similarity is not None else 0.75,
            "voice_speed": self.voice_speed if self.voice_speed is not None else 1.0,
            "agent_timezone": self.agent_timezone or "Asia/Dhaka",
            "whatsapp_prompt_question": self.whatsapp_prompt_question or "",
            "email_prompt_question": self.email_prompt_question or "",
            "meeting_confirmation_speech": self.meeting_confirmation_speech or "",
            "auto_call_enabled": self.auto_call_enabled,
            "max_daily_calls": self.max_daily_calls,
            "country_language_map": self.country_language_map or DEFAULT_COUNTRY_LANGUAGE_MAP,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class VoiceCallQueueItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "voice_call_queue"

    lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_person: Mapped[str] = mapped_column(String(255), default="Decision Maker", nullable=False)
    contact_title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    country: Mapped[str] = mapped_column(String(100), default="", nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(50), default="English", nullable=False)
    exact_problem: Mapped[str] = mapped_column(Text, default="Website lacks fast customer response and online booking capabilities", nullable=False)
    
    status: Mapped[str] = mapped_column(String(50), default="READY", nullable=False, index=True)  # READY, CALLING, CONNECTED, INTERESTED, COMPLETED, FAILED
    selected_for_call: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    call_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    meeting_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    meeting_time: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_called_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    call_logs: Mapped[List["VoiceCallLog"]] = relationship("VoiceCallLog", back_populates="queue_item", cascade="all, delete-orphan")
    lead: Mapped[Optional["Lead"]] = relationship("Lead")

    def to_dict(self):
        return {
            "id": str(self.id),
            "lead_id": str(self.lead_id) if self.lead_id else None,
            "contact_person": self.contact_person,
            "contact_title": self.contact_title,
            "company_name": self.company_name,
            "phone": self.phone,
            "country": self.country,
            "language": self.language,
            "exact_problem": self.exact_problem,
            "status": self.status,
            "selected_for_call": self.selected_for_call,
            "call_attempts": self.call_attempts,
            "meeting_link": self.meeting_link,
            "meeting_time": self.meeting_time,
            "last_called_at": self.last_called_at.isoformat() if self.last_called_at else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class VoiceCallLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "voice_call_logs"

    queue_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("voice_call_queue.id", ondelete="SET NULL"), nullable=True, index=True)
    kb_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("voice_knowledge_bases.id", ondelete="SET NULL"), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_person: Mapped[str] = mapped_column(String(255), nullable=False)
    call_duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    language_used: Mapped[str] = mapped_column(String(50), default="Bengali", nullable=False)
    recording_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    transcript_json: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    sentiment: Mapped[str] = mapped_column(String(50), default="HOT_INTERESTED", nullable=False, index=True)
    meeting_booked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    meeting_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    queue_item: Mapped[Optional["VoiceCallQueueItem"]] = relationship("VoiceCallQueueItem", back_populates="call_logs")
    knowledge_base: Mapped[Optional["VoiceKnowledgeBase"]] = relationship("VoiceKnowledgeBase", back_populates="call_logs")

    def to_dict(self):
        return {
            "id": str(self.id),
            "queue_item_id": str(self.queue_item_id) if self.queue_item_id else None,
            "kb_id": str(self.kb_id) if self.kb_id else None,
            "phone": self.phone,
            "company_name": self.company_name,
            "contact_person": self.contact_person,
            "call_duration_seconds": self.call_duration_seconds,
            "language_used": self.language_used,
            "recording_url": self.recording_url,
            "transcript_json": self.transcript_json or [],
            "sentiment": self.sentiment,
            "meeting_booked": self.meeting_booked,
            "meeting_link": self.meeting_link,
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
