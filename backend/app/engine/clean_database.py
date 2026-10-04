"""
Database Cleanup & Reset Utility.
Safely purges leads, evidence, research runs, and discovered businesses
while preserving system seed data (135 parameters, services, and business types).
"""
import sys
import os
from pathlib import Path

# Auto-add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal
from app.core.logging import logger


async def clean_database(purge_businesses: bool = True):
    """Purges operational lead generation data, campaign logs, and history from PostgreSQL and Redis."""
    async with AsyncSessionLocal() as session:
        print("[*] Starting database cleanup...")

        # Delete outreach logs, feedback, scores, service matches, and leads
        await session.execute(text("DELETE FROM email_outreach_logs;"))
        await session.execute(text("DELETE FROM lead_feedback;"))
        await session.execute(text("DELETE FROM lead_scores;"))
        await session.execute(text("DELETE FROM service_matches;"))
        await session.execute(text("DELETE FROM leads;"))
        print("  ✓ Cleared leads, scores, outreach logs, and reviewer feedback.")

        # Delete research jobs, runs, campaigns, and scheduler history
        await session.execute(text("DELETE FROM research_jobs;"))
        await session.execute(text("DELETE FROM research_runs;"))
        await session.execute(text("DELETE FROM autopilot_campaigns;"))
        await session.execute(text("DELETE FROM scheduler_runs;"))
        print("  ✓ Cleared research runs, campaigns, worker jobs, and scheduler logs.")

        # Delete evidence and business data if requested
        if purge_businesses:
            await session.execute(text("DELETE FROM evidence;"))
            await session.execute(text("DELETE FROM parameter_results;"))
            await session.execute(text("DELETE FROM business_locations;"))
            await session.execute(text("DELETE FROM businesses;"))
            print("  ✓ Cleared discovered businesses, locations, and evidence records.")

        await session.commit()

        # Clear Redis queues
        try:
            import redis.asyncio as aioredis
            from app.core.config import settings
            r = aioredis.from_url(settings.REDIS_URL)
            await r.delete("leadgen:tasks")
            await r.aclose()
            print("  ✓ Flushed Redis tasks queue.")
        except Exception as e:
            print(f"  [!] Redis flush note: {e}")

        print("[+] Database cleanup completed successfully! Parameters & system catalogs preserved.")


if __name__ == "__main__":
    asyncio.run(clean_database())
