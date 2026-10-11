import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Text, Float, Boolean, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin

DEFAULT_QUALIFICATION_FIELDS: List[Dict[str, Any]] = [
    {
        "key": "name",
        "label": "Full Name",
        "prompt": "Could you please share your name?",
        "required": True,
    },
    {
        "key": "email",
        "label": "Email Address",
        "prompt": "What is the best email address to reach you?",
        "required": True,
    },
    {
        "key": "phone",
        "label": "Phone / WhatsApp",
        "prompt": "What is your phone or WhatsApp number (with country code)?",
        "required": True,
    },
    {
        "key": "needs",
        "label": "Service Needs / Requirements",
        "prompt": "What specific service or assistance are you looking for?",
        "required": False,
    },
    {
        "key": "budget",
        "label": "Budget / Timeline",
        "prompt": "Do you have a preferred timeframe or budget range?",
        "required": False,
    },
]

class ChatbotConfig(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "chatbot_configs"

    business_name: Mapped[str] = mapped_column(String(255), default="Global Enterprise Solutions", nullable=False)
    industry: Mapped[str] = mapped_column(String(100), default="Business Services", nullable=False)
    country: Mapped[str] = mapped_column(String(100), default="Global / Worldwide", nullable=False)
    currency_symbol: Mapped[str] = mapped_column(String(10), default="$", nullable=False)
    currency_code: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    tagline: Mapped[str] = mapped_column(String(500), default="Empowering businesses with modern growth solutions", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, default="", nullable=True)

    services_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    faqs_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    qualification_fields_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=DEFAULT_QUALIFICATION_FIELDS, nullable=False)

    master_ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_detect_language: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_tone: Mapped[str] = mapped_column(String(100), default="Professional, consultative, and welcoming", nullable=False)
    custom_instructions: Mapped[Optional[str]] = mapped_column(Text, default="", nullable=True)

    meta_verify_token: Mapped[str] = mapped_column(String(255), default="leadgen_meta_verify_token", nullable=False)
    meta_page_access_token: Mapped[Optional[str]] = mapped_column(Text, default="", nullable=True)
    whatsapp_phone_number_id: Mapped[Optional[str]] = mapped_column(String(100), default="", nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Conversation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "conversations"

    platform: Mapped[str] = mapped_column(String(50), default="whatsapp", nullable=False, index=True)  # whatsapp, messenger, instagram, web_widget
    external_sender_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    sender_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sender_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sender_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    detected_language: Mapped[Optional[str]] = mapped_column(String(50), default="English", nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", nullable=False, index=True)  # ACTIVE, QUALIFIED, DISQUALIFIED, HUMAN_TAKEOVER, CLOSED
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)  # Per-lead toggle (Human Takeover)
    
    qualification_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    extracted_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)

    last_message_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=True)
    unread_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    messages: Mapped[List["ConversationMessage"]] = relationship("ConversationMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ConversationMessage.created_at.asc()")
    lead: Mapped[Optional["Lead"]] = relationship("Lead")

    __table_args__ = (
        Index("idx_conversation_platform_sender", "platform", "external_sender_id"),
        Index("idx_conversation_status_last_msg", "status", "last_message_at"),
    )


class ConversationMessage(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "conversation_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)  # USER, AI, HUMAN_AGENT
    sender_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message_type: Mapped[str] = mapped_column(String(50), default="text", nullable=False)  # text, audio, image, quick_reply
    content: Mapped[str] = mapped_column(Text, nullable=False)
    media_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    detected_sentiment: Mapped[Optional[str]] = mapped_column(String(50), default="NEUTRAL", nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
