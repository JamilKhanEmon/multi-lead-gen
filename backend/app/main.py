"""
Autonomous B2B Lead-Generation Platform — Main FastAPI Application
"""
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
    """Manages active WebSocket connections from Next.js dashboard clients."""

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
    """Background listener consuming 'leadgen:events' from Redis Pub/Sub and broadcasting via WebSockets."""
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
    """
    Background worker loop that automatically polls for 'READY_FOR_OUTREACH' leads.
    Enforces local business hours (09:00 AM - 05:30 PM BST / UTC+6) and anti-spam random delays (120-240s).
    """
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
            # Wait random delay between checks (240 to 480 seconds = 4 to 8 minutes)
            delay = OutreachEngine.get_random_anti_spam_delay(240, 480)
            await asyncio.sleep(delay)

            smtp_host = os.getenv("SMTP_HOST")
            smtp_user = os.getenv("SMTP_USER")
            if not smtp_host or not smtp_user:
                continue

            async with AsyncSessionLocal() as session:
                stmt = (
                    select(Lead)
                    .options(selectinload(Lead.business))
                    .where(Lead.outreach_status == "READY_FOR_OUTREACH", Lead.is_qualified == True)
                    .limit(5)
                )
                res = await session.execute(stmt)
                ready_leads = res.scalars().all()

                for idx, lead in enumerate(ready_leads):
                    biz = lead.business
                    meta = biz.metadata_json or {}
                    target_city = meta.get("city") or biz.address or ""
                    target_country = meta.get("country") or "Bangladesh"
                    loc = biz.locations[0] if (biz.locations and len(biz.locations) > 0) else None
                    lat = loc.latitude if loc else meta.get("latitude")
                    lon = loc.longitude if loc else meta.get("longitude")

                    # 100% Dynamic GPS & IANA Time Zone / Weekend Check
                    is_valid_time, reason = OutreachEngine.is_within_target_business_hours(
                        lat=lat,
                        lon=lon,
                        country=target_country,
                        city=target_city
                    )
                    if not is_valid_time:
                        logger.debug(f"[OUTREACH DAEMON] Skipping '{biz.canonical_name}' ({target_city}, {target_country}): {reason}")
                        continue

                    recipient = biz.email or os.getenv("SMTP_USER")
                    subject, body = OutreachEngine.render_email(
                        step=1,
                        lead_data={
                            "company_name": biz.canonical_name,
                            "contact_person": biz.contact_person or "Executive",
                            "city": target_city or "your area",
                            "primary_gap": lead.primary_gap_summary
                        }
                    )
                    success, note = await OutreachEngine.dispatch_smtp_email(
                        recipient_email=recipient,
                        subject=subject,
                        body=body,
                        dry_run=False
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

                    # Enforce anti-spam random delay between individual emails (45 to 90 seconds)
                    if idx < len(ready_leads) - 1:
                        import random
                        await asyncio.sleep(random.uniform(45, 90))
        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.error(f"[OUTREACH DAEMON] Loop error: {err}")
            await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle management."""
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
                
                # Autonomous Outreach & Verification fields for leads
                for col_name, col_type in [
                    ("email_status", "VARCHAR(50) DEFAULT 'UNVERIFIED'"),
                    ("verification_notes", "TEXT"),
                    ("outreach_status", "VARCHAR(50) DEFAULT 'PENDING'"),
                    ("deal_status", "VARCHAR(50) DEFAULT 'COLD'"),
                    ("last_contacted_at", "TIMESTAMPTZ"),
                    ("followup_step", "INTEGER DEFAULT 0"),
                    ("outreach_notes", "TEXT"),
                ]:
                    await conn.execute(text(f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            except Exception as migration_err:
                logger.warning(f"Migration columns execution notice: {migration_err}")
        logger.info("PostgreSQL database tables, contact columns, user permissions, and outreach columns verified.")
    except Exception as e:
        logger.warning(f"Database table initialization warning: {e}")
    listener_task = asyncio.create_task(redis_event_listener())
    outreach_daemon_task = asyncio.create_task(autonomous_outreach_scheduler())
    yield
    listener_task.cancel()
    outreach_daemon_task.cancel()
    logger.info("Shutdown complete.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Local-first autonomous intelligence platform for B2B lead discovery and qualification.",
    lifespan=lifespan,
)

# CORS Middleware (Flexible for local dev & VPS production deployment)
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

# Include API v1 Router
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["System"])
async def root():
    """Basic root health check."""
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs": "/docs",
    }


@app.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    """Real-time event stream for Next.js dashboard."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep-alive loop; receive heartbeats if sent
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        manager.disconnect(websocket)
