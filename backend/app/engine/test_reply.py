import sys
import os
from pathlib import Path
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

env_path = backend_dir.parent / ".env"
load_dotenv(dotenv_path=env_path)

import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import AsyncSessionLocal
from app.models.lead import Lead
from app.engine.outreach_engine import OutreachEngine

async def test_reply_processing():
    async with AsyncSessionLocal() as session:
        stmt = select(Lead).options(selectinload(Lead.business)).where(Lead.outreach_status == "SENT")
        res = await session.execute(stmt)
        lead = res.scalars().first()

        if not lead:
            print("[!] No SENT lead found for reply test.")
            return

        sample_reply = "Hi! Thanks for reaching out. Yes, we are interested in scheduling a 5-minute demo call this Thursday."
        print(f"[*] Simulating incoming reply for lead: {lead.business.canonical_name}")
        print(f" -> Reply text: '{sample_reply}'")

        sentiment, explanation = OutreachEngine.classify_reply_sentiment(sample_reply)
        print(f" -> Analyzed Sentiment: {sentiment} ({explanation})")

        if sentiment == "POSITIVE":
            lead.deal_status = "HOT_LEAD"
            lead.outreach_status = "REPLIED_HOT"
            print(f"  ✓ Lead automatically promoted to [HOT_LEAD] CRM pipeline!")
            print(f"  ✓ Automated cold outreach sequence stopped for this lead.")

        await session.commit()

if __name__ == "__main__":
    asyncio.run(test_reply_processing())
