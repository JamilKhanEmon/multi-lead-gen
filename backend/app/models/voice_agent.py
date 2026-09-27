"""
Voice Agent, Knowledge Base, and Outbound Call Queue Models.
Supports ElevenLabs-style prompt editing, PostgreSQL-backed interactive sheet view,
and automated meeting link booking.
"""
import uuid
from typing import Optional, List
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin


class VoiceKnowledgeBase(Base, UUIDMixin, TimestampMixin):
    """ElevenLabs-style Prompt and Knowledge Base profile for the Voice Agent."""
    __tablename__ = "voice_knowledge_bases"

    name: Mapped[str] = mapped_column(String(255), default="Primary B2B Sales Agent", nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), default="Apex AI Solutions", nullable=False)
    agent_persona_name: Mapped[str] = mapped_column(String(100), default="Jamil", nullable=False)
    service_name: Mapped[str] = mapped_column(String(255), default="Enterprise Operations Automation", nullable=False)
    service_description: Mapped[str] = mapped_column(Text, default="Automated visual quality control and ERP sync eliminating operational defects.", nullable=False)
    core_offer: Mapped[str] = mapped_column(String(255), default="Free 14-Day On-Site Trial with Zero Setup Cost", nullable=False)
    
    # ElevenLabs-style First Message & System Prompt with {{variables}}
    first_message: Mapped[str] = mapped_column(
        Text, 
        default="Hello {{client_name}}, this is {{agent_persona_name}} from {{my_company}}. I'm reaching out regarding {{company_name}}'s recent operational audit.", 
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
    
    meeting_platform: Mapped[str] = mapped_column(String(50), default="Google Meet", nullable=False) # Google Meet, Zoom
    office_hours_start: Mapped[str] = mapped_column(String(10), default="10:00", nullable=False)
    office_hours_end: Mapped[str] = mapped_column(String(10), default="18:00", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    objections_json: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

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
            "office_hours_start": self.office_hours_start,
            "office_hours_end": self.office_hours_end,
            "is_active": self.is_active,
            "objections_json": self.objections_json or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class VoiceCallQueueItem(Base, UUIDMixin, TimestampMixin):
    """PostgreSQL-backed Interactive Sheet View Lead for dialing."""
    __tablename__ = "voice_call_queue"

    lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_person: Mapped[str] = mapped_column(String(255), default="Decision Maker", nullable=False)
    contact_title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    exact_problem: Mapped[str] = mapped_column(Text, default="Operational bottlenecks and defect losses", nullable=False)
    
    # Status: READY, IN_PROGRESS, MEETING_BOOKED, CALL_DONE, FAILED
    status: Mapped[str] = mapped_column(String(50), default="READY", nullable=False, index=True)
    selected_for_call: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    
    meeting_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    meeting_time: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_called_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    call_logs: Mapped[List["VoiceCallLog"]] = relationship("VoiceCallLog", back_populates="queue_item", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "lead_id": str(self.lead_id) if self.lead_id else None,
            "contact_person": self.contact_person,
            "contact_title": self.contact_title,
            "company_name": self.company_name,
            "phone": self.phone,
            "exact_problem": self.exact_problem,
            "status": self.status,
            "selected_for_call": self.selected_for_call,
            "meeting_link": self.meeting_link,
            "meeting_time": self.meeting_time,
            "last_called_at": self.last_called_at.isoformat() if self.last_called_at else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class VoiceCallLog(Base, UUIDMixin, TimestampMixin):
    """Detailed record of each conversation, audio transcript, and meeting outcome."""
    __tablename__ = "voice_call_logs"

    queue_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("voice_call_queue.id", ondelete="SET NULL"), nullable=True, index=True)
    kb_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("voice_knowledge_bases.id", ondelete="SET NULL"), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_person: Mapped[str] = mapped_column(String(255), nullable=False)
    call_duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Structure: [{"speaker": "agent"|"lead", "text": "...", "timestamp_ms": 1200}]
    transcript_json: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    sentiment: Mapped[str] = mapped_column(String(50), default="INTERESTED", nullable=False)
    meeting_booked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
            "transcript_json": self.transcript_json or [],
            "sentiment": self.sentiment,
            "meeting_booked": self.meeting_booked,
            "meeting_link": self.meeting_link,
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
