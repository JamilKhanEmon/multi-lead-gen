"""
Research Run Creation & Management Endpoints
"""
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.api.deps import get_db, get_current_user, get_current_user_optional
from app.core.config import settings
from app.models.research import ResearchRun, ResearchJob
from app.models.audit import User
from app.schemas.research import ResearchRunCreate, ResearchRunResponse, ResearchJobResponse
import redis.asyncio as aioredis

router = APIRouter(prefix="/research", tags=["Research"])


@router.post("", response_model=ResearchRunResponse, status_code=status.HTTP_201_CREATED)
async def create_research_run(
    data: ResearchRunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Initiates a new research run and enqueues initial discovery job in Redis."""
    if current_user and current_user.role != "super_admin":
        perms = current_user.permissions_json or {}
        if perms.get("can_run_research") is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: You do not have permission to launch autonomous research runs.",
            )

    country = (data.country or "").strip()
    city = (data.city or "").strip()
    sub_city = (data.sub_city or "").strip()

    parts = [p for p in [sub_city, city, country] if p]
    computed_location = ", ".join(parts) if parts else (data.location or "").strip()

    run = ResearchRun(
        industry=data.industry.strip(),
        location=computed_location,
        depth=data.depth.upper(),
        status="RUNNING",
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()

    # Create root business discovery job
    job = ResearchJob(
        run_id=run.id,
        task_type="discover_businesses",
        status="QUEUED",
        attempt=1,
        max_attempts=settings.MAX_RETRY_ATTEMPTS,
        payload_json={
            "industry": data.industry.strip(),
            "country": country,
            "city": city,
            "sub_city": sub_city,
            "location": computed_location,
            "depth": data.depth,
            "company_limit": data.company_limit,
            "target_services": data.target_services,
            "business_type_override": data.business_type_override,
            "auto_mail_enabled": data.auto_mail_enabled,
        },
    )
    db.add(job)
    await db.flush()

    # Push job payload to Redis queue `leadgen:tasks`
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL)
        task_payload = {
            "job_id": str(job.id),
            "run_id": str(run.id),
            "business_id": None,
            "type": job.task_type,
            "depth": data.depth,
            "attempt": 1,
            "max_attempts": job.max_attempts,
            "payload": job.payload_json,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis_client.lpush("leadgen:tasks", json.dumps(task_payload))
        await redis_client.aclose()
    except Exception as e:
        # If redis is down, record failure on job
        job.status = "FAILED"
        job.error_message = f"Failed to enqueue to Redis: {str(e)}"
        run.status = "FAILED"

    await db.commit()
    await db.refresh(run)
    return run


@router.get("", response_model=List[ResearchRunResponse])
async def list_research_runs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """List historical research runs with pagination."""
    stmt = select(ResearchRun).order_by(desc(ResearchRun.created_at)).offset(skip).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/{run_id}", response_model=ResearchRunResponse)
async def get_research_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details and real-time counters for a research run."""
    stmt = select(ResearchRun).where(ResearchRun.id == run_id)
    res = await db.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research run not found")

    processed = run.qualified_count + run.rejected_count + run.failed_count
    if run.status == "RUNNING" and run.discovered_count > 0 and processed >= run.discovered_count:
        run.status = "COMPLETED"
        run.completed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(run)

    return run


@router.post("/{run_id}/cancel", response_model=ResearchRunResponse)
async def cancel_research_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancels an active research run."""
    stmt = select(ResearchRun).where(ResearchRun.id == run_id)
    res = await db.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research run not found")

    run.status = "CANCELLED"
    run.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(run)
    return run


@router.delete("/{run_id}")
async def delete_research_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Delete a specific research run, all associated jobs, and all leads belonging to that run."""
    from app.models.research import ResearchJob
    from app.models.lead import Lead
    from sqlalchemy import delete

    stmt = select(ResearchRun).where(ResearchRun.id == run_id)
    res = await db.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research run not found")

    await db.execute(delete(Lead).where(Lead.run_id == run_id))
    await db.execute(delete(ResearchJob).where(ResearchJob.run_id == run_id))
    await db.delete(run)
    await db.commit()
    return {"status": "SUCCESS", "message": f"Research run {run_id} and its data deleted"}


@router.delete("")
async def clear_all_research_runs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear all historical research runs and purge pending tasks."""
    from sqlalchemy import delete
    from app.models.research import ResearchJob
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.delete("leadgen:tasks")
        await r.aclose()
    except Exception:
        pass

    await db.execute(delete(ResearchJob))
    res = await db.execute(delete(ResearchRun))
    await db.commit()
    return {"status": "SUCCESS", "deleted_count": res.rowcount}
