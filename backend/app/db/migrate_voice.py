import logging
from sqlalchemy import text
from app.db.session import engine
from app.models.base import Base

logger = logging.getLogger(__name__)

VOICE_MIGRATION_SQLS = [
    # businesses
    "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone VARCHAR;",
    "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email VARCHAR;",
    "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_person VARCHAR;",
    "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_title VARCHAR;",
    "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address VARCHAR;",
    "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR;",

    # voice_knowledge_bases
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT 'Enterprise B2B Voice Agent';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS agent_persona_name VARCHAR(100) DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS service_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS service_description TEXT DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS core_offer VARCHAR(255) DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS first_message TEXT DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS meeting_platform VARCHAR(50) DEFAULT 'Google Meet';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS calendly_url VARCHAR(500);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS calendly_api_key VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS office_hours_start VARCHAR(10) DEFAULT '10:00';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS office_hours_end VARCHAR(10) DEFAULT '18:00';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS objections_json JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS script_questions_json JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS faq_kb_json JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS voice_provider VARCHAR(50) DEFAULT 'gemini';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS gemini_api_key VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS gemini_voice_name VARCHAR(50) DEFAULT 'Charon';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS gemini_model_id VARCHAR(100) DEFAULT 'gemini-2.5-flash-native-audio-latest';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_account_sid VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_auth_token VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_from_phone VARCHAR(50);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS twilio_webhook_base_url VARCHAR(500);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS elevenlabs_api_key VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS elevenlabs_voice_id VARCHAR(100) DEFAULT '21m00Tcm4TlvDq8ikWAM';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS elevenlabs_model_id VARCHAR(100) DEFAULT 'eleven_multilingual_v2';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS elevenlabs_agent_id VARCHAR(100);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS elevenlabs_llm VARCHAR(50) DEFAULT 'gemini-2.0-flash-exp';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS cloned_voice_id VARCHAR(100);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS cloned_voice_name VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS cloned_voice_sample_url VARCHAR(500);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS interruptible BOOLEAN DEFAULT TRUE;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS voice_stability FLOAT DEFAULT 0.5;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS voice_similarity FLOAT DEFAULT 0.75;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS voice_speed FLOAT DEFAULT 1.0;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS agent_timezone VARCHAR(50) DEFAULT 'Asia/Dhaka';",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS whatsapp_prompt_question TEXT;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS email_prompt_question TEXT;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS meeting_confirmation_speech TEXT;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS post_call_whatsapp_template TEXT;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS post_call_email_subject VARCHAR(255);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS post_call_email_template TEXT;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(100);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS whatsapp_access_token VARCHAR(500);",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS auto_call_enabled BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS max_daily_calls INTEGER DEFAULT 50;",
    "ALTER TABLE voice_knowledge_bases ADD COLUMN IF NOT EXISTS country_language_map JSONB DEFAULT '{}'::jsonb;",

    # voice_call_queue
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS lead_id UUID;",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255) DEFAULT 'Decision Maker';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS contact_title VARCHAR(150);",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT '';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT '';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS language VARCHAR(50) DEFAULT 'English';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS exact_problem TEXT DEFAULT '';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'READY';",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS selected_for_call BOOLEAN DEFAULT TRUE;",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS call_attempts INTEGER DEFAULT 0;",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS meeting_link VARCHAR(500);",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS meeting_time VARCHAR(100);",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;",
    "ALTER TABLE voice_call_queue ADD COLUMN IF NOT EXISTS notes TEXT;",

    # voice_call_logs
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS queue_item_id UUID;",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS kb_id UUID;",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT '';",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255) DEFAULT '';",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER DEFAULT 0;",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS language_used VARCHAR(50) DEFAULT 'Bengali';",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS recording_url VARCHAR(500);",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS transcript_json JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50) DEFAULT 'HOT_INTERESTED';",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS meeting_booked BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS meeting_link VARCHAR(500);",
    "ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS summary TEXT;",
]

_schema_verified = False

async def ensure_voice_agent_schema(force: bool = False):
    """
    Ensures that all Voice Agent tables and columns exist in PostgreSQL.
    Runs each migration statement under AUTOCOMMIT mode so that any individual notice/error
    will never abort the connection or transaction block.
    """
    global _schema_verified
    if _schema_verified and not force:
        return

    try:
        # Import models so metadata is complete
        import app.models.voice_agent  # noqa
        import app.models.business     # noqa
        import app.models.lead         # noqa

        # Ensure tables exist
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # Ensure all columns exist one by one with AUTOCOMMIT isolation
        async with engine.connect() as conn:
            autocommit_conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
            for sql in VOICE_MIGRATION_SQLS:
                try:
                    await autocommit_conn.execute(text(sql))
                except Exception as e:
                    # Ignore harmless duplicate/existing column notices
                    logger.debug(f"[Migration] Notice on '{sql[:40]}...': {e}")

        _schema_verified = True
        logger.info("[Migration] Voice agent schema verified successfully.")
    except Exception as err:
        logger.warning(f"[Migration] ensure_voice_agent_schema notice: {err}")
