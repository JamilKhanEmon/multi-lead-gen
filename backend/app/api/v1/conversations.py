import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_, func

from app.db.session import get_db
from app.models.conversation import ChatbotConfig, Conversation, ConversationMessage, DEFAULT_QUALIFICATION_FIELDS
from app.services.chatbot_service import ChatbotService
from app.core.logging import logger

router = APIRouter(prefix="/conversations", tags=["Conversations & Lead Qualification"])

# Schemas
class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_type: str
    sender_name: Optional[str] = None
    message_type: str
    content: str
    media_url: Optional[str] = None
    detected_sentiment: Optional[str] = None
    created_at: str

class ConversationSummary(BaseModel):
    id: str
    platform: str
    external_sender_id: str
    sender_name: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_email: Optional[str] = None
    detected_language: Optional[str] = None
    status: str
    ai_enabled: bool
    qualification_score: float
    extracted_data: dict
    lead_id: Optional[str] = None
    last_message_text: Optional[str] = None
    last_message_at: Optional[str] = None
    unread_count: int
    is_favorite: bool
    created_at: str

class ConversationDetail(ConversationSummary):
    messages: List[MessageResponse]

class SendMessageRequest(BaseModel):
    content: str
    sender_name: Optional[str] = "Live Agent"

class ToggleTakeoverRequest(BaseModel):
    ai_enabled: bool

class UpdateStatusRequest(BaseModel):
    status: str

class SimulateMessageRequest(BaseModel):
    platform: str = "whatsapp"
    external_sender_id: Optional[str] = None
    sender_name: Optional[str] = "Prospect"
    message_text: str

class ChatbotConfigUpdate(BaseModel):
    business_name: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    currency_symbol: Optional[str] = None
    currency_code: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    services_json: Optional[List[Dict[str, Any]]] = None
    faqs_json: Optional[List[Dict[str, Any]]] = None
    qualification_fields_json: Optional[List[Dict[str, Any]]] = None
    master_ai_enabled: Optional[bool] = None
    auto_detect_language: Optional[bool] = None
    ai_tone: Optional[str] = None
    custom_instructions: Optional[str] = None
    meta_verify_token: Optional[str] = None
    meta_page_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None

@router.get("/config")
async def get_chatbot_config(db: AsyncSession = Depends(get_db)):
    """Retrieve active dynamic business profile and qualification settings."""
    config = await ChatbotService.get_or_create_config(db)
    return {
        "id": str(config.id),
        "business_name": config.business_name,
        "industry": config.industry,
        "country": config.country,
        "currency_symbol": config.currency_symbol,
        "currency_code": config.currency_code,
        "tagline": config.tagline,
        "description": config.description,
        "services_json": config.services_json or [],
        "faqs_json": config.faqs_json or [],
        "qualification_fields_json": config.qualification_fields_json or DEFAULT_QUALIFICATION_FIELDS,
        "master_ai_enabled": config.master_ai_enabled,
        "auto_detect_language": config.auto_detect_language,
        "ai_tone": config.ai_tone,
        "custom_instructions": config.custom_instructions,
        "meta_verify_token": config.meta_verify_token,
        "meta_page_access_token": config.meta_page_access_token,
        "whatsapp_phone_number_id": config.whatsapp_phone_number_id,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }

@router.put("/config")
async def update_chatbot_config(payload: ChatbotConfigUpdate, db: AsyncSession = Depends(get_db)):
    """Update business profile, worldwide currency, services, and qualification criteria."""
    config = await ChatbotService.get_or_create_config(db)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(config, k, v)
    await db.commit()
    await db.refresh(config)
    return {"message": "Chatbot business profile updated successfully", "master_ai_enabled": config.master_ai_enabled}

@router.get("", response_model=List[ConversationSummary])
async def list_conversations(
    status_filter: Optional[str] = Query(None, alias="status"),
    platform_filter: Optional[str] = Query(None, alias="platform"),
    search: Optional[str] = Query(None),
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List conversational leads with dynamic filtering."""
    query = select(Conversation)

    if status_filter and status_filter.upper() != "ALL":
        query = query.where(Conversation.status == status_filter.upper())
    if platform_filter and platform_filter.lower() != "all":
        query = query.where(Conversation.platform == platform_filter.lower())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Conversation.sender_name.ilike(term),
                Conversation.sender_phone.ilike(term),
                Conversation.sender_email.ilike(term),
                Conversation.last_message_text.ilike(term)
            )
        )

    query = query.order_by(desc(Conversation.last_message_at)).offset(offset).limit(limit)
    res = await db.execute(query)
    convs = res.scalars().all()

    return [
        ConversationSummary(
            id=str(c.id),
            platform=c.platform,
            external_sender_id=c.external_sender_id,
            sender_name=c.sender_name,
            sender_phone=c.sender_phone,
            sender_email=c.sender_email,
            detected_language=c.detected_language,
            status=c.status,
            ai_enabled=c.ai_enabled,
            qualification_score=c.qualification_score or 0.0,
            extracted_data=c.extracted_data or {},
            lead_id=str(c.lead_id) if c.lead_id else None,
            last_message_text=c.last_message_text,
            last_message_at=c.last_message_at.isoformat() if c.last_message_at else None,
            unread_count=c.unread_count or 0,
            is_favorite=c.is_favorite or False,
            created_at=c.created_at.isoformat() if c.created_at else "",
        )
        for c in convs
    ]

@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_detail(conversation_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get complete conversation transcript and extracted qualification data."""
    conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
    c_res = await db.execute(conv_stmt)
    conv = c_res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Mark as read
    conv.unread_count = 0
    await db.commit()

    msg_stmt = select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation_id
    ).order_by(ConversationMessage.created_at.asc())
    m_res = await db.execute(msg_stmt)
    msgs = m_res.scalars().all()

    return ConversationDetail(
        id=str(conv.id),
        platform=conv.platform,
        external_sender_id=conv.external_sender_id,
        sender_name=conv.sender_name,
        sender_phone=conv.sender_phone,
        sender_email=conv.sender_email,
        detected_language=conv.detected_language,
        status=conv.status,
        ai_enabled=conv.ai_enabled,
        qualification_score=conv.qualification_score or 0.0,
        extracted_data=conv.extracted_data or {},
        lead_id=str(conv.lead_id) if conv.lead_id else None,
        last_message_text=conv.last_message_text,
        last_message_at=conv.last_message_at.isoformat() if conv.last_message_at else None,
        unread_count=conv.unread_count or 0,
        is_favorite=conv.is_favorite or False,
        created_at=conv.created_at.isoformat() if conv.created_at else "",
        messages=[
            MessageResponse(
                id=str(m.id),
                conversation_id=str(m.conversation_id),
                sender_type=m.sender_type,
                sender_name=m.sender_name,
                message_type=m.message_type,
                content=m.content,
                media_url=m.media_url,
                detected_sentiment=m.detected_sentiment,
                created_at=m.created_at.isoformat() if m.created_at else "",
            )
            for m in msgs
        ]
    )

@router.post("/{conversation_id}/messages")
async def send_human_message(conversation_id: uuid.UUID, payload: SendMessageRequest, db: AsyncSession = Depends(get_db)):
    """Send manual message from live human agent (Human Takeover)."""
    conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
    c_res = await db.execute(conv_stmt)
    conv = c_res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    agent_msg = ConversationMessage(
        conversation_id=conv.id,
        sender_type="HUMAN_AGENT",
        sender_name=payload.sender_name or "Agent",
        message_type="text",
        content=payload.content,
    )
    db.add(agent_msg)
    conv.last_message_text = payload.content
    conv.last_message_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(agent_msg)

    await ChatbotService.broadcast_event("chat_message_sent", {
        "conversation_id": str(conv.id),
        "message_id": str(agent_msg.id),
        "sender_type": "HUMAN_AGENT",
        "content": payload.content,
        "sender_name": agent_msg.sender_name,
    })

    return {"status": "SENT", "message_id": str(agent_msg.id)}

@router.post("/{conversation_id}/takeover")
async def toggle_human_takeover(conversation_id: uuid.UUID, payload: ToggleTakeoverRequest, db: AsyncSession = Depends(get_db)):
    """Toggle AI Auto-Pilot on/off for this specific lead conversation."""
    conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
    c_res = await db.execute(conv_stmt)
    conv = c_res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.ai_enabled = payload.ai_enabled
    if not payload.ai_enabled:
        conv.status = "HUMAN_TAKEOVER"
    elif conv.status == "HUMAN_TAKEOVER":
        conv.status = "ACTIVE"

    await db.commit()
    await db.refresh(conv)

    await ChatbotService.broadcast_event("conversation_takeover_toggled", {
        "conversation_id": str(conv.id),
        "ai_enabled": conv.ai_enabled,
        "status": conv.status,
    })

    return {"ai_enabled": conv.ai_enabled, "status": conv.status}

@router.post("/{conversation_id}/status")
async def update_conversation_status(conversation_id: uuid.UUID, payload: UpdateStatusRequest, db: AsyncSession = Depends(get_db)):
    """Update conversation state."""
    conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
    c_res = await db.execute(conv_stmt)
    conv = c_res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.status = payload.status.upper()
    await db.commit()
    return {"status": conv.status}

@router.post("/{conversation_id}/convert-lead")
async def convert_conversation_to_lead(conversation_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Manually convert conversation into CRM Lead."""
    conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
    c_res = await db.execute(conv_stmt)
    conv = c_res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    config = await ChatbotService.get_or_create_config(db)
    await ChatbotService._create_or_link_crm_lead(db, conv, conv.extracted_data or {}, config)
    conv.status = "QUALIFIED"
    conv.qualification_score = 1.0
    await db.commit()
    return {"message": "Lead converted successfully", "lead_id": str(conv.lead_id)}

@router.post("/simulate")
async def simulate_conversation_message(payload: SimulateMessageRequest, db: AsyncSession = Depends(get_db)):
    """Interactive simulator: send customer message in any language and see dynamic AI qualification in action."""
    sender_id = payload.external_sender_id or f"test_sim_{uuid.uuid4().hex[:6]}"
    conv, ai_reply = await ChatbotService.process_incoming_message(
        db=db,
        platform=payload.platform,
        external_sender_id=sender_id,
        message_text=payload.message_text,
        sender_name=payload.sender_name,
    )

    return {
        "conversation_id": str(conv.id),
        "detected_language": conv.detected_language,
        "status": conv.status,
        "qualification_score": conv.qualification_score,
        "extracted_data": conv.extracted_data,
        "lead_id": str(conv.lead_id) if conv.lead_id else None,
        "ai_reply": ai_reply.content if ai_reply else None,
    }
