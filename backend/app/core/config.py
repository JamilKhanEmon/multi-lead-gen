from typing import List, Optional
from pydantic import Field, PostgresDsn, RedisDsn, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "LeadGen Autonomous Intelligence Platform"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = Field(default="development", description="development, staging, production")
    LOG_LEVEL: str = Field(default="INFO", description="DEBUG, INFO, WARNING, ERROR, CRITICAL")
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = Field(
        default="dev_jwt_secret_key_change_me_super_secure_9832749823749823",
        description="JWT signature secret key",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    POSTGRES_USER: str = "leadgen"
    POSTGRES_PASSWORD: str = "leadgen_secret_pw"
    POSTGRES_DB: str = "leadgen"
    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: Optional[str] = None

    @field_validator("DATABASE_URL", mode="before")
    def assemble_db_connection(cls, v: Optional[str], info) -> str:
        if isinstance(v, str) and v.strip():
            return v
        values = info.data
        return (
            f"postgresql+asyncpg://{values.get('POSTGRES_USER')}:{values.get('POSTGRES_PASSWORD')}"
            f"@{values.get('POSTGRES_HOST')}:{values.get('POSTGRES_PORT')}/{values.get('POSTGRES_DB')}"
        )

    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 6379
    REDIS_URL: Optional[str] = None

    @field_validator("REDIS_URL", mode="before")
    def assemble_redis_connection(cls, v: Optional[str], info) -> str:
        if isinstance(v, str) and v.strip():
            return v
        values = info.data
        return f"redis://{values.get('REDIS_HOST')}:{values.get('REDIS_PORT')}/0"

    OPENCLAW_GATEWAY_URL: str = Field(
        default="ws://127.0.0.1:18789",
        description="Loopback OpenClaw Gateway endpoint (no /ws)",
    )
    OPENCLAW_GATEWAY_TOKEN: str = Field(
        default="oc_dev_gateway_token_change_me_super_secure",
        description="Authentication token for OpenClaw Gateway connect handshake",
    )
    OPENCLAW_WEBHOOK_TOKEN: str = Field(
        default="oc_dev_webhook_token_change_me_distinct_secret",
        description="Dedicated token for validating inbound cron/automation webhooks",
    )
    OPENCLAW_MODEL: Optional[str] = Field(
        default=None,
        description="Optional override for OpenClaw active LLM model (defaults to active agent in OpenClaw)",
    )

    GROQ_API_KEY: Optional[str] = Field(
        default=None,
        description="Groq API Key (ultra-fast, cost-efficient inference via console.groq.com)",
    )
    OPENAI_API_KEY: Optional[str] = Field(
        default=None,
        description="OpenAI API Key (e.g. for gpt-4o-mini)",
    )
    LLM_PROVIDER: str = Field(
        default="groq",
        description="LLM Provider: 'groq', 'openai', 'openclaw', or 'custom'",
    )
    LLM_MODEL: Optional[str] = Field(
        default=None,
        description="Override model name (e.g. 'llama-3.1-8b-instant' or 'gpt-4o-mini')",
    )
    LLM_BASE_URL: Optional[str] = Field(
        default=None,
        description="Custom OpenAI-compatible base URL (e.g. local Ollama or vLLM)",
    )
    LLM_MAX_TOKENS: int = Field(
        default=250,
        ge=50,
        le=2048,
        description="Strict maximum token limit to prevent excessive token usage and costs",
    )
    LLM_TEMPERATURE: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="Sampling temperature for deterministic, concise outputs",
    )

    WORKER_CONCURRENCY: int = Field(default=2, ge=1, le=4)
    RESEARCH_TIMEOUT_SECONDS: int = Field(default=120, ge=30, le=600)
    MAX_RETRY_ATTEMPTS: int = Field(default=5, ge=1, le=10)

    META_ACCESS_TOKEN: Optional[str] = Field(default=None, description="System User Access Token with ads_management")
    META_AD_ACCOUNT_ID: Optional[str] = Field(default=None, description="Meta Ad Account ID e.g. act_123456789")
    META_PAGE_ID: Optional[str] = Field(default=None, description="Facebook Business Page ID")

    ELEVENLABS_API_KEY: Optional[str] = Field(default=None, description="ElevenLabs API Key for Voice Agent & Cloning")

    SMTP_HOST: Optional[str] = Field(default=None, description="SMTP Server Host (e.g., smtp.gmail.com)")
    SMTP_PORT: int = Field(default=587, description="SMTP Port (587 for TLS, 465 for SSL)")
    SMTP_USER: Optional[str] = Field(default=None, description="SMTP Authentication Username/Email")
    SMTP_PASSWORD: Optional[str] = Field(default=None, description="SMTP Authentication Password or App Password")
    SMTP_FROM_EMAIL: Optional[str] = Field(default=None, description="Sender Email Address")
    SMTP_FROM_NAME: str = Field(default="", description="Sender Name displayed in email clients")

    IMAP_HOST: Optional[str] = Field(default=None, description="IMAP Server Host (e.g., imap.gmail.com)")
    IMAP_PORT: int = Field(default=993, description="IMAP SSL Port (typically 993)")
    IMAP_USER: Optional[str] = Field(default=None, description="IMAP Username/Email (defaults to SMTP_USER if not set)")
    IMAP_PASSWORD: Optional[str] = Field(default=None, description="IMAP Password or App Password (defaults to SMTP_PASSWORD if not set)")
    IMAP_POLL_INTERVAL_SECONDS: int = Field(default=180, description="Interval in seconds to check inbox for client replies")

    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

settings = Settings()

