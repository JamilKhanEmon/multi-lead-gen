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
from app.schemas.admin import SystemHealthResponse, SystemMetricsResponse, ComponentHealth
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
