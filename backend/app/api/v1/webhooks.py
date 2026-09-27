"""
Internal OpenClaw Scheduled Automation Webhook Endpoint
Protected by dedicated OPENCLAW_WEBHOOK_TOKEN (distinct from Gateway auth token).
"""
import json
from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, Header, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.core.config import settings
from app.core.logging import logger
from app.models.research import SchedulerRun
import redis.asyncio as aioredis

router = APIRouter(prefix="/internal/cron", tags=["Internal Automation"])


@router.post("/trigger", status_code=status.HTTP_200_OK)
async def handle_cron_trigger(
    payload: Dict[str, Any],
    x_webhook_token: str = Header(..., alias="X-Webhook-Token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Receives automated scheduled webhook notifications from OpenClaw's native cron scheduler.
    Validates the dedicated webhook token, records the execution, and enqueues tasks into Redis.
    """
    if x_webhook_token != settings.OPENCLAW_WEBHOOK_TOKEN:
        logger.warning("Rejected cron trigger with invalid X-Webhook-Token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal webhook token",
        )

    trigger_type = payload.get("trigger_type", "scheduled_discovery")
    logger.info(f"Accepted authenticated cron trigger: {trigger_type}")

    # Record scheduler trigger event
    sched_run = SchedulerRun(
        trigger_type=trigger_type,
        status="ACCEPTED",
        payload_json=payload,
    )
    db.add(sched_run)
    await db.commit()

    # Forward to Redis queue if payload requests execution
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        task_data = {
            "type": "scheduled_automation",
            "trigger_type": trigger_type,
            "payload": payload,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }
        await r.lpush("leadgen:tasks", json.dumps(task_data))
        await r.aclose()
    except Exception as e:
        logger.error(f"Failed to push cron trigger to Redis: {e}")
        return {"status": "recorded_db_only", "warning": "Redis unavailable"}

    return {"status": "enqueued", "trigger_type": trigger_type}
