"""
Outreach Dispatcher CLI Script.
Dispatches cold outreach emails for all leads with status 'READY_FOR_OUTREACH'.
Uses live SMTP if configured in .env, or Dry-Run simulation if not configured.
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Add backend directory to sys.path and load .env file
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

env_path = backend_dir.parent / ".env"
load_dotenv(dotenv_path=env_path)

import asyncio
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.lead import Lead
from app.models.autopilot import EmailOutreachLog
from app.engine.outreach_engine import OutreachEngine
from app.core.logging import logger


async def dispatch_pending_outreach(force_live: bool = False):
    """Fetches ready leads and dispatches outreach emails."""
    async with AsyncSessionLocal() as session:
        smtp_host = os.getenv("SMTP_HOST")
        smtp_user = os.getenv("SMTP_USER")
        is_smtp_ready = bool(smtp_host and smtp_user)

        mode_str = "LIVE SMTP DISPATCH" if (is_smtp_ready or force_live) else "SIMULATION (DRY-RUN)"
        print(f"[*] Starting Outreach Dispatcher in [{mode_str}] mode...")

        stmt = (
            select(Lead)
            .options(selectinload(Lead.business))
            .where(Lead.outreach_status == "READY_FOR_OUTREACH", Lead.is_qualified == True)
        )
        res = await session.execute(stmt)
        ready_leads = res.scalars().all()

        if not ready_leads:
            print("[!] No leads found with status 'READY_FOR_OUTREACH'.")
            return

        print(f"[+] Found {len(ready_leads)} leads ready for outreach.")

        dispatched_count = 0
        failed_count = 0

        for lead in ready_leads:
            biz = lead.business
            recipient_email = biz.email or "softvence.jamil@gmail.com"

            # Render email
            subject, body = OutreachEngine.render_email(
                step=1,
                lead_data={
                    "company_name": biz.canonical_name,
                    "contact_person": biz.contact_person or "Executive",
                    "city": biz.address or "Dhaka",
                    "primary_gap": lead.primary_gap_summary
                }
            )

            print(f" -> Dispatching to {biz.canonical_name} ({recipient_email})...")

            # Dispatch email
            dry_run = not (is_smtp_ready or force_live)
            success, note = await OutreachEngine.dispatch_smtp_email(
                recipient_email=recipient_email,
                subject=subject,
                body=body,
                dry_run=dry_run
            )

            if success:
                lead.outreach_status = "SENT"
                lead.followup_step = 1
                lead.last_contacted_at = datetime.now(timezone.utc)

                log = EmailOutreachLog(
                    lead_id=lead.id,
                    step=1,
                    recipient_email=recipient_email,
                    subject=subject,
                    body_snippet=body[:300],
                    status="SENT",
                    sent_at=datetime.now(timezone.utc)
                )
                session.add(log)
                dispatched_count += 1
                print(f"    ✓ Success: {note}")
            else:
                failed_count += 1
                print(f"    ✗ Failed: {note}")

        await session.commit()
        print(f"\n[+] Dispatch complete. Successfully sent: {dispatched_count}, Failed: {failed_count}.")


if __name__ == "__main__":
    force = "--live" in sys.argv
    asyncio.run(dispatch_pending_outreach(force_live=force))
