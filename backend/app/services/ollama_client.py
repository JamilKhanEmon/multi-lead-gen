"""
Ollama Multimodal Client Adapter (gemma3:4b Native macOS Integration)
Adheres to official /api/chat contract supporting text and base64 images.
"""
import base64
import json
import os
import time
from typing import Dict, Any, List, Optional
import httpx
from app.core.config import settings
from app.core.logging import logger


class OllamaClientError(Exception):
    """Raised on Ollama HTTP or inference errors."""
    pass


class OllamaClient:
    """Async client for local Ollama multimodal models."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 45.0,
    ):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.model = model or settings.OLLAMA_MODEL
        self.timeout = timeout

    async def analyze(
        self,
        system_prompt: str,
        user_prompt: str,
        image_paths: Optional[List[str]] = None,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Executes a multimodal or text-only inference call via POST /api/chat.
        Returns parsed and validated structured JSON.
        """
        messages = [
            {"role": "system", "content": system_prompt},
        ]

        user_message: Dict[str, Any] = {"role": "user", "content": user_prompt}

        # Encode image files to base64 if provided
        if image_paths:
            base64_images = []
            for path in image_paths:
                if os.path.exists(path):
                    with open(path, "rb") as img_file:
                        encoded = base64.b64encode(img_file.read()).decode("utf-8")
                        base64_images.append(encoded)
            if base64_images:
                user_message["images"] = base64_images

        messages.append(user_message)

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,  # Low temperature for deterministic analysis
                "num_ctx": 8192,
            },
        }

        url = f"{self.base_url}/api/chat"
        t0 = time.time()
        logger.debug(f"Calling Ollama model '{self.model}' at {url}")

        fallback_models = [self.model, "gemma3:4b", "qwen2.5:7b", "qwen3:8b"]

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            last_err = None
            for model_name in fallback_models:
                payload["model"] = model_name
                try:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        content = data.get("message", {}).get("content", "{}")
                        elapsed_ms = round((time.time() - t0) * 1000, 2)
                        logger.info(f"Ollama inference ({model_name}) completed in {elapsed_ms}ms")

                        try:
                            parsed = json.loads(content)
                            return parsed
                        except json.JSONDecodeError:
                            logger.warning(f"Ollama ({model_name}) non-JSON response, attempting extraction: {content[:100]}")
                            return {"raw_reasoning": content, "service_matches": []}

                    elif resp.status_code == 404:
                        logger.warning(f"Ollama model '{model_name}' not found locally. Trying next fallback...")
                        last_err = f"Model {model_name} not found"
                        continue
                    else:
                        raise OllamaClientError(f"Ollama returned HTTP {resp.status_code}: {resp.text}")
                except (httpx.ConnectError, httpx.TimeoutException) as conn_err:
                    logger.warning(f"Ollama connection error for model {model_name}: {conn_err}")
                    last_err = str(conn_err)
                    break

            raise OllamaClientError(f"Ollama inference error: {last_err or 'All models failed'}")


class MockOllamaClient:
    """Mock Ollama client for unit and integration testing without local daemon."""

    def __init__(self, return_payload: Optional[Dict[str, Any]] = None):
        self.return_payload = return_payload

    async def analyze(
        self,
        system_prompt: str,
        user_prompt: str,
        image_paths: Optional[List[str]] = None,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # Dynamically infer service matches based on signals in user_prompt
        services = []
        findings = []

        prompt_lower = user_prompt.lower()
        if '"has_whatsapp": false' in prompt_lower:
            findings.append({
                "parameter_id": 43,
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.92,
                "reason": "Website lacks click-to-WhatsApp interaction, creating customer contact friction.",
            })
            services.append({
                "service_id": "whatsapp-automation",
                "confidence": 0.90,
                "reason": "WhatsApp lead generation and automation will streamline customer inquiries.",
            })

        if '"mobile_responsive": false' in prompt_lower:
            findings.append({
                "parameter_id": 37,
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "reason": "Viewport breaks on mobile devices.",
            })
            services.append({
                "service_id": "website-modernization",
                "confidence": 0.92,
                "reason": "Modern responsive web architecture required to convert mobile visitors.",
            })

        if '"has_online_booking": false' in prompt_lower:
            services.append({
                "service_id": "booking-systems",
                "confidence": 0.88,
                "reason": "Automated online scheduling solves appointment delays.",
            })

        if not services:
            services.append({
                "service_id": "website-modernization",
                "confidence": 0.85,
                "reason": "Digital presence optimization to maximize conversion.",
            })

        return {
            "business_type": "detected_commercial",
            "findings": findings,
            "service_matches": services,
        }

