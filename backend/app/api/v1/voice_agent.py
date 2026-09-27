"""
FastAPI Router for Autonomous B2B Voice Calling Agent (AsyncSession SQLAlchemy 2.0).
Manages ElevenLabs-style Prompt/KB, Interactive Sheet View Call Queue,
Office Hours validation, and Automated Meeting Link booking.
"""
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, update

from app.db.session import get_db
from app.models.voice_agent import VoiceKnowledgeBase, VoiceCallQueueItem, VoiceCallLog
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
from app.core.logging import logger

router = APIRouter(prefix="/voice-agent", tags=["B2B Voice Calling Agent"])


# ==============================================================================
# 1. KNOWLEDGE BASE & ELEVENLABS-STYLE PROMPT ENDPOINTS
# ==============================================================================

@router.get("/kb", response_model=VoiceKnowledgeBaseResponse)
async def get_active_knowledge_base(db: AsyncSession = Depends(get_db)):
    """Retrieves active Knowledge Base and ElevenLabs-style prompt profile."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    if not kb:
        # Seed initial default B2B agent
        kb = VoiceKnowledgeBase(
            name="Primary B2B Sales Agent",
            company_name="Apex AI Solutions",
            agent_persona_name="Jamil",
            service_name="Enterprise Operations Automation",
            service_description="Automated visual quality inspection and defect reduction.",
            core_offer="Free 14-Day On-Site Trial with Zero Setup Cost",
            first_message="Hello {{client_name}}, this is {{agent_persona_name}} from {{my_company}}. I'm reaching out regarding {{company_name}}'s operational line audit.",
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
            objections_json=[
                {"trigger": "busy", "counter": "I understand! That's why I only need 10 minutes on Zoom. Does tomorrow 11 AM work?"},
                {"trigger": "price", "counter": "Our initial trial is 100% risk-free with zero upfront cost. Can we review it tomorrow at 3 PM?"},
                {"trigger": "already have", "counter": "Understood! Most clients use us as a complementary audit layer with zero downtime. Can I show you a 5-minute comparison?"}
            ]
        )
        db.add(kb)
        await db.commit()
        await db.refresh(kb)
    return kb.to_dict()


@router.post("/kb", response_model=VoiceKnowledgeBaseResponse)
async def save_or_update_knowledge_base(payload: VoiceKnowledgeBaseCreate, db: AsyncSession = Depends(get_db)):
    """Saves or updates the active ElevenLabs-style prompt and company details."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    if not kb:
        kb = VoiceKnowledgeBase()
        db.add(kb)

    kb.name = payload.name
    kb.company_name = payload.company_name
    kb.agent_persona_name = payload.agent_persona_name
    kb.service_name = payload.service_name
    kb.service_description = payload.service_description
    kb.core_offer = payload.core_offer
    kb.first_message = payload.first_message
    kb.system_prompt = payload.system_prompt
    kb.meeting_platform = payload.meeting_platform
    kb.office_hours_start = payload.office_hours_start
    kb.office_hours_end = payload.office_hours_end
    kb.is_active = payload.is_active
    kb.objections_json = payload.objections_json

    await db.commit()
    await db.refresh(kb)
    return kb.to_dict()


@router.delete("/kb/{kb_id}")
async def delete_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    """Deletes a Knowledge Base profile."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.id == uuid.UUID(kb_id))
    res = await db.execute(stmt)
    kb = res.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    await db.delete(kb)
    await db.commit()
    return {"success": True, "deleted_id": kb_id}


# ==============================================================================
# 2. INTERACTIVE SHEET VIEW & CALL QUEUE ENDPOINTS
# ==============================================================================

@router.get("/queue", response_model=List[VoiceCallQueueItemResponse])
async def list_call_queue(db: AsyncSession = Depends(get_db)):
    """Returns all leads in the PostgreSQL-backed Interactive Sheet View."""
    stmt = select(VoiceCallQueueItem).order_by(VoiceCallQueueItem.created_at.desc())
    res = await db.execute(stmt)
    items = res.scalars().all()

    dirty = False
    for item in items:
        cleaned = VoiceAgentService.sanitize_exact_problem(item.exact_problem, item.company_name)
        if cleaned != item.exact_problem:
            item.exact_problem = cleaned
            dirty = True
    if dirty:
        await db.commit()

    return [item.to_dict() for item in items]


@router.post("/queue", response_model=VoiceCallQueueItemResponse)
async def add_lead_to_queue(payload: VoiceCallQueueItemCreate, db: AsyncSession = Depends(get_db)):
    """Adds a single verified lead manually into the Interactive Sheet View."""
    item = VoiceCallQueueItem(
        contact_person=payload.contact_person,
        contact_title=payload.contact_title,
        company_name=payload.company_name,
        phone=payload.phone,
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
async def update_queue_item(item_id: str, payload: VoiceCallQueueItemUpdate, db: AsyncSession = Depends(get_db)):
    """Inline cell edit for the Sheet View (phone, problem, contact, status, etc.)."""
    stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(item_id))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    if payload.contact_person is not None:
        item.contact_person = payload.contact_person
    if payload.contact_title is not None:
        item.contact_title = payload.contact_title
    if payload.company_name is not None:
        item.company_name = payload.company_name
    if payload.phone is not None:
        item.phone = payload.phone
    if payload.exact_problem is not None:
        item.exact_problem = payload.exact_problem
    if payload.status is not None:
        item.status = payload.status
    if payload.selected_for_call is not None:
        item.selected_for_call = payload.selected_for_call
    if payload.meeting_link is not None:
        item.meeting_link = payload.meeting_link
    if payload.meeting_time is not None:
        item.meeting_time = payload.meeting_time
    if payload.notes is not None:
        item.notes = payload.notes

    await db.commit()
    await db.refresh(item)
    return item.to_dict()


@router.delete("/queue/{item_id}")
async def delete_queue_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """Removes a lead row from the Sheet View."""
    stmt = select(VoiceCallQueueItem).where(VoiceCallQueueItem.id == uuid.UUID(item_id))
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    await db.delete(item)
    await db.commit()
    return {"success": True, "deleted_id": item_id}


@router.post("/queue/batch")
async def batch_queue_action(payload: BatchQueueActionRequest, db: AsyncSession = Depends(get_db)):
    """Handles select all, deselect all, and 1-click sync from Qualified Leads table."""
    if payload.action == "select_all":
        stmt = update(VoiceCallQueueItem).values(selected_for_call=True)
        await db.execute(stmt)
        await db.commit()
        return {"success": True, "message": "All leads selected for calling"}

    elif payload.action == "deselect_all":
        stmt = update(VoiceCallQueueItem).values(selected_for_call=False)
        await db.execute(stmt)
        await db.commit()
        return {"success": True, "message": "All leads deselected"}

    elif payload.action == "sync_from_leads":
        # Pull qualified leads from main leads table into the Interactive Sheet View
        from sqlalchemy.orm import selectinload
        stmt = select(Lead).options(selectinload(Lead.business)).order_by(desc(Lead.final_score)).limit(50)
        res = await db.execute(stmt)
        leads = res.scalars().all()

        existing_stmt = select(VoiceCallQueueItem.phone)
        existing_res = await db.execute(existing_stmt)
        existing_phones = set(existing_res.scalars().all())

        synced_count = 0
        for l in leads:
            b = l.business
            phone = b.phone if b and b.phone else ""
            if phone and phone not in existing_phones:
                company = b.canonical_name if b else "Prospective Enterprise"
                raw_prob = l.primary_gap_summary or "Manual operational delays and defect bottlenecks"
                clean_prob = VoiceAgentService.sanitize_exact_problem(raw_prob, company)
                new_item = VoiceCallQueueItem(
                    lead_id=l.id,
                    contact_person=b.contact_person if b and b.contact_person else "Managing Director",
                    contact_title=b.contact_title if b and b.contact_title else "Executive",
                    company_name=company,
                    phone=phone,
                    exact_problem=clean_prob,
                    status="READY",
                    selected_for_call=True,
                )
                db.add(new_item)
                existing_phones.add(phone)
                synced_count += 1

        await db.commit()
        return {"success": True, "synced_count": synced_count, "message": f"Successfully synced {synced_count} leads to Sheet View"}

    return {"success": False, "message": "Unknown action"}


# ==============================================================================
# 3. LIVE VOICE CONVERSATION & OFFICE HOURS ENDPOINTS
# ==============================================================================

@router.get("/office-hours")
async def check_office_hours_status(db: AsyncSession = Depends(get_db)):
    """Validates whether calling is currently permitted under office hours rules."""
    stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
    res = await db.execute(stmt)
    kb = res.scalars().first()

    start_t = kb.office_hours_start if kb else "10:00"
    end_t = kb.office_hours_end if kb else "18:00"

    is_allowed, msg = VoiceAgentService.is_within_office_hours(start_t, end_t)
    return {
        "is_within_hours": is_allowed,
        "message": msg,
        "office_hours_start": start_t,
        "office_hours_end": end_t,
    }


@router.post("/dialogue-turn", response_model=VoiceDialogueTurnResponse)
async def process_live_dialogue_turn(payload: VoiceDialogueTurnRequest, db: AsyncSession = Depends(get_db)):
    """
    Ultra-low latency conversational turn processing for live phone or browser testing.
    Detects meeting booking and returns Zoom/Meet links.
    """
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
    )

    return turn_result


@router.post("/queue/{item_id}/call-complete")
async def complete_call_and_record(
    item_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    """
    Marks a call as DONE or MEETING_BOOKED.
    Locks the lead row so it will NEVER be called again (Strict No-Duplicate Guard).
    Records transcript and booked meeting link.
    """
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
    sentiment = payload.get("sentiment", "INTERESTED")

    # Update Sheet View row
    item.status = "MEETING_BOOKED" if meeting_booked else "CALL_DONE"
    item.selected_for_call = False # Deselect so it won't be called again
    item.last_called_at = datetime.now()
    if meeting_link:
        item.meeting_link = meeting_link
    if meeting_time:
        item.meeting_time = meeting_time

    # Record permanent Call Log
    log = VoiceCallLog(
        queue_item_id=item.id,
        phone=item.phone,
        company_name=item.company_name,
        contact_person=item.contact_person,
        call_duration_seconds=duration,
        transcript_json=transcript,
        sentiment=sentiment,
        meeting_booked=meeting_booked,
        meeting_link=meeting_link,
        summary=payload.get("summary", f"Call completed. Outcome: {item.status}"),
    )
    db.add(log)
    await db.commit()
    await db.refresh(item)

    return {
        "success": True,
        "new_status": item.status,
        "meeting_link": item.meeting_link,
        "message": f"Lead marked {item.status}. Duplicate protection active."
    }


@router.get("/logs", response_model=List[VoiceCallLogResponse])
async def get_call_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Retrieves call history with transcripts and booked meetings."""
    stmt = select(VoiceCallLog).order_by(desc(VoiceCallLog.created_at)).limit(limit)
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return [l.to_dict() for l in logs]
