"""
Clear all test research runs, leads, businesses, and redis tasks.
"""
import asyncio
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import AsyncSessionLocal
from sqlalchemy import delete
from app.models.research import ResearchRun, ResearchJob
from app.models.autopilot import EmailOutreachLog, AutopilotCampaign
from app.models.business import Business, BusinessLocation
from app.models.evidence import Evidence
from app.models.service import ServiceMatch
from app.models.lead import Lead, LeadScore, LeadFeedback
from app.models.voice_agent import VoiceCallLog, VoiceCallQueueItem
from app.models.campaign import MetaCampaign
import redis.asyncio as aioredis
from app.core.config import settings


async def clear_all():
    print("[*] Purging all test leads, runs, voice queue items, and businesses from database...")
    async with AsyncSessionLocal() as db:
        await db.execute(delete(EmailOutreachLog))
        await db.execute(delete(LeadFeedback))
        await db.execute(delete(LeadScore))
        await db.execute(delete(VoiceCallLog))
        await db.execute(delete(VoiceCallQueueItem))
        await db.execute(delete(ServiceMatch))
        await db.execute(delete(MetaCampaign))
        await db.execute(delete(Lead))
        await db.execute(delete(ResearchJob))
        await db.execute(delete(ResearchRun))
        await db.execute(delete(AutopilotCampaign))
        await db.execute(delete(Evidence))
        await db.execute(delete(BusinessLocation))
        await db.execute(delete(Business))
        await db.commit()
    print("[+] Database cleaned successfully.")

    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.delete("leadgen:tasks")
        await r.delete("leadgen:events")
        await r.aclose()
        print("[+] Redis queues and tasks cleared.")
    except Exception as e:
        print(f"[!] Redis notice: {e}")

    print("[SUCCESS] All test data removed completely. Dashboard is fresh and clean.")


if __name__ == "__main__":
    asyncio.run(clear_all())
