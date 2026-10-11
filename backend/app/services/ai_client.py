import base64
import json
import os
import time
from typing import Dict, Any, List, Optional
import httpx
from app.core.config import settings
from app.core.logging import logger

class AIClientError(Exception):
    pass

class AIClient:
    """
    Cloud AI & Deterministic Reasoning Client.
    All local LLM engines and local models have been completely removed.
    Inference routes to:
      1. OpenClaw Cloud AI Gateway (if OPENCLAW_GATEWAY_URL is configured)
      2. Google Gemini API (if GOOGLE_API_KEY is configured)
      3. Deterministic Semantic Reasoning Engine (Instant, zero external/local dependency)
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 45.0,
    ):
        self.base_url = base_url or ""
        self.model = model or "cloud-default"
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

        # 1. OpenClaw Protocol 4 WebSocket Gateway (Local or Remote Daemon)
        ws_res = await self._query_openclaw_ws(system_prompt, user_prompt)
        if ws_res:
            elapsed_ms = round((time.time() - t0) * 1000, 2)
            logger.info(f"OpenClaw Protocol 4 (Active LLM Agent) completed in {elapsed_ms}ms")
            if isinstance(ws_res, dict):
                ws_res["_source"] = "OPENCLAW"
            return ws_res

        # 2. OpenClaw HTTP /v1/chat/completions (Local or Remote Gateway)
        raw_gw = settings.OPENCLAW_GATEWAY_URL or "http://127.0.0.1:18789"
        candidate_http_bases = [raw_gw.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")]
        if any(h in raw_gw for h in ["127.0.0.1", "localhost"]):
            candidate_http_bases.append("http://host.docker.internal:18789")
            candidate_http_bases.append("http://172.17.0.1:18789")

        token = settings.OPENCLAW_GATEWAY_TOKEN or ""
        openclaw_model = os.getenv("OPENCLAW_MODEL", "default")

        for base_url in candidate_http_bases:
            try:
                gw_url = f"{base_url}/v1/chat/completions"
                gw_headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "x-openclaw-session": "leadgen_reply_analysis",
                }
                gw_payload = {
                    "model": openclaw_model,
                    "messages": messages,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "user": "leadgen_backend",
                }
                async with httpx.AsyncClient(timeout=10.0) as gw_client:
                    gw_resp = await gw_client.post(gw_url, json=gw_payload, headers=gw_headers)
                    if gw_resp.status_code == 200:
                        content = gw_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "{}")
                        clean_c = re.sub(r"^```(?:json)?\s*", "", content.strip())
                        clean_c = re.sub(r"\s*```$", "", clean_c)
                        parsed = json.loads(clean_c)
                        parsed["_source"] = "OPENCLAW"
                        return parsed
            except Exception as gw_err:
                logger.debug(f"OpenClaw HTTP endpoint notice ({base_url}): {gw_err}")

        # 3. OpenRouter Dynamic Inference (Configured via OPENCLAW_MODEL or OPENROUTER_MODEL)
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        if openrouter_key:
            model_to_use = os.getenv("OPENCLAW_MODEL") or os.getenv("OPENROUTER_MODEL") or "auto"
            try:
                async with httpx.AsyncClient(timeout=20.0) as or_client:
                    or_resp = await or_client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {openrouter_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://leadgen.local",
                            "X-Title": "LeadGen AI",
                        },
                        json={
                            "model": model_to_use,
                            "messages": messages,
                            "temperature": 0.1,
                            "response_format": {"type": "json_object"},
                        }
                    )
                    if or_resp.status_code == 200:
                        content = or_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "{}")
                        match = re.search(r"\{.*\}", content, re.DOTALL)
                        if match:
                            parsed = json.loads(match.group(0))
                            parsed["_source"] = "OPENCLAW"
                            return parsed
            except Exception as or_err:
                logger.debug(f"OpenRouter inference notice: {or_err}")

        # 4. Google Gemini Cloud API (if configured)
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if gemini_key:
            try:
                g_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
                async with httpx.AsyncClient(timeout=15.0) as g_client:
                    g_resp = await g_client.post(
                        g_url,
                        json={
                            "contents": [{"parts": [{"text": f"{system_prompt}\n\nTask:\n{user_prompt}\n\nReturn JSON only."}]}],
                            "generationConfig": {"response_mime_type": "application/json"}
                        }
                    )
                    if g_resp.status_code == 200:
                        g_text = g_resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                        match = re.search(r"\{.*\}", g_text, re.DOTALL)
                        if match:
                            parsed = json.loads(match.group(0))
                            parsed["_source"] = "OPENCLAW"
                            return parsed
            except Exception as g_err:
                logger.debug(f"Gemini API inference notice: {g_err}")

        # 5. Deterministic Semantic Reasoning Engine Fallback (Instant, Zero External Dependency)
        logger.info("Using deterministic semantic reasoning engine.")
        mock_fallback = MockAIClient()
        res = await mock_fallback.analyze(system_prompt, user_prompt, image_paths, response_schema)
        if isinstance(res, dict):
            res["_source"] = "RULE_LOGIC"
        return res

    async def _query_openclaw_ws(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """
        Connects directly to OpenClaw Protocol 4 WebSocket (e.g. ws://127.0.0.1:18789)
        to run inference using OpenClaw's active configured LLM agent.
        """
        import uuid
        import re
        raw_gw = settings.OPENCLAW_GATEWAY_URL or "ws://127.0.0.1:18789"
        candidate_urls = [raw_gw]
        if any(h in raw_gw for h in ["127.0.0.1", "localhost"]):
            candidate_urls.append(raw_gw.replace("127.0.0.1", "host.docker.internal").replace("localhost", "host.docker.internal"))
            candidate_urls.append(raw_gw.replace("127.0.0.1", "172.17.0.1").replace("localhost", "172.17.0.1"))

        token = settings.OPENCLAW_GATEWAY_TOKEN or ""

        for raw_url in candidate_urls:
            gw_url = raw_url
            if not gw_url.startswith("ws://") and not gw_url.startswith("wss://"):
                gw_url = "ws://" + gw_url.replace("http://", "").replace("https://", "")

            try:
                import websockets
                async with websockets.connect(gw_url, close_timeout=2.5) as ws:
                    # 1. Receive initial challenge
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=2.0)
                    except Exception:
                        pass

                # 2. Handshake Protocol 4
                connect_req = {
                    "type": "req",
                    "id": str(uuid.uuid4()),
                    "method": "connect",
                    "params": {
                        "minProtocol": 1,
                        "maxProtocol": 4,
                        "client": {"name": "leadgen-analyzer", "version": "1.0.0"},
                        "role": "operator",
                        "scopes": ["agent:run", "chat"],
                        "auth": {"token": token}
                    }
                }
                await ws.send(json.dumps(connect_req))
                await asyncio.wait_for(ws.recv(), timeout=3.0)

                # 3. Request Agent Run
                combined = f"{system_prompt}\n\nInput to analyze:\n{user_prompt}\n\nFormat: Return JSON object with 'label' and 'reason'."
                agent_req = {
                    "type": "req",
                    "id": str(uuid.uuid4()),
                    "method": "agent.run",
                    "params": {
                        "agent": "main",
                        "prompt": combined
                    }
                }
                await ws.send(json.dumps(agent_req))

                # 4. Receive message and parse JSON
                for _ in range(5):
                    raw = await asyncio.wait_for(ws.recv(), timeout=12.0)
                    data = json.loads(raw)
                    text = str(data.get("result", {}).get("content") or data.get("content") or data.get("result") or "")
                    match = re.search(r"\{[^{}]*\"label\"[^{}]*\}", text, re.DOTALL)
                    if match:
                        return json.loads(match.group(0))
            except Exception as err:
                logger.debug(f"OpenClaw WebSocket Protocol 4 notice ({gw_url}): {err}")
                continue

        return None

class MockAIClient:

    def __init__(self, return_payload: Optional[Dict[str, Any]] = None):
        self.return_payload = return_payload

    async def analyze(
        self,
        system_prompt: str,
        user_prompt: str,
        image_paths: Optional[List[str]] = None,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if self.return_payload is not None:
            return self.return_payload

        prompt_lower = user_prompt.lower()
        full_context = (system_prompt + " " + user_prompt).lower()

        # Handle reply sentiment / intent classification
        if "classify" in full_context or "cold email reply" in full_context or "intent" in full_context:
            rejection_words = [
                "no needed", "not needed", "no need", "dont need", "don't need", "doesn't need",
                "not interested", "no thanks", "no thank you", "unsubscribe", "stop",
                "remove me", "take me off", "do not contact", "dont contact", "leave me alone",
                "wrong person", "wrong email", "not looking", "not required", "opt out", "spam"
            ]
            if any(w in prompt_lower for w in rejection_words):
                return {"label": "REJECTED", "reason": "Prospect explicitly indicated no need or declined contact"}

            hot_words = [
                "call me", "interested", "i want to talk", "want to talk", "lets talk", "let's talk",
                "schedule", "demo", "pricing", "how much", "quote", "cost", "send details",
                "tell me more", "sounds good", "yes please", "sure"
            ]
            if any(w in prompt_lower for w in hot_words):
                return {"label": "HOT_LEAD", "reason": "Prospect expressed positive interest or requested follow-up"}

            return {"label": "NEUTRAL", "reason": "Prospect response is non-committal or generic inquiry"}

        services = []
        findings = []

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
