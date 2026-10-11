import uuid
import base64
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Response
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, update

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.audit import User
from app.models.voice_agent import VoiceKnowledgeBase, VoiceCallQueueItem, VoiceCallLog, DEFAULT_COUNTRY_LANGUAGE_MAP
from app.models.lead import Lead
from app.schemas.voice_agent import (
    VoiceKnowledgeBaseCreate,
    VoiceKnowledgeBaseUpdate,
    VoiceKnowledgeBaseResponse,
    VoiceCallQueueItemCreate,
    VoiceCallQueueItemUpdate,
    VoiceCallQueueItemResponse,
    BatchQueueActionRequest,
    VoiceDialogueTurnRequest,
    VoiceDialogueTurnResponse,
    VoiceCallLogResponse,
)
from app.services.voice_agent_service import VoiceAgentService
from app.services.elevenlabs_service import ElevenLabsService, PREMADE_VOICES
from app.core.logging import logger

router = APIRouter(prefix="/voice-agent", tags=["B2B Voice Calling Agent"])

@router.get("/kb", response_model=VoiceKnowledgeBaseResponse)
async def get_active_knowledge_base(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    if not kb:
        kb = VoiceKnowledgeBase(
            name="Sales Assistant",
            company_name="Global Enterprise Solutions",
            agent_persona_name="Alex",
            service_name="Client Acquisition & Conversion Systems",
            service_description="Automated buyer lead qualification and operational gap fixing.",
            core_offer="100% Risk-Free 14-Day Pilot Implementation",
            first_message="Hello {{client_name}}, this is {{agent_persona_name}} from {{my_company}}. I'm reaching out regarding {{company_name}}'s digital presence and website audit.",
            system_prompt="""You are an elite, consultative B2B Sales Executive.
Goal: Mention the exact flaw/problem identified at {{company_name}}: "{{exact_problem}}".
Rule: Keep EVERY response under 18 words (maximum 8 seconds of speech).
Do NOT give long lectures. If they ask about pricing, highlight our risk-free pilot: "{{core_offer}}".
Pivot quickly to book a 10-minute Zoom or Google Meet demo: "Does tomorrow 11 AM or 3 PM work better for you?"
When a time is agreed, confirm the slot and state that the meeting link is being dispatched via WhatsApp/SMS.""",
            meeting_platform="Google Meet",
            office_hours_start="10:00",
            office_hours_end="18:00",
            is_active=True,
            voice_provider="elevenlabs",
            elevenlabs_voice_id="21m00Tcm4TlvDq8ikWAM",
            country_language_map=DEFAULT_COUNTRY_LANGUAGE_MAP,
        )
        db.add(kb)
        await db.commit()
        await db.refresh(kb)
    return kb.to_dict()

@router.post("/kb", response_model=VoiceKnowledgeBaseResponse)
async def save_or_update_knowledge_base(
    payload: VoiceKnowledgeBaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    if not kb:
        kb = VoiceKnowledgeBase()
        db.add(kb)

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(kb, field, val)

    await db.commit()
    await db.refresh(kb)
    return kb.to_dict()

@router.get("/voices")
async def list_available_voices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List available ElevenLabs voices including premade and user-cloned voices."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    api_key = kb.elevenlabs_api_key if kb else None
    voices = await ElevenLabsService.list_voices(explicit_key=api_key)

    # Prepend cloned voice if exists
    if kb and kb.cloned_voice_id:
        cloned_entry = {
            "voice_id": kb.cloned_voice_id,
            "name": f"⭐ Your Cloned Voice ({kb.cloned_voice_name or 'Personal'})",
            "category": "cloned",
            "labels": {"accent": "Custom Clone", "gender": "Custom", "use_case": "Personal Sales Voice"},
            "preview_url": kb.cloned_voice_sample_url or None,
        }
        voices = [cloned_entry] + [v for v in voices if v.get("voice_id") != kb.cloned_voice_id]

    return voices

@router.post("/clone-voice")
async def clone_user_voice(
    voice_name: str = Form("My Cloned Sales Voice"),
    audio_file: Optional[UploadFile] = File(None),
    audio_base64: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload audio or recorded browser sample to clone personal voice via ElevenLabs."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()
    if not kb:
        kb = VoiceKnowledgeBase()
        db.add(kb)

    raw_bytes = b""
    filename = "voice_sample.mp3"

    if audio_file:
        raw_bytes = await audio_file.read()
        filename = audio_file.filename or "sample.mp3"
    elif audio_base64:
        clean_b64 = audio_base64.split(",")[-1]
        raw_bytes = base64.b64decode(clean_b64)
        filename = "browser_recording.webm"
    else:
        raise HTTPException(status_code=400, detail="Please upload an audio file or record your voice sample.")

    try:
        clone_result = await ElevenLabsService.clone_voice(
            voice_name=voice_name,
            audio_bytes=raw_bytes,
            filename=filename,
            explicit_key=kb.elevenlabs_api_key,
        )

        kb.cloned_voice_id = clone_result.get("voice_id")
        kb.cloned_voice_name = voice_name
        kb.elevenlabs_voice_id = clone_result.get("voice_id")
        await db.commit()
        await db.refresh(kb)

        return {
            "success": True,
            "voice_id": kb.cloned_voice_id,
            "voice_name": voice_name,
            "message": f"Successfully cloned '{voice_name}'! Your AI agent will now call prospects in your exact voice.",
        }
    except Exception as e:
        logger.error(f"Voice cloning error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/sync-card1-leads")
async def sync_leads_from_card_1(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sync verified phone numbers from Card 1 into the Ready for Call Queue."""
    count = await VoiceAgentService.sync_leads_from_card_1(db)
    return {
        "success": True,
        "synced_count": count,
        "message": f"Synced {count} verified leads from Card 1 into the Ready for Call Queue."
    }

@router.get("/queue", response_model=List[VoiceCallQueueItemResponse])
async def list_call_queue(
    status_filter: Optional[str] = Query(None, alias="status"),
    country_filter: Optional[str] = Query(None, alias="country"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(VoiceCallQueueItem)
    if status_filter and status_filter.upper() != "ALL":
        query = query.where(VoiceCallQueueItem.status == status_filter.upper())
    if country_filter and country_filter.upper() != "ALL":
        query = query.where(VoiceCallQueueItem.country.ilike(f"%{country_filter}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            (VoiceCallQueueItem.company_name.ilike(term)) |
            (VoiceCallQueueItem.contact_person.ilike(term)) |
            (VoiceCallQueueItem.phone.ilike(term)) |
            (VoiceCallQueueItem.exact_problem.ilike(term))
        )

    query = query.order_by(desc(VoiceCallQueueItem.created_at))
    res = await db.execute(query)
    items = res.scalars().all()

    return [item.to_dict() for item in items]

@router.post("/queue", response_model=VoiceCallQueueItemResponse)
async def add_lead_to_queue(
    payload: VoiceCallQueueItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = VoiceCallQueueItem(
        contact_person=payload.contact_person,
        contact_title=payload.contact_title,
        company_name=payload.company_name,
        phone=payload.phone,
        country=payload.country,
        language=payload.language,
        exact_problem=payload.exact_problem,
        selected_for_call=payload.selected_for_call,
        lead_id=uuid.UUID(payload.lead_id) if payload.lead_id else None,
        notes=payload.notes,
        status="READY",
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item.to_dict()

@router.put("/queue/{item_id}", response_model=VoiceCallQueueItemResponse)
async def update_queue_item(
    item_id: str,
    payload: VoiceCallQueueItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(item_id))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, val)

    await db.commit()
    await db.refresh(item)
    return item.to_dict()

@router.delete("/queue/{item_id}")
async def delete_queue_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(item_id))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    await db.delete(item)
    await db.commit()
    return {"success": True, "deleted_id": item_id}

@router.post("/queue/batch")
async def execute_batch_queue_action(
    payload: BatchQueueActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    action = payload.action
    item_ids = payload.item_ids or []

    if action == "select_all":
        await db.execute(update(VoiceCallQueueItem).values(selected_for_call=True))
        await db.commit()
        return {"success": True, "message": "All items selected for call"}

    elif action == "deselect_all":
        await db.execute(update(VoiceCallQueueItem).values(selected_for_call=False))
        await db.commit()
        return {"success": True, "message": "All items deselected"}

    elif action == "delete_selected":
        if item_ids:
            for iid in item_ids:
                stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(iid))
                res = await db.execute(stmt)
                item = res.scalar_one_or_none()
                if item:
                    await db.delete(item)
            await db.commit()
        return {"success": True, "message": "Selected items removed from queue"}

    elif action == "sync_card1":
        count = await VoiceAgentService.sync_leads_from_card_1(db)
        return {"success": True, "synced_count": count, "message": f"Synced {count} leads from Card 1"}

    return {"success": False, "message": "Unknown action"}

@router.post("/dialogue-turn", response_model=VoiceDialogueTurnResponse)
async def process_live_dialogue_turn(
    payload: VoiceDialogueTurnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Processes speech turn, uses ElevenLabs Multilingual v2, and handles meeting booking."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()
    if not kb:
        kb = VoiceKnowledgeBase()

    queue_item = None
    if payload.queue_item_id:
        q_stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(payload.queue_item_id))
        q_res = await db.execute(q_stmt)
        queue_item = q_res.scalar_one_or_none()

    turn_result = await VoiceAgentService.process_dialogue_turn(
        user_speech_text=payload.user_speech_text,
        kb=kb,
        queue_item=queue_item,
        conversation_history=payload.conversation_history,
        override_client_name=payload.client_name,
        override_company_name=payload.company_name,
        override_exact_problem=payload.exact_problem,
        override_language=payload.language,
    )

    return turn_result

@router.post("/tts")
async def synthesize_text_audio(
    text: str = Form(...),
    voice_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate audio stream for arbitrary text using ElevenLabs."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    vid = voice_id or (kb.cloned_voice_id if kb and kb.cloned_voice_id else (kb.elevenlabs_voice_id if kb else "21m00Tcm4TlvDq8ikWAM"))
    key = kb.elevenlabs_api_key if kb else None

    audio = await ElevenLabsService.synthesize_speech(text=text, voice_id=vid, explicit_key=key)
    if not audio:
        raise HTTPException(status_code=500, detail="Speech synthesis unavailable")

    return Response(content=audio, media_type="audio/mpeg")

@router.post("/queue/{item_id}/call-complete")
async def complete_call_and_record(
    item_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record call outcome, sentiment, transcript, and auto-sync to CRM leads."""
    stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(item_id))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    meeting_booked = payload.get("meeting_booked", False)
    meeting_link = payload.get("meeting_link")
    meeting_time = payload.get("meeting_time")
    transcript = payload.get("transcript", [])
    duration = int(payload.get("duration_seconds", 45))
    sentiment = payload.get("sentiment", "HOT_INTERESTED" if meeting_booked else "NEUTRAL")

    item.status = "MEETING_BOOKED" if meeting_booked else "CALL_DONE"
    item.selected_for_call = False
    item.call_attempts = (item.call_attempts or 0) + 1
    item.last_called_at = datetime.now(timezone.utc)
    if meeting_link:
        item.meeting_link = meeting_link
    if meeting_time:
        item.meeting_time = meeting_time

    log = VoiceCallLog(
        queue_item_id=item.id,
        phone=item.phone,
        company_name=item.company_name,
        contact_person=item.contact_person,
        call_duration_seconds=duration,
        language_used=item.language or "Bengali",
        transcript_json=transcript,
        sentiment=sentiment,
        meeting_booked=meeting_booked,
        meeting_link=meeting_link,
        summary=payload.get("summary", f"Call completed. Outcome: {item.status}"),
    )
    db.add(log)

    # Auto-promote to HOT in CRM if meeting was booked or prospect is interested!
    if (meeting_booked or sentiment == "HOT_INTERESTED") and item.lead_id:
        lead_stmt = select(Lead).where(Lead.id == item.lead_id)
        lead_res = await db.execute(lead_stmt)
        lead_obj = lead_res.scalar_one_or_none()
        if lead_obj:
            lead_obj.fit_tier = "HOT"
            lead_obj.deal_status = "HOT_LEAD"
            lead_obj.is_qualified = True
            lead_obj.outreach_notes = f"Phone call confirmed. Meeting booked: {meeting_time or 'Scheduled'} ({meeting_link or ''})"

    await db.commit()
    await db.refresh(item)

    return {
        "success": True,
        "new_status": item.status,
        "meeting_link": item.meeting_link,
        "sentiment": sentiment,
        "message": f"Lead marked {item.status}. Transcript and sentiment recorded."
    }

@router.get("/logs", response_model=List[VoiceCallLogResponse])
async def get_call_logs(
    sentiment_filter: Optional[str] = Query(None, alias="sentiment"),
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(VoiceCallLog)
    if sentiment_filter and sentiment_filter.upper() != "ALL":
        query = query.where(VoiceCallLog.sentiment == sentiment_filter.upper())
    query = query.order_by(desc(VoiceCallLog.created_at)).limit(limit)
    res = await db.execute(query)
    logs = res.scalars().all()
    return [l.to_dict() for l in logs]
