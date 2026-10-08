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
    from datetime import datetime, timezone

    logger.info("Started Autonomous Anti-Spam Email Outreach Background Daemon.")

    while True:
        try:
            import random
            delay = random.uniform(240, 480)
            await asyncio.sleep(delay)

            async with AsyncSessionLocal() as session:
                if not await OutreachEngine.is_smtp_configured(db=session):
                    continue
                stmt = (
                    select(Lead)
                    .options(selectinload(Lead.business))
                    .where(Lead.outreach_status == "READY_FOR_OUTREACH", Lead.is_qualified == True)
                    .limit(5)
                )
                res = await session.execute(stmt)
                ready_leads = res.scalars().all()

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
                    subject, body = OutreachEngine.render_email(
                        step=1,
                        lead_data={
                            "company_name": biz.canonical_name,
                            "contact_person": biz.contact_person or "Executive",
                            "city": target_city or "",
                            "website": getattr(biz, "domain", ""),
                            "industry": getattr(biz, "business_type", ""),
                            "primary_gap": lead.primary_gap_summary,
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
                            body_snippet=body[:300],
                            status="SENT",
                            sent_at=datetime.now(timezone.utc)
                        )
                        session.add(log)
                        await session.commit()
                        logger.info(f"[AUTONOMOUS OUTREACH DAEMON] Dispatched lead email to {recipient} ({biz.canonical_name}).")

                    if idx < len(ready_leads) - 1:
                        import random
                        await asyncio.sleep(random.uniform(45, 90))
        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.error(f"[OUTREACH DAEMON] Loop error: {err}")
            await asyncio.sleep(60)

async def autonomous_campaign_discovery_loop():
    from app.engine.autopilot_runner import AutopilotRunner
    from app.models.autopilot import AutopilotCampaign
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import select
    from datetime import datetime, timezone, timedelta

    logger.info("Started Autonomous Continuous Campaign Discovery Daemon.")
    await asyncio.sleep(60)

    while True:
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(AutopilotCampaign).where(
                    AutopilotCampaign.is_active == True,
                    AutopilotCampaign.status == "IDLE"
                )
                res = await session.execute(stmt)
                active_campaigns = res.scalars().all()

                for camp in active_campaigns:
                    should_run = not camp.last_run_at or (datetime.now(timezone.utc) - camp.last_run_at) > timedelta(hours=3)
                    if should_run:
                        logger.info(f"[AUTONOMOUS DISCOVERY DAEMON] Scheduled run starting for campaign '{camp.name}'...")
                        try:
                            await AutopilotRunner.run_campaign_batch(
                                db=session,
                                campaign=camp,
                                batch_size=15
                            )
                        except Exception as ce:
                            logger.error(f"[AUTONOMOUS DISCOVERY DAEMON] Error running '{camp.name}': {ce}")

            await asyncio.sleep(900)
        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.error(f"[AUTONOMOUS DISCOVERY DAEMON] Daemon error: {err}")
            await asyncio.sleep(120)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            from sqlalchemy import text
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
                await conn.execute(text("ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS use_company_kb BOOLEAN DEFAULT TRUE;"))
                
                await conn.execute(text("ALTER TABLE persona_signatures ADD COLUMN IF NOT EXISTS title VARCHAR(150) DEFAULT 'Primary Signature';"))
                await conn.execute(text("ALTER TABLE persona_signatures ADD COLUMN IF NOT EXISTS raw_content TEXT;"))
                try:
                    await conn.execute(text("ALTER TABLE persona_signatures ALTER COLUMN name DROP NOT NULL;"))
                    await conn.execute(text("ALTER TABLE persona_signatures ALTER COLUMN company DROP NOT NULL;"))
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
    discovery_daemon_task = asyncio.create_task(autonomous_campaign_discovery_loop())
    yield
    listener_task.cancel()
    outreach_daemon_task.cancel()
    discovery_daemon_task.cancel()
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
