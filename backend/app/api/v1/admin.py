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

