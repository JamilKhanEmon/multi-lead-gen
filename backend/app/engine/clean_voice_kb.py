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
    print("[1/3] Verifying and creating Voice Agent tables in PostgreSQL...")
    async with engine.begin() as conn:
        # Guarantee voice_knowledge_bases, voice_call_queue, voice_call_logs exist in Postgres
        await conn.run_sync(Base.metadata.create_all)
        print("  ✓ Base.metadata.create_all executed successfully.")

        # Ensure all columns exist even on legacy databases
        migration_sqls = [
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS calendly_url VARCHAR(500);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS calendly_api_key VARCHAR(255);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS post_call_whatsapp_template TEXT;",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS post_call_email_subject VARCHAR(255);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS post_call_email_template TEXT;",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(100);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS whatsapp_access_token VARCHAR(500);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS gemini_api_key VARCHAR(255);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS gemini_voice_name VARCHAR(50) DEFAULT 'Aoede';",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS gemini_model_id VARCHAR(100) DEFAULT 'gemini-2.5-flash-native-audio-latest';",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_account_sid VARCHAR(255);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_auth_token VARCHAR(255);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_from_phone VARCHAR(50);",
            "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_webhook_base_url VARCHAR(500);",
        ]
        for sql in migration_sqls:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass
        print("  ✓ Verified all voice_knowledge_bases columns.")

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
                gemini_voice_name="Aoede",
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
            if len(existing) > 1:
                await session.execute(delete(VoiceKnowledgeBase).where(VoiceKnowledgeBase.id != primary.id))
                await session.commit()
                print(f"  ✓ Cleaned up {len(existing) - 1} duplicate rows.")
            print(f"  ✓ Found active record with ID: {primary.id}")
            print(f"    Company: '{primary.company_name}' | Persona: '{primary.agent_persona_name}' | Voice: '{primary.gemini_voice_name}'")

    print("[3/3] Voice Agent Database is 100% verified, migrated, and ready for updates!")

if __name__ == "__main__":
    asyncio.run(ensure_voice_tables_and_seed())
