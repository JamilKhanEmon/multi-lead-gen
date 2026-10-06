"""
Admin Monitoring & System Health Endpoints
"""
import time
import socket
from typing import Dict
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func
from sqlalchemy.future import select
from app.api.deps import get_db, require_admin
from app.core.config import settings
from app.models.lead import Lead
from app.models.research import ResearchRun
from app.models.audit import User
from app.models.email_template import EmailTemplate
from app.schemas.admin import (
    SystemHealthResponse,
    SystemMetricsResponse,
    ComponentHealth,
    EmailTemplateResponse,
    EmailTemplateUpdate,
    EmailPreviewRequest,
)
import redis.asyncio as aioredis
import httpx

router = APIRouter(prefix="/admin", tags=["Admin & Health"])


def check_port(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Deep health check across Postgres, Redis, Ollama, and OpenClaw Gateway."""
    components: Dict[str, ComponentHealth] = {}
    overall_healthy = True

    # 1. PostgreSQL
    t0 = time.time()
    try:
        await db.execute(text("SELECT 1;"))
        pg_latency = (time.time() - t0) * 1000
        components["postgresql"] = ComponentHealth(status="healthy", latency_ms=round(pg_latency, 2))
    except Exception as e:
        overall_healthy = False
        components["postgresql"] = ComponentHealth(status="down", details={"error": str(e)})

    # 2. Redis
    t0 = time.time()
    try:
        r = aioredis.from_url(settings.REDIS_URL, socket_timeout=1.0)
        await r.ping()
        await r.aclose()
        redis_latency = (time.time() - t0) * 1000
        components["redis"] = ComponentHealth(status="healthy", latency_ms=round(redis_latency, 2))
    except Exception as e:
        overall_healthy = False
        components["redis"] = ComponentHealth(status="down", details={"error": str(e)})

    # 3. Ollama
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            ollama_latency = (time.time() - t0) * 1000
            if resp.status_code == 200:
                components["ollama"] = ComponentHealth(
                    status="healthy",
                    latency_ms=round(ollama_latency, 2),
                    details={"model": settings.OLLAMA_MODEL},
                )
            else:
                components["ollama"] = ComponentHealth(status="degraded", details={"status_code": resp.status_code})
    except Exception as e:
        components["ollama"] = ComponentHealth(status="down", details={"error": str(e)})

    # 4. OpenClaw Gateway
    oc_open = check_port("127.0.0.1", 18789, timeout=1.0)
    if oc_open:
        components["openclaw"] = ComponentHealth(status="healthy", details={"endpoint": settings.OPENCLAW_GATEWAY_URL})
    else:
        components["openclaw"] = ComponentHealth(status="down", details={"error": "Port 18789 closed or unreachable"})

    return SystemHealthResponse(
        status="healthy" if overall_healthy else "degraded",
        components=components,
    )


@router.get("/metrics", response_model=SystemMetricsResponse)
async def get_system_metrics(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Retrieve operational queue depth and pipeline metrics."""
    # Redis queue depth
    queue_len = 0
    try:
        r = aioredis.from_url(settings.REDIS_URL, socket_timeout=1.0)
        queue_len = await r.llen("leadgen:tasks")
        await r.aclose()
    except Exception:
        pass

    # DB Counts
    runs_res = await db.execute(select(func.count()).select_from(ResearchRun).where(ResearchRun.status == "RUNNING"))
    active_runs = runs_res.scalar_one() or 0

    leads_total_res = await db.execute(select(func.count()).select_from(Lead))
    total_leads = leads_total_res.scalar_one() or 0

    leads_qual_res = await db.execute(select(func.count()).select_from(Lead).where(Lead.is_qualified == True))
    qualified_leads = leads_qual_res.scalar_one() or 0

    return SystemMetricsResponse(
        queue_depth=queue_len,
        active_runs=active_runs,
        total_leads=total_leads,
        qualified_leads=qualified_leads,
        worker_concurrency=settings.WORKER_CONCURRENCY,
    )


@router.post("/reset-database")
async def reset_database(
    purge_businesses: bool = True,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Purges operational lead generation data from PostgreSQL while keeping system parameters and services."""
    await db.execute(text("DELETE FROM lead_feedback;"))
    await db.execute(text("DELETE FROM lead_scores;"))
    await db.execute(text("DELETE FROM service_matches;"))
    await db.execute(text("DELETE FROM leads;"))
    await db.execute(text("DELETE FROM research_jobs;"))
    await db.execute(text("DELETE FROM research_runs;"))
    if purge_businesses:
        await db.execute(text("DELETE FROM evidence;"))
        await db.execute(text("DELETE FROM parameter_results;"))
        await db.execute(text("DELETE FROM business_locations;"))
        await db.execute(text("DELETE FROM businesses;"))

    await db.commit()
    return {"status": "SUCCESS", "message": "Database reset successfully. System parameters and services preserved."}


# ==============================================================================
# GLOBAL OUTREACH EMAIL TEMPLATE & SIGNATURE MANAGEMENT
# ==============================================================================

DEFAULT_EMAIL_SUBJECT = "Quick inquiry regarding your office in {{location}}"
DEFAULT_EMAIL_BODY = """Dear {{contact_person}},

I recently came across {{company_name}} located in {{location}}. You have an established local presence, but while researching your digital touchpoints online, I noticed key opportunities to improve your client acquisition pipeline{{primary_gap}}.

Today, over 70% of potential clients search and evaluate businesses on mobile devices before calling or visiting. Without an optimized, modern mobile presence and instant inquiry capture, many high-value leads contact competitors instead.

We help leading businesses like {{company_name}} resolve these technical gaps within 48 hours to significantly increase direct client inquiries. Would you be open to a brief 3-minute discussion or a quick preview of the tailored recommendations we prepared for you?

{{signature}}"""


def serialize_template(tpl: EmailTemplate) -> EmailTemplateResponse:
    return EmailTemplateResponse(
        id=str(tpl.id),
        name=tpl.name,
        subject=tpl.subject,
        body=tpl.body,
        sender_name=tpl.sender_name,
        sender_title=tpl.sender_title,
        sender_company=tpl.sender_company,
        sender_email=tpl.sender_email,
        sender_phone=tpl.sender_phone,
        sender_website=tpl.sender_website,
        sign_off=tpl.sign_off,
        signature_text=tpl.signature_text or "",
        signature_rendered=tpl.render_signature(),
        is_active=tpl.is_active,
        created_at=tpl.created_at.isoformat() if tpl.created_at else None,
        updated_at=tpl.updated_at.isoformat() if tpl.updated_at else None,
    )


@router.get("/email-template", response_model=EmailTemplateResponse)
async def get_email_template(
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the active global email outreach template & signature for all users."""
    stmt = select(EmailTemplate).where(EmailTemplate.name == "default", EmailTemplate.is_active == True)
    res = await db.execute(stmt)
    tpl = res.scalar_one_or_none()

    if not tpl:
        tpl = EmailTemplate(
            name="default",
            subject=DEFAULT_EMAIL_SUBJECT,
            body=DEFAULT_EMAIL_BODY,
            sender_name="Jamil Khan",
            sender_title="Senior Solutions Consultant",
            sender_company="Multi-Lead Gen AI",
            sender_email="contact@leadgen.local",
            sender_phone="+880 1700-000000",
            sender_website="https://leadgen.local",
            sign_off="Sincerely,",
            signature_text="",
            is_active=True,
        )
        db.add(tpl)
        await db.commit()
        await db.refresh(tpl)

    return serialize_template(tpl)


@router.put("/email-template", response_model=EmailTemplateResponse)
async def update_email_template(
    update_data: EmailTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Update global email outreach template & signature for all users across the platform."""
    stmt = select(EmailTemplate).where(EmailTemplate.name == "default")
    res = await db.execute(stmt)
    tpl = res.scalar_one_or_none()

    if not tpl:
        tpl = EmailTemplate(
            name="default",
            subject=update_data.subject,
            body=update_data.body,
            sender_name=update_data.sender_name or "Jamil Khan",
            sender_title=update_data.sender_title or "Senior Solutions Consultant",
            sender_company=update_data.sender_company or "Multi-Lead Gen AI",
            sender_email=update_data.sender_email or "contact@leadgen.local",
            sender_phone=update_data.sender_phone or "+880 1700-000000",
            sender_website=update_data.sender_website,
            sign_off=update_data.sign_off or "Sincerely,",
            signature_text=update_data.signature_text or "",
            is_active=update_data.is_active if update_data.is_active is not None else True,
        )
        db.add(tpl)
    else:
        tpl.subject = update_data.subject
        tpl.body = update_data.body
        if update_data.sender_name is not None:
            tpl.sender_name = update_data.sender_name
        if update_data.sender_title is not None:
            tpl.sender_title = update_data.sender_title
        if update_data.sender_company is not None:
            tpl.sender_company = update_data.sender_company
        if update_data.sender_email is not None:
            tpl.sender_email = update_data.sender_email
        if update_data.sender_phone is not None:
            tpl.sender_phone = update_data.sender_phone
        if update_data.sender_website is not None:
            tpl.sender_website = update_data.sender_website
        if update_data.sign_off is not None:
            tpl.sign_off = update_data.sign_off
        if update_data.signature_text is not None:
            tpl.signature_text = update_data.signature_text
        if update_data.is_active is not None:
            tpl.is_active = update_data.is_active

    await db.commit()
    await db.refresh(tpl)
    return serialize_template(tpl)


@router.post("/email-template/preview")
async def preview_email_template(
    preview_req: EmailPreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """Interpolates template tags with real or sample lead data for instant preview."""
    subject = preview_req.subject or DEFAULT_EMAIL_SUBJECT
    body = preview_req.body or DEFAULT_EMAIL_BODY

    sender_name = preview_req.sender_name or "Jamil Khan"
    sender_title = preview_req.sender_title or "Senior Solutions Consultant"
    sender_company = preview_req.sender_company or "Multi-Lead Gen AI"
    sender_email = preview_req.sender_email or "contact@leadgen.local"
    sender_phone = preview_req.sender_phone or "+880 1700-000000"
    sender_website = preview_req.sender_website or "https://leadgen.local"
    sign_off = preview_req.sign_off or "Sincerely,"

    if preview_req.signature_text and preview_req.signature_text.strip():
        sig = preview_req.signature_text.strip()
    else:
        sig_parts = [sign_off]
        name_line = sender_name
        if sender_title:
            name_line += f"\n{sender_title}"
        if sender_company:
            name_line += f", {sender_company}"
        sig_parts.append(name_line)
        contacts = []
        if sender_email:
            contacts.append(f"Email: {sender_email}")
        if sender_phone:
            contacts.append(f"Phone: {sender_phone}")
        if contacts:
            sig_parts.append(" | ".join(contacts))
        if sender_website:
            sig_parts.append(sender_website)
        sig = "\n".join(sig_parts)

    gap_text = f" ({preview_req.primary_gap})" if preview_req.primary_gap else ""

    replacements = {
        "{{company_name}}": preview_req.company_name or "Tropical Homes Ltd.",
        "{{business_name}}": preview_req.company_name or "Tropical Homes Ltd.",
        "{{contact_person}}": preview_req.contact_person or "Decision Maker",
        "{{location}}": preview_req.location or "Gulshan-2, Dhaka",
        "{{address}}": preview_req.location or "Gulshan-2, Dhaka",
        "{{website}}": preview_req.website or "tropicalhomesltd.com",
        "{{domain}}": preview_req.website or "tropicalhomesltd.com",
        "{{phone}}": preview_req.phone or "+880 1711-223344",
        "{{primary_gap}}": gap_text,
        "{{signature}}": sig,
        "{{sender_name}}": sender_name,
        "{{sender_title}}": sender_title,
        "{{sender_company}}": sender_company,
        "{{sender_email}}": sender_email,
        "{{sender_phone}}": sender_phone,
    }

    rendered_subject = subject
    rendered_body = body
    for tag, val in replacements.items():
        rendered_subject = rendered_subject.replace(tag, val)
        rendered_body = rendered_body.replace(tag, val)

    return {
        "rendered_subject": rendered_subject,
        "rendered_body": rendered_body,
        "signature_block": sig,
    }


from pydantic import BaseModel, Field
from typing import Optional, List
from app.models.email_template import SMTPInbox, PersonaSignature
import smtplib


class SMTPInboxCreate(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str
    from_email: str
    from_name: str = "Growth Team"
    daily_limit: int = 30
    is_active: bool = True


class SMTPInboxUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    daily_limit: Optional[int] = None
    is_active: Optional[bool] = None


class PersonaSignatureCreate(BaseModel):
    name: str
    title: str
    company: str
    is_active: bool = True


class PersonaSignatureUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    is_active: Optional[bool] = None


class PurgeRequest(BaseModel):
    target: str = Field(..., description="rejected_leads | search_runs | all_leads | factory_reset")


@router.get("/inbox-monitor")
async def get_inbox_monitor_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Returns active SMTP inboxes status, daily limits, sent counts, and signature rotation pool."""
    from app.engine.outreach_engine import OutreachEngine
    
    # 1. Fetch from Database
    db_inboxes_stmt = select(SMTPInbox).order_by(SMTPInbox.created_at)
    res = await db.execute(db_inboxes_stmt)
    db_inboxes = res.scalars().all()
    
    inbox_list = []
    if db_inboxes:
        for idx, ib in enumerate(db_inboxes):
            sent_today = OutreachEngine.INBOX_STATS.get(str(ib.id), 0)
            inbox_list.append({
                "id": str(ib.id),
                "index": idx + 1,
                "host": ib.host,
                "port": ib.port,
                "user": ib.username,
                "from_email": ib.from_email,
                "from_name": ib.from_name,
                "daily_limit": ib.daily_limit,
                "sent_today": sent_today,
                "remaining": max(0, ib.daily_limit - sent_today),
                "is_active": ib.is_active,
                "status": "HEALTHY" if sent_today < ib.daily_limit else "DAILY_CAP_REACHED"
            })
    else:
        # Fallback to ENV inboxes
        env_inboxes = OutreachEngine.get_active_smtp_inboxes()
        for ib in env_inboxes:
            ib_id = ib["id"]
            sent_today = OutreachEngine.INBOX_STATS.get(str(ib_id), 0)
            inbox_list.append({
                "id": str(ib_id),
                "index": ib_id,
                "host": ib["host"],
                "port": ib["port"],
                "user": ib["user"],
                "from_email": ib["from_email"],
                "from_name": ib["from_name"],
                "daily_limit": ib.get("daily_limit", 30),
                "sent_today": sent_today,
                "remaining": max(0, ib.get("daily_limit", 30) - sent_today),
                "is_active": True,
                "status": "HEALTHY" if sent_today < ib.get("daily_limit", 30) else "DAILY_CAP_REACHED"
            })

    # 2. Fetch Personas from Database
    db_personas_stmt = select(PersonaSignature).order_by(PersonaSignature.created_at)
    p_res = await db.execute(db_personas_stmt)
    db_personas = p_res.scalars().all()
    
    persona_list = []
    if db_personas:
        for p in db_personas:
            persona_list.append({
                "id": str(p.id),
                "name": p.name,
                "title": p.title,
                "company": p.company,
                "is_active": p.is_active,
            })
    else:
        persona_list = [
            {"id": f"default_{idx+1}", "name": p["name"], "title": p["title"], "company": p["company"], "is_active": True}
            for idx, p in enumerate(OutreachEngine.PERSONA_SIGNATURES)
        ]

    return {
        "total_inboxes_configured": len(inbox_list),
        "inboxes": inbox_list,
        "persona_signatures": persona_list,
    }


# ==============================================================================
# SMTP Inboxes CRUD
# ==============================================================================
@router.post("/smtp-inboxes")
async def create_smtp_inbox(
    data: SMTPInboxCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Add a new SMTP Sending Inbox."""
    inbox = SMTPInbox(
        host=data.host,
        port=data.port,
        username=data.username,
        password=data.password,
        from_email=data.from_email,
        from_name=data.from_name,
        daily_limit=data.daily_limit,
        is_active=data.is_active,
    )
    db.add(inbox)
    await db.commit()
    await db.refresh(inbox)
    return {"status": "SUCCESS", "id": str(inbox.id), "message": "SMTP Inbox added successfully"}


@router.put("/smtp-inboxes/{inbox_id}")
async def update_smtp_inbox(
    inbox_id: uuid.UUID,
    data: SMTPInboxUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Update an existing SMTP Sending Inbox."""
    stmt = select(SMTPInbox).where(SMTPInbox.id == inbox_id)
    res = await db.execute(stmt)
    inbox = res.scalar_one_or_none()
    if not inbox:
        raise HTTPException(status_code=404, detail="SMTP Inbox not found")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(inbox, key, val)

    await db.commit()
    await db.refresh(inbox)
    return {"status": "SUCCESS", "message": "SMTP Inbox updated"}


@router.delete("/smtp-inboxes/{inbox_id}")
async def delete_smtp_inbox(
    inbox_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Delete an SMTP Sending Inbox."""
    stmt = select(SMTPInbox).where(SMTPInbox.id == inbox_id)
    res = await db.execute(stmt)
    inbox = res.scalar_one_or_none()
    if not inbox:
        raise HTTPException(status_code=404, detail="SMTP Inbox not found")

    await db.delete(inbox)
    await db.commit()
    return {"status": "SUCCESS", "message": "SMTP Inbox removed"}


@router.post("/smtp-inboxes/{inbox_id}/test")
async def test_smtp_inbox(
    inbox_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Test SMTP connection credentials."""
    stmt = select(SMTPInbox).where(SMTPInbox.id == inbox_id)
    res = await db.execute(stmt)
    inbox = res.scalar_one_or_none()
    if not inbox:
        raise HTTPException(status_code=404, detail="SMTP Inbox not found")

    import asyncio
    loop = asyncio.get_running_loop()

    def _test():
        try:
            if inbox.port == 465:
                server = smtplib.SMTP_SSL(inbox.host, inbox.port, timeout=10)
            else:
                server = smtplib.SMTP(inbox.host, inbox.port, timeout=10)
                server.starttls()

            if inbox.username and inbox.password:
                server.login(inbox.username, inbox.password)
            server.quit()
            return True, "SMTP connection and authentication successful!"
        except Exception as e:
            return False, str(e)

    ok, msg = await loop.run_in_executor(None, _test)
    if not ok:
        raise HTTPException(status_code=400, detail=f"SMTP Connection Failed: {msg}")
    return {"status": "SUCCESS", "message": msg}


# ==============================================================================
# Persona Signatures CRUD
# ==============================================================================
@router.post("/persona-signatures")
async def create_persona_signature(
    data: PersonaSignatureCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Add a new Persona Signature."""
    persona = PersonaSignature(
        name=data.name,
        title=data.title,
        company=data.company,
        is_active=data.is_active,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return {"status": "SUCCESS", "id": str(persona.id), "message": "Persona Signature created"}


@router.put("/persona-signatures/{persona_id}")
async def update_persona_signature(
    persona_id: uuid.UUID,
    data: PersonaSignatureUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Update a Persona Signature."""
    stmt = select(PersonaSignature).where(PersonaSignature.id == persona_id)
    res = await db.execute(stmt)
    persona = res.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(persona, key, val)

    await db.commit()
    await db.refresh(persona)
    return {"status": "SUCCESS", "message": "Persona updated"}


@router.delete("/persona-signatures/{persona_id}")
async def delete_persona_signature(
    persona_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Delete a Persona Signature."""
    stmt = select(PersonaSignature).where(PersonaSignature.id == persona_id)
    res = await db.execute(stmt)
    persona = res.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    await db.delete(persona)
    await db.commit()
    return {"status": "SUCCESS", "message": "Persona deleted"}


# ==============================================================================
# Database Purge Management (Super Admin Exclusive)
# ==============================================================================
@router.post("/purge-data")
async def purge_database_data(
    req: PurgeRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Purges selected categories or performs complete database reset."""
    if admin_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Administrator can perform database purges.")

    from sqlalchemy import delete
    from app.models.lead import Lead, LeadScore, LeadFeedback
    from app.models.research import ResearchRun, ResearchJob
    from app.models.autopilot import EmailOutreachLog, AutopilotCampaign
    from app.models.business import Business, BusinessLocation
    from app.models.evidence import Evidence
    from app.models.service import ServiceMatch

    target = req.target.lower().strip()

    if target == "rejected_leads":
        stmt = delete(Lead).where(Lead.tier == "Rejected")
        res = await db.execute(stmt)
        await db.commit()
        return {"status": "SUCCESS", "message": f"Purged {res.rowcount} rejected leads."}

    elif target == "search_runs":
        await db.execute(delete(ResearchJob))
        res = await db.execute(delete(ResearchRun))
        await db.commit()
        return {"status": "SUCCESS", "message": f"Cleared all search runs and history."}

    elif target in ["all_leads", "factory_reset"]:
        await db.execute(delete(EmailOutreachLog))
        await db.execute(delete(LeadFeedback))
        await db.execute(delete(LeadScore))
        await db.execute(delete(ServiceMatch))
        await db.execute(delete(Lead))
        await db.execute(delete(ResearchJob))
        await db.execute(delete(ResearchRun))
        await db.execute(delete(AutopilotCampaign))
        await db.execute(delete(Evidence))
        await db.execute(delete(BusinessLocation))
        await db.execute(delete(Business))
        await db.commit()

        # Also purge redis queues
        try:
            r = aioredis.from_url(settings.REDIS_URL)
            await r.delete("leadgen:tasks")
            await r.delete("leadgen:events")
            await r.aclose()
        except Exception:
            pass

        return {"status": "SUCCESS", "message": "Database completely purged and reset to clean state."}

    else:
        raise HTTPException(status_code=400, detail=f"Unknown purge target: {req.target}")



