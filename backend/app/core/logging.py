"""
Autonomous B2B Lead-Generation Platform — Structured Logging System
Masks sensitive keys (tokens, passwords, secrets, cookies) automatically.
"""
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict

SENSITIVE_PATTERNS = {
    "token", "password", "secret", "cookie", "auth", "authorization",
    "key", "access_token", "refresh_token", "private_key"
}


def sanitize_data(data: Any) -> Any:
    """Recursively mask sensitive values in dicts and lists."""
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if any(pattern in k.lower() for pattern in SENSITIVE_PATTERNS):
                sanitized[k] = "******"
            else:
                sanitized[k] = sanitize_data(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    return data


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON with timestamps and sanitized context."""

    def format(self, record: logging.LogRecord) -> str:
        log_payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }

        # Include structured extra fields if present
        if hasattr(record, "extra") and isinstance(record.extra, dict):
            log_payload["context"] = sanitize_data(record.extra)

        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_payload)


def setup_logger(name: str = "leadgen", level: str = "INFO") -> logging.Logger:
    """Configures and returns a structured logger."""
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Avoid duplicate handlers on reloads
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
        logger.propagate = False

    return logger


logger = setup_logger()
