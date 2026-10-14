"""
Compatibility module forwarding to the unified AI Client.
All local LLM and local models (Ollama/Qwen/Gemma/Llama) have been completely removed.
"""
from app.services.ai_client import (
    AIClient as OllamaClient,
    MockAIClient as MockOllamaClient,
    AIClientError as OllamaClientError,
    AIClient,
    MockAIClient,
    AIClientError,
)

__all__ = [
    "OllamaClient",
    "MockOllamaClient",
    "OllamaClientError",
    "AIClient",
    "MockAIClient",
    "AIClientError",
]
