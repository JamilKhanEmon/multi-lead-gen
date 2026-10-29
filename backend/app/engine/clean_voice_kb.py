import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal
from app.models.voice_agent import VoiceKnowledgeBase

async def clean_voice_kb():
    async with AsyncSessionLocal() as session:
        print("[*] Purging all old voice_knowledge_bases rows from PostgreSQL...")
        await session.execute(text("DELETE FROM voice_knowledge_bases;"))
        await session.commit()

        # Create one clean, empty row ready for admin input
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
        print(f"  ✓ Single clean empty record initialized in DB (ID: {kb.id}).")
        print("[+] Voice Agent DB is 100% clean. Ready for admin to add/update custom data!")

if __name__ == "__main__":
    asyncio.run(clean_voice_kb())
