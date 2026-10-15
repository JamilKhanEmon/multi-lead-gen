import asyncio
import json
from contextlib import asynccontextmanager
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import logger
from app.api.v1 import api_v1_router
from app.db.session import engine
from app.models import Base
import redis.asyncio as aioredis

class ConnectionManager:

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

async def redis_event_listener():
    while True:
        try:
            r = aioredis.from_url(settings.REDIS_URL)
            pubsub = r.pubsub()
            await pubsub.subscribe("leadgen:events")
            logger.info("Subscribed to Redis 'leadgen:events' channel for dashboard broadcasting")

            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    data = message.get("data")
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    await manager.broadcast(data)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Redis Pub/Sub listener disconnected: {e}. Retrying in 5s...")
            await asyncio.sleep(5)

async def autonomous_outreach_scheduler():
    from app.engine.outreach_engine import OutreachEngine
    from app.models.lead import Lead
    from app.models.autopilot import EmailOutreachLog
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    import os
    from datetime import datetime, timezone, timedelta

    logger.info("Started Autonomous Anti-Spam Email Outreach Background Daemon.")

    while True:
        try:
            import random
            delay = random.uniform(240, 480)
            await asyncio.sleep(delay)

            async with AsyncSessionLocal() as session:
                if not await OutreachEngine.is_smtp_configured(db=session):
                    continue

                from app.models.email_template import PersonaSignature, EmailTemplate
                p_stmt = select(PersonaSignature).where(PersonaSignature.is_active == True)
                p_res = await session.execute(p_stmt)
                active_personas = [
                    {"name": p.name, "title": p.title, "company": p.company, "raw_content": p.render_signature()}
                    for p in p_res.scalars().all()
                ]

                t_stmt = select(EmailTemplate).where(EmailTemplate.name == "default", EmailTemplate.is_active == True)
                t_res = await session.execute(t_stmt)
                active_tpl = t_res.scalar_one_or_none()

                # ── 1. Initial Outreach (Step 1): Uncontacted Ready Leads ──────
                stmt = (
                    select(Lead)
                    .options(selectinload(Lead.business))
                    .where(
                        Lead.outreach_status == "READY_FOR_OUTREACH",
                        Lead.is_qualified == True,
                        Lead.followup_step == 0,
                        Lead.last_contacted_at.is_(None)
                    )
                    .limit(5)
                )
                res = await session.execute(stmt)
                ready_leads = res.scalars().all()

                for idx, lead in enumerate(ready_leads):
                    biz = lead.business
                    if not biz or not biz.email:
                        continue
                    meta = biz.metadata_json or {}
                    target_city = meta.get("city") or biz.address or ""
                    target_country = meta.get("country") or ""
                    loc = biz.locations[0] if (biz.locations and len(biz.locations) > 0) else None
                    lat = loc.latitude if loc else meta.get("latitude")
                    lon = loc.longitude if loc else meta.get("longitude")

                    is_valid_time, reason = OutreachEngine.is_within_target_business_hours(
                        lat=lat,
                        lon=lon,
                        country=target_country,
                        city=target_city
                    )
                    if not is_valid_time:
                        logger.debug(f"[OUTREACH DAEMON] Skipping '{biz.canonical_name}' ({target_city}, {target_country}): {reason}")
                        continue

                    recipient = biz.email.strip()
                    subject, body = await OutreachEngine.render_email(
                        step=1,
                        lead_data={
                            "company_name": biz.canonical_name,
                            "contact_person": biz.contact_person or "Executive",
                            "city": target_city or "",
                            "website": getattr(biz, "domain", ""),
                            "industry": getattr(biz, "business_type", ""),
                            "primary_gap": lead.primary_gap_summary,
                            "why_they_need_us": getattr(lead, "why_they_need_us", None) or lead.primary_gap_summary,
                            "what_they_need": getattr(lead, "what_they_need", None) or "",
                            "matched_service": getattr(lead, "matched_service", None) or "",
                            "personas": active_personas,
                            "custom_template": active_tpl
                        }
                    )
                    success, note = await OutreachEngine.dispatch_smtp_email(
                        recipient_email=recipient,
                        subject=subject,
                        body=body,
                        dry_run=False,
                        db=session
                    )
                    if success:
                        lead.outreach_status = "SENT"
                        lead.followup_step = 1
                        lead.last_contacted_at = datetime.now(timezone.utc)
                        log = EmailOutreachLog(
                            lead_id=lead.id,
                            step=1,
                            recipient_email=recipient,
                            subject=subject,
                            body_snippet=body,
                            status="SENT",
                            error_message=note,
                            sent_at=datetime.now(timezone.utc)
                        )
                        session.add(log)
                        await session.commit()
                        logger.info(f"[AUTONOMOUS OUTREACH DAEMON] Dispatched Step 1 email to {recipient} ({biz.canonical_name}).")

                    if idx < len(ready_leads) - 1:
                        await asyncio.sleep(random.uniform(45, 90))

                # ── 2. Automated Follow-up Cadence (Step 2 and Step 3) with Reply Kill-Switch ──
                now_utc = datetime.now(timezone.utc)
                followup_cutoff = now_utc - timedelta(days=3)

                followup_stmt = (
                    select(Lead)
                    .options(selectinload(Lead.business))
                    .where(
                        Lead.outreach_status == "SENT",
                        Lead.deal_status.notin_(["HOT_LEAD", "CLOSED_LOST", "WON"]),
                        Lead.followup_step.in_([1, 2]),
                        Lead.last_contacted_at <= followup_cutoff,
                        Lead.is_qualified == True
                    )
                    .limit(5)
                )
                followup_leads = (await session.execute(followup_stmt)).scalars().all()

                for f_idx, f_lead in enumerate(followup_leads):
                    f_biz = f_lead.business
                    if not f_biz or not f_biz.email:
                        continue

                    # STRICT KILL-SWITCH: Verify prospect has never replied
                    reply_check_stmt = select(EmailOutreachLog.id).where(
                        EmailOutreachLog.lead_id == f_lead.id,
                        EmailOutreachLog.status.in_(["REPLIED", "MANUAL_REPLY_SENT", "UNSUBSCRIBED"])
                    ).limit(1)
                    has_replied = (await session.execute(reply_check_stmt)).scalar_one_or_none() is not None
                    if has_replied or f_lead.outreach_status in ("REPLIED_HOT", "REPLIED_NEUTRAL", "DISCARDED"):
                        logger.info(f"[FOLLOW-UP KILL-SWITCH] Skipping '{f_biz.canonical_name}' - client has already replied.")
                        continue

                    target_step = f_lead.followup_step + 1
                    if target_step > 3:
                        continue

                    f_meta = f_biz.metadata_json or {}
                    f_target_city = f_meta.get("city") or f_biz.address or ""
                    f_target_country = f_meta.get("country") or ""
                    f_loc = f_biz.locations[0] if (f_biz.locations and len(f_biz.locations) > 0) else None
                    f_lat = f_loc.latitude if f_loc else f_meta.get("latitude")
                    f_lon = f_loc.longitude if f_loc else f_meta.get("longitude")

                    is_valid_time, reason = OutreachEngine.is_within_target_business_hours(
                        lat=f_lat,
                        lon=f_lon,
                        country=f_target_country,
                        city=f_target_city
                    )
                    if not is_valid_time:
                        continue

                    f_recipient = f_biz.email.strip()
                    f_subject, f_body = await OutreachEngine.render_email(
                        step=target_step,
                        lead_data={
                            "company_name": f_biz.canonical_name,
                            "contact_person": f_biz.contact_person or "Executive",
                            "city": f_target_city or "",
                            "website": getattr(f_biz, "domain", ""),
                            "industry": getattr(f_biz, "business_type", ""),
                            "primary_gap": f_lead.primary_gap_summary,
                            "why_they_need_us": getattr(f_lead, "why_they_need_us", None) or f_lead.primary_gap_summary,
                            "what_they_need": getattr(f_lead, "what_they_need", None) or "",
                            "matched_service": getattr(f_lead, "matched_service", None) or "",
                            "personas": active_personas,
                            "custom_template": active_tpl
                        }
                    )
                    f_success, f_note = await OutreachEngine.dispatch_smtp_email(
                        recipient_email=f_recipient,
                        subject=f_subject,
                        body=f_body,
                        dry_run=False,
                        db=session
                    )
                    if f_success:
                        f_lead.followup_step = target_step
                        f_lead.outreach_status = "SENT"
                        f_lead.last_contacted_at = datetime.now(timezone.utc)
                        f_log = EmailOutreachLog(
                            lead_id=f_lead.id,
                            step=target_step,
                            recipient_email=f_recipient,
                            subject=f_subject,
                            body_snippet=f_body,
                            status="SENT",
                            error_message=f_note,
                            sent_at=datetime.now(timezone.utc)
                        )
                        session.add(f_log)
                        await session.commit()
                        logger.info(f"[AUTONOMOUS OUTREACH DAEMON] Dispatched Step {target_step} follow-up to {f_recipient} ({f_biz.canonical_name}).")

                    if f_idx < len(followup_leads) - 1:
                        await asyncio.sleep(random.uniform(45, 90))
        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.error(f"[OUTREACH DAEMON] Loop error: {err}")
            await asyncio.sleep(60)



async def autonomous_imap_sync_loop():
    from app.services.imap_sync_service import IMAPInboxSyncService
    from app.db.session import AsyncSessionLocal

    logger.info("Started Autonomous Real-Time Inbound IMAP Email Sync Daemon.")
    await asyncio.sleep(20)

    while True:
        try:
            async with AsyncSessionLocal() as session:
                processed = await IMAPInboxSyncService.process_incoming_replies(session)
                if processed > 0:
                    logger.info(f"[IMAP SYNC] Processed {processed} inbound reply(ies).")
            poll_interval = getattr(settings, "IMAP_POLL_INTERVAL_SECONDS", 180)
            await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[IMAP SYNC DAEMON] Error during sync: {e}. Retrying in 60s...")
            await asyncio.sleep(60)

async def autonomous_log_cleanup_daemon():
    """
    Lightweight background task to periodically cap log files and clean temporary
    files to prevent disk space exhaustion on VPS deployments.
    Runs every 4 hours.
    """
    import os
    import glob

    logger.info("Started Autonomous VPS Log & Storage Optimization Daemon.")
    await asyncio.sleep(60)

    while True:
        try:
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
            log_dir = os.path.join(base_dir, "logs")
            max_bytes = 10 * 1024 * 1024  # 10 MB limit per file

            if os.path.exists(log_dir):
                for log_file in glob.glob(os.path.join(log_dir, "*.log")):
                    try:
                        size = os.path.getsize(log_file)
                        if size > max_bytes:
                            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                                lines = f.readlines()
                            keep = lines[-3000:] if len(lines) > 3000 else lines
                            with open(log_file, "w", encoding="utf-8") as f:
                                f.writelines(keep)
                            logger.info(f"[STORAGE OPTIMIZER] Truncated {os.path.basename(log_file)} from {round(size/1024/1024, 1)}MB to latest 3,000 lines.")
                    except Exception as fe:
                        logger.debug(f"[STORAGE OPTIMIZER] Error checking {log_file}: {fe}")

            await asyncio.sleep(14400)  # Check every 4 hours
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"[STORAGE OPTIMIZER] Cycle note: {e}")
            await asyncio.sleep(3600)

async def autonomous_autopilot_daemon():
    """
    Autonomous 24/7 Autopilot Loop:
    Periodically checks active Autopilot campaigns. If an active campaign hasn't
    run in the last 24 hours (or has never run), it triggers a batch run.
    """
    from app.db.session import AsyncSessionLocal
    from app.models.autopilot import AutopilotCampaign
    from app.engine.autopilot_runner import AutopilotRunner
    from sqlalchemy import select
    from datetime import datetime, timezone, timedelta

    logger.info("Started Autonomous 24/7 Autopilot Campaign Background Daemon.")
    await asyncio.sleep(30)

    while True:
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(AutopilotCampaign).where(AutopilotCampaign.is_active == True)
                res = await session.execute(stmt)
                active_campaigns = res.scalars().all()

                now = datetime.now(timezone.utc)
                for campaign in active_campaigns:
                    if campaign.status == "RUNNING":
                        continue

                    should_run = False
                    if not campaign.last_run_at:
                        should_run = True
                    else:
                        time_since_run = now - campaign.last_run_at
                        if time_since_run >= timedelta(hours=24):
                            should_run = True

                    if should_run:
                        logger.info(f"[AUTOPILOT DAEMON] Triggering scheduled autonomous cycle for '{campaign.name}' (ID: {campaign.id})")
                        try:
                            await AutopilotRunner.run_campaign_batch(session, campaign)
                        except Exception as c_err:
                            logger.error(f"[AUTOPILOT DAEMON] Error running campaign '{campaign.name}': {c_err}")

            await asyncio.sleep(900)  # Check every 15 minutes
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[AUTOPILOT DAEMON] Cycle warning: {e}. Retrying in 5 minutes...")
            await asyncio.sleep(300)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            from sqlalchemy import text
            try:
                await conn.execute(text("ALTER TABLE businesses ALTER COLUMN canonical_name TYPE TEXT;"))
            except Exception:
                pass
            for col in ["phone", "email", "contact_person", "contact_title", "address", "linkedin_url"]:
                try:
                    await conn.execute(text(f"ALTER TABLE businesses ADD COLUMN IF NOT EXISTS {col} VARCHAR;"))
                except Exception:
                    pass
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_json JSONB DEFAULT '{}'::jsonb;"))
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_id UUID;"))
                
                for col_name, col_type in [
                    ("email_status", "VARCHAR(50) DEFAULT 'UNVERIFIED'"),
                    ("verification_notes", "TEXT"),
                    ("outreach_status", "VARCHAR(50) DEFAULT 'PENDING'"),
                    ("deal_status", "VARCHAR(50) DEFAULT 'COLD'"),
                    ("last_contacted_at", "TIMESTAMPTZ"),
                    ("followup_step", "INTEGER DEFAULT 0"),
                    ("outreach_notes", "TEXT"),
                    ("fit_tier", "VARCHAR(50) DEFAULT 'HOT'"),
                    ("why_they_need_us", "TEXT"),
                    ("what_they_need", "TEXT"),
                    ("discovery_call_script", "TEXT"),
                    ("matched_service", "VARCHAR(255)"),
                ]:
                    await conn.execute(text(f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                
                await conn.execute(text("ALTER TABLE autopilot_campaigns ADD COLUMN IF NOT EXISTS use_global_template BOOLEAN DEFAULT TRUE;"))
                await conn.execute(text("ALTER TABLE autopilot_campaigns ADD COLUMN IF NOT EXISTS use_company_kb BOOLEAN DEFAULT TRUE;"))
                await conn.execute(text("ALTER TABLE autopilot_campaigns ADD COLUMN IF NOT EXISTS analyze_website BOOLEAN DEFAULT FALSE;"))
                await conn.execute(text("ALTER TABLE autopilot_campaigns ADD COLUMN IF NOT EXISTS max_services INTEGER DEFAULT 0;"))
                await conn.execute(text("ALTER TABLE autopilot_campaigns ADD COLUMN IF NOT EXISTS target_services JSONB DEFAULT '[]'::jsonb;"))
                await conn.execute(text("UPDATE autopilot_campaigns SET status = 'IDLE' WHERE status = 'RUNNING';"))
                await conn.execute(text("ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS use_company_kb BOOLEAN DEFAULT TRUE;"))
                await conn.execute(text("ALTER TABLE company_kb ADD COLUMN IF NOT EXISTS master_kb_notes TEXT;"))
                
                await conn.execute(text("ALTER TABLE persona_signatures ADD COLUMN IF NOT EXISTS title VARCHAR(150) DEFAULT 'Primary Signature';"))
                await conn.execute(text("ALTER TABLE persona_signatures ADD COLUMN IF NOT EXISTS raw_content TEXT;"))
                try:
                    await conn.execute(text("ALTER TABLE persona_signatures ALTER COLUMN name DROP NOT NULL;"))
                    await conn.execute(text("ALTER TABLE persona_signatures ALTER COLUMN company DROP NOT NULL;"))
                    await conn.execute(text("ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS usage_stats_json JSONB DEFAULT '{}'::jsonb;"))
                except Exception:
                    pass
            except Exception as migration_err:
                logger.warning(f"Migration columns execution notice: {migration_err}")
        logger.info("PostgreSQL database tables, contact columns, user permissions, and outreach columns verified.")

        try:
            from app.db.session import AsyncSessionLocal
            from sqlalchemy import select, func
            from app.models.parameter import Parameter
            from app.engine.seed_parameters import seed_database
            async with AsyncSessionLocal() as chk_session:
                cnt_res = await chk_session.execute(select(func.count(Parameter.id)))
                param_count = cnt_res.scalar() or 0
                if param_count < 100:
                    logger.info(f"Database has {param_count} parameters (< 100). Auto-seeding 135 parameters and services...")
                    await seed_database()
                    logger.info("Database auto-seeding completed.")
                else:
                    logger.info(f"Parameters verified ({param_count} parameters present).")
        except Exception as seed_err:
            logger.warning(f"Auto-seed check/execution notice: {seed_err}")
    except Exception as e:
        logger.warning(f"Database table initialization warning: {e}")
    listener_task = asyncio.create_task(redis_event_listener())
    outreach_daemon_task = asyncio.create_task(autonomous_outreach_scheduler())
    imap_sync_task = asyncio.create_task(autonomous_imap_sync_loop())
    log_cleanup_task = asyncio.create_task(autonomous_log_cleanup_daemon())
    autopilot_daemon_task = asyncio.create_task(autonomous_autopilot_daemon())
    yield
    listener_task.cancel()
    outreach_daemon_task.cancel()
    imap_sync_task.cancel()
    log_cleanup_task.cancel()
    autopilot_daemon_task.cancel()
    logger.info("Shutdown complete.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Local-first autonomous intelligence platform for B2B lead discovery and qualification.",
    lifespan=lifespan,
)

cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://[::1]:3000",
]
if hasattr(settings, "CORS_ORIGINS") and settings.CORS_ORIGINS:
    cors_origins.extend([origin for origin in settings.CORS_ORIGINS if origin not in cors_origins])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

@app.get("/", tags=["System"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs": "/docs",
    }

@app.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        manager.disconnect(websocket)
