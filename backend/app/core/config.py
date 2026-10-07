from typing import List, Optional
from pydantic import Field, PostgresDsn, RedisDsn, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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

    OLLAMA_BASE_URL: str = Field(
        default="http://127.0.0.1:11434",
        description="Native macOS Ollama instance",
    )
    OLLAMA_MODEL: str = Field(
        default="qwen2.5:7b",
        description="High-speed B2B reasoning model (Qwen 2.5 7B, precise JSON and cold outreach copy)",
    )

    WORKER_CONCURRENCY: int = Field(default=2, ge=1, le=4)
    RESEARCH_TIMEOUT_SECONDS: int = Field(default=120, ge=30, le=600)
    MAX_RETRY_ATTEMPTS: int = Field(default=5, ge=1, le=10)

    META_ACCESS_TOKEN: Optional[str] = Field(default=None, description="System User Access Token with ads_management")
    META_AD_ACCOUNT_ID: Optional[str] = Field(default=None, description="Meta Ad Account ID e.g. act_123456789")
    META_PAGE_ID: Optional[str] = Field(default=None, description="Facebook Business Page ID")

    GOOGLE_API_KEY: Optional[str] = Field(default=None, description="Google Gemini/Imagen/Veo API key")

    SMTP_HOST: Optional[str] = Field(default=None, description="SMTP Server Host (e.g., smtp.gmail.com)")
    SMTP_PORT: int = Field(default=587, description="SMTP Port (587 for TLS, 465 for SSL)")
    SMTP_USER: Optional[str] = Field(default=None, description="SMTP Authentication Username/Email")
    SMTP_PASSWORD: Optional[str] = Field(default=None, description="SMTP Authentication Password or App Password")
    SMTP_FROM_EMAIL: Optional[str] = Field(default=None, description="Sender Email Address")
    SMTP_FROM_NAME: str = Field(default="LeadGen Sales Team", description="Sender Name displayed in email clients")

    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

settings = Settings()

