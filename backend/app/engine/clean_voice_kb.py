import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import asyncio
from sqlalchemy import text, select, delete
from app.db.session import engine, AsyncSessionLocal
from app.models import Base
from app.models.voice_agent import VoiceKnowledgeBase, VoiceCallQueueItem, VoiceCallLog

async def ensure_voice_tables_and_seed():
    print("[1/3] Verifying and creating Voice Agent tables and columns in PostgreSQL...")
    from app.db.migrate_voice import ensure_voice_agent_schema
    await ensure_voice_agent_schema(force=True)
    print("  ✓ Verified and migrated all Voice Agent tables and columns with AUTOCOMMIT.")

    print("[2/3] Checking Voice Knowledge Base records in PostgreSQL...")
    async with AsyncSessionLocal() as session:
        stmt = select(VoiceKnowledgeBase).where(VoiceKnowledgeBase.is_active == True)
        res = await session.execute(stmt)
        existing = res.scalars().all()

        if not existing:
            print("  [*] No active record found. Initializing single clean active record...")
            kb = VoiceKnowledgeBase(
                name="Enterprise B2B Voice Agent",
                company_name="",
                agent_persona_name="",
                service_name="",
                service_description="",
                core_offer="",
                gemini_voice_name="Charon",
                first_message="",
                system_prompt="",
                is_active=True
            )
            session.add(kb)
            await session.commit()
            await session.refresh(kb)
            print(f"  ✓ Initialized clean active record with ID: {kb.id}")
        else:
            primary = existing[0]
            if primary.core_offer == "superadmin@leadgen.local":
                primary.core_offer = ""
                await session.commit()
                print("  ✓ Cleared accidental browser autofill email from core_offer.")
            if not primary.gemini_model_id or "2.5" in primary.gemini_model_id:
                primary.gemini_model_id = "gemini-2.0-flash-exp"
                await session.commit()
                print("  ✓ Corrected gemini_model_id to valid official 'gemini-2.0-flash-exp'.")
            if not primary.gemini_voice_name or primary.gemini_voice_name in ["Aoede", "Kore"]:
                primary.gemini_voice_name = "Charon"
                await session.commit()
                print("  ✓ Corrected gemini_voice_name to authoritative male 'Charon'.")
            if len(existing) > 1:
                await session.execute(delete(VoiceKnowledgeBase).where(VoiceKnowledgeBase.id != primary.id))
                await session.commit()
                print(f"  ✓ Cleaned up {len(existing) - 1} duplicate rows.")
            print(f"  ✓ Found active record with ID: {primary.id}")
            print(f"    Company: '{primary.company_name}' | Persona: '{primary.agent_persona_name}' | Voice: '{primary.gemini_voice_name}'")

    print("[3/3] Voice Agent Database is 100% verified, migrated, and ready for updates!")

if __name__ == "__main__":
    asyncio.run(ensure_voice_tables_and_seed())
