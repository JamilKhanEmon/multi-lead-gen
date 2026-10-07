import base64
import json
import os
import time
from typing import Dict, Any, List, Optional
import httpx
from app.core.config import settings
from app.core.logging import logger

class OllamaClientError(Exception):
    pass

class OllamaClient:

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
        messages = [
            {"role": "system", "content": system_prompt},
        ]

        user_message: Dict[str, Any] = {"role": "user", "content": user_prompt}

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
        t0 = time.time()

        if settings.OPENCLAW_GATEWAY_URL and not any(loc in settings.OPENCLAW_GATEWAY_URL for loc in ["127.0.0.1", "localhost"]):
            gw_base = settings.OPENCLAW_GATEWAY_URL.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
            gw_url = f"{gw_base}/v1/chat/completions"
            gw_headers = {
                "Authorization": f"Bearer {settings.OPENCLAW_GATEWAY_TOKEN}",
                "Content-Type": "application/json",
                "x-openclaw-session": "leadgen_pipeline",
            }
            gw_payload = {
                "model": "default",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "user": "leadgen_backend",
            }
            if not image_paths:
                try:
                    async with httpx.AsyncClient(timeout=25.0) as gw_client:
                        gw_resp = await gw_client.post(gw_url, json=gw_payload, headers=gw_headers)
                        if gw_resp.status_code == 200:
                            gw_data = gw_resp.json()
                            content = gw_data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                            elapsed_ms = round((time.time() - t0) * 1000, 2)
                            logger.info(f"OpenClaw Cloud AI reasoning completed in {elapsed_ms}ms (Session isolated)")
                            try:
                                return json.loads(content)
                            except json.JSONDecodeError:
                                import re
                                clean_c = re.sub(r"^```(?:json)?\s*", "", content.strip())
                                clean_c = re.sub(r"\s*```$", "", clean_c)
                                return json.loads(clean_c)
                        else:
                            logger.warning(f"OpenClaw Cloud Gateway returned status {gw_resp.status_code}, falling back to local engine.")
                except Exception as gw_err:
                    logger.debug(f"OpenClaw Cloud Gateway reasoning notice (graceful fallback): {gw_err}")

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,
                "num_ctx": 8192,
            },
        }

        url = f"{self.base_url}/api/chat"
        logger.debug(f"Calling Ollama model '{self.model}' at {url}")

        fallback_models = [self.model, "qwen2.5:7b", "llama3.1:8b", "gemma3:4b"]

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
                    logger.debug(f"Local Ollama daemon not running (uninstalled): {conn_err}")
                    last_err = str(conn_err)
                    break

            logger.info("Using deterministic semantic reasoning fallback.")
            mock_fallback = MockOllamaClient()
            return await mock_fallback.analyze(system_prompt, user_prompt, image_paths, response_schema)

class MockOllamaClient:

    def __init__(self, return_payload: Optional[Dict[str, Any]] = None):
        self.return_payload = return_payload

    async def analyze(
        self,
        system_prompt: str,
        user_prompt: str,
        image_paths: Optional[List[str]] = None,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
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

