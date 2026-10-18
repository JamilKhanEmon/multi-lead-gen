import asyncio
import base64
import hashlib
import json
import os
import re
import time
from typing import Dict, Any, List, Optional, Tuple
import httpx
from app.core.config import settings
from app.core.logging import logger

class AIClientError(Exception):
    pass

# Global in-memory cache: hash(prompt+model) -> (timestamp, result_dict)
_AI_RESPONSE_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour

# Global active runtime settings cache
_RUNTIME_AI_SETTINGS: Optional[Dict[str, Any]] = None
_RUNTIME_SETTINGS_LAST_LOADED: float = 0.0


async def get_active_ai_settings(force_reload: bool = False) -> Dict[str, Any]:
    """
    Returns active AI provider and model settings from DB, falling back to .env.
    Cached for 30s in-memory for zero database overhead.
    """
    global _RUNTIME_AI_SETTINGS, _RUNTIME_SETTINGS_LAST_LOADED
    now = time.time()
    if not force_reload and _RUNTIME_AI_SETTINGS and (now - _RUNTIME_SETTINGS_LAST_LOADED < 30.0):
        return _RUNTIME_AI_SETTINGS

    try:
        from app.db.session import AsyncSessionLocal
        from app.models.ai_settings import AISettings
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            stmt = select(AISettings).where(AISettings.is_active == True).order_by(AISettings.created_at.desc()).limit(1)
            res = await session.execute(stmt)
            obj = res.scalar_one_or_none()
            if obj:
                settings_map = {
                    "primary_provider": obj.primary_provider or "groq",
                    "primary_model": obj.primary_model or "qwen/qwen3.8-27b",
                    "enable_fallback": obj.enable_fallback,
                    "fallback_provider": obj.fallback_provider or "openrouter",
                    "fallback_model": obj.fallback_model or "meta-llama/llama-3.3-70b-instruct:free",
                    "groq_api_key": obj.groq_api_key or settings.GROQ_API_KEY,
                    "openrouter_api_key": obj.openrouter_api_key or os.getenv("OPENROUTER_API_KEY"),
                    "openai_api_key": obj.openai_api_key or settings.OPENAI_API_KEY,
                    "custom_api_key": obj.custom_api_key,
                    "custom_base_url": obj.custom_base_url,
                    "max_tokens": obj.max_tokens or settings.LLM_MAX_TOKENS,
                    "temperature": obj.temperature if obj.temperature is not None else settings.LLM_TEMPERATURE,
                }
                _RUNTIME_AI_SETTINGS = settings_map
                _RUNTIME_SETTINGS_LAST_LOADED = now
                return settings_map
    except Exception as e:
        logger.debug(f"AIClient: Database settings fetch note: {e}")

    # Fallback to .env defaults
    env_map = {
        "primary_provider": settings.LLM_PROVIDER or "groq",
        "primary_model": settings.LLM_MODEL or "qwen/qwen3.8-27b",
        "enable_fallback": True,
        "fallback_provider": "openrouter",
        "fallback_model": "meta-llama/llama-3.3-70b-instruct:free",
        "groq_api_key": settings.GROQ_API_KEY,
        "openrouter_api_key": os.getenv("OPENROUTER_API_KEY"),
        "openai_api_key": settings.OPENAI_API_KEY,
        "custom_api_key": None,
        "custom_base_url": None,
        "max_tokens": settings.LLM_MAX_TOKENS,
        "temperature": settings.LLM_TEMPERATURE,
    }
    _RUNTIME_AI_SETTINGS = env_map
    _RUNTIME_SETTINGS_LAST_LOADED = now
    return env_map


def set_runtime_ai_settings(settings_map: Dict[str, Any]):
    """Instantly updates active runtime AI configuration across the entire process."""
    global _RUNTIME_AI_SETTINGS, _RUNTIME_SETTINGS_LAST_LOADED
    _RUNTIME_AI_SETTINGS = settings_map
    _RUNTIME_SETTINGS_LAST_LOADED = time.time()


class AIClient:
    """
    Token-Optimized Autonomous AI Inference Client.
    Features:
      1. Dynamic Admin UI configuration (Groq, OpenRouter, OpenAI, Custom)
      2. Automated Fallback Failover (e.g. Groq -> OpenRouter -> Rule Logic)
      3. Zero-Token In-Memory Cache (1 hour TTL)
      4. Deterministic Semantic Reasoning Engine (Fail-safe offline fallback)
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url or settings.LLM_BASE_URL or ""
        self.model = model
        self.timeout = timeout

    async def analyze(
        self,
        system_prompt: str,
        user_prompt: str,
        image_paths: Optional[List[str]] = None,
        response_schema: Optional[Dict[str, Any]] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Executes strict token-minimized inference with automated fallback.
        """
        clean_user_prompt = user_prompt.strip()
        if len(clean_user_prompt) > 1500:
            clean_user_prompt = clean_user_prompt[:1500] + "\n[Context condensed to conserve tokens]"

        # ── 1. Fetch Dynamic Runtime Configuration ────────────────────────────
        ai_cfg = await get_active_ai_settings()
        primary_provider = (ai_cfg.get("primary_provider") or "groq").lower().strip()
        primary_model = self.model or ai_cfg.get("primary_model") or "qwen/qwen3.8-27b"
        enable_fallback = ai_cfg.get("enable_fallback", True)
        fallback_provider = (ai_cfg.get("fallback_provider") or "openrouter").lower().strip()
        fallback_model = ai_cfg.get("fallback_model") or "meta-llama/llama-3.3-70b-instruct:free"

        if max_tokens is None:
            configured_max = int(ai_cfg.get("max_tokens") or settings.LLM_MAX_TOKENS or 800)
            max_tokens = max(200, min(configured_max, 1500))
        else:
            max_tokens = max(100, min(max_tokens, 2048))
        temp = ai_cfg.get("temperature", 0.0)

        # ── 2. In-Memory Zero-Token Cache Check ──────────────────────────────
        cache_key = hashlib.sha256(
            f"{system_prompt.strip()}::{clean_user_prompt}::{primary_model}".encode()
        ).hexdigest()

        now = time.time()
        if cache_key in _AI_RESPONSE_CACHE:
            ts, cached_payload = _AI_RESPONSE_CACHE[cache_key]
            if now - ts < CACHE_TTL_SECONDS:
                logger.debug(f"AIClient: Cache HIT (0 tokens consumed, key={cache_key[:8]})")
                ret = dict(cached_payload)
                ret["_source"] = "CACHE"
                return ret

        messages = [
            {"role": "system", "content": system_prompt.strip()},
        ]
        user_message: Dict[str, Any] = {"role": "user", "content": clean_user_prompt}

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

        # ── 3. Primary Provider Invocation ────────────────────────────────────
        res = await self._dispatch_provider(
            provider=primary_provider,
            model=primary_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temp,
            ai_cfg=ai_cfg,
        )
        if res:
            _AI_RESPONSE_CACHE[cache_key] = (now, res)
            return res

        # ── 4. Automated Fallback Failover ─────────────────────────────────────
        if enable_fallback and fallback_provider and fallback_provider != primary_provider:
            logger.warning(
                f"AIClient: Primary provider [{primary_provider.upper()}:{primary_model}] failed or throttled. "
                f"Engaging automatic fallback failover to [{fallback_provider.upper()}:{fallback_model}]..."
            )
            fallback_res = await self._dispatch_provider(
                provider=fallback_provider,
                model=fallback_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temp,
                ai_cfg=ai_cfg,
            )
            if fallback_res:
                _AI_RESPONSE_CACHE[cache_key] = (now, fallback_res)
                logger.info(f"AIClient: Fallback failover to [{fallback_provider.upper()}:{fallback_model}] succeeded!")
                return fallback_res

        # ── 5. OpenClaw Protocol 4 WebSocket Gateway ──────────────────────────
        ws_res = await self._query_openclaw_ws(system_prompt, clean_user_prompt)
        if ws_res:
            if isinstance(ws_res, dict):
                ws_res["_source"] = "OPENCLAW"
                _AI_RESPONSE_CACHE[cache_key] = (now, ws_res)
            return ws_res

        # ── 6. Deterministic Rule Logic (Zero Crash) ──────────────────────────
        logger.info("AIClient: No external LLM answered, using deterministic semantic reasoning fallback.")
        mock_fallback = MockAIClient()
        res = await mock_fallback.analyze(system_prompt, clean_user_prompt, image_paths, response_schema)
        if isinstance(res, dict):
            res["_source"] = "RULE_LOGIC"
        return res

    async def _dispatch_provider(
        self,
        provider: str,
        model: str,
        messages: List[Dict[str, Any]],
        max_tokens: int,
        temperature: float,
        ai_cfg: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Dispatches an inference call to the specified provider."""
        provider = provider.lower().strip()

        if provider == "groq":
            key = ai_cfg.get("groq_api_key") or settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY")
            if not key:
                logger.warning("AIClient: Groq API key is missing.")
                return None
            groq_model = model.replace("meta-llama/", "") if model.startswith("meta-llama/") else model
            res = await self._call_openai_compatible(
                endpoint="https://api.groq.com/openai/v1/chat/completions",
                api_key=key,
                model=groq_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                provider_name="GROQ",
            )
            if not res and groq_model != "qwen/qwen3.8-27b":
                logger.info("AIClient: Auto-retrying Groq with verified fast model qwen/qwen3.8-27b...")
                res = await self._call_openai_compatible(
                    endpoint="https://api.groq.com/openai/v1/chat/completions",
                    api_key=key,
                    model="qwen/qwen3.8-27b",
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    provider_name="GROQ",
                )
            return res

        elif provider == "openrouter":
            key = ai_cfg.get("openrouter_api_key") or os.getenv("OPENROUTER_API_KEY")
            if not key:
                logger.warning("AIClient: OpenRouter API key is missing.")
                return None
            return await self._call_openai_compatible(
                endpoint="https://openrouter.ai/api/v1/chat/completions",
                api_key=key,
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                provider_name="OPENROUTER",
                extra_headers={
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "LeadGen Autonomous Platform",
                },
            )

        elif provider == "openai":
            key = ai_cfg.get("openai_api_key") or settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
            if not key:
                logger.warning("AIClient: OpenAI API key is missing.")
                return None
            return await self._call_openai_compatible(
                endpoint="https://api.openai.com/v1/chat/completions",
                api_key=key,
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                provider_name="OPENAI",
            )

        elif provider == "custom":
            base = (ai_cfg.get("custom_base_url") or self.base_url or "http://localhost:11434").rstrip("/")
            endpoint = f"{base}/v1/chat/completions"
            key = ai_cfg.get("custom_api_key") or "custom-key"
            return await self._call_openai_compatible(
                endpoint=endpoint,
                api_key=key,
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                provider_name="CUSTOM_LLM",
            )

        return None

    async def _call_openai_compatible(
        self,
        endpoint: str,
        api_key: str,
        model: str,
        messages: List[Dict[str, Any]],
        max_tokens: int,
        temperature: float,
        provider_name: str,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Executes standard OpenAI-compatible completions call with token usage logging.
        """
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                
                # If provider errors on strict response_format json_object, retry once without it
                if resp.status_code == 400 and "response_format" in resp.text:
                    payload.pop("response_format", None)
                    resp = await client.post(endpoint, json=payload, headers=headers)

                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                    clean_c = re.sub(r"^```(?:json)?\s*", "", content.strip())
                    try:
                        parsed = json.loads(clean_c)
                    except Exception:
                        m = re.search(r'\{.*\}', content, re.DOTALL)
                        if m:
                            try:
                                parsed = json.loads(m.group(0))
                            except Exception:
                                parsed = {"content": content}
                        else:
                            parsed = {"content": content}

                    usage = data.get("usage", {})
                    total_toks = usage.get("total_tokens", "N/A")
                    in_toks = usage.get("prompt_tokens", "N/A")
                    out_toks = usage.get("completion_tokens", "N/A")
                    elapsed_ms = round((time.time() - t0) * 1000, 1)

                    logger.info(
                        f"AIClient [{provider_name}:{model}] Success in {elapsed_ms}ms | "
                        f"Tokens used: {total_toks} (in: {in_toks}, out: {out_toks})"
                    )

                    parsed["_source"] = provider_name
                    parsed["_tokens_used"] = total_toks
                    parsed["_model"] = model

                    # Asynchronously record exact token usage and billing metrics in background
                    try:
                        if isinstance(total_toks, (int, float)) and total_toks > 0:
                            asyncio.create_task(self.record_token_usage(
                                provider=provider_name,
                                model=model,
                                prompt_tokens=int(in_toks) if isinstance(in_toks, (int, float)) else 0,
                                completion_tokens=int(out_toks) if isinstance(out_toks, (int, float)) else 0,
                                total_tokens=int(total_toks),
                            ))
                    except Exception as te:
                        logger.warning(f"AIClient: token usage recording background task warning: {te}")

                    return parsed
                else:
                    logger.warning(
                        f"AIClient [{provider_name}] returned HTTP {resp.status_code}: {resp.text[:300]}"
                    )
        except Exception as e:
            logger.warning(f"AIClient [{provider_name}] connection failed: {e}")

        return None

    @classmethod
    async def record_token_usage(
        cls,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
    ):
        """Persists exact official token usage and calculates cost from provider billable counters."""
        try:
            from app.db.session import AsyncSessionLocal
            from app.models.ai_settings import AISettings
            from sqlalchemy import select
            import datetime

            is_free = True
            cost_usd = 0.0

            p_lower = (provider or "").lower()
            m_lower = (model or "").lower()

            if p_lower == "openai":
                is_free = False
                if "gpt-4o-mini" in m_lower:
                    cost_usd = (prompt_tokens * 0.00000015) + (completion_tokens * 0.00000060)
                elif "gpt-4o" in m_lower:
                    cost_usd = (prompt_tokens * 0.0000025) + (completion_tokens * 0.00001)
                else:
                    cost_usd = (prompt_tokens * 0.00000015) + (completion_tokens * 0.00000060)
            elif p_lower == "openrouter":
                if ":free" in m_lower:
                    is_free = True
                    cost_usd = 0.0
                else:
                    is_free = False
                    cost_usd = (total_tokens * 0.0000005)
            else:
                # Groq free tier, ollama, local
                is_free = True
                cost_usd = 0.0

            async with AsyncSessionLocal() as session:
                stmt = select(AISettings).where(AISettings.is_active == True).order_by(AISettings.created_at.desc()).limit(1)
                res = await session.execute(stmt)
                cfg = res.scalar_one_or_none()
                if not cfg:
                    return

                stats = dict(cfg.usage_stats_json or {})
                stats["total_calls"] = stats.get("total_calls", 0) + 1
                stats["total_tokens"] = stats.get("total_tokens", 0) + total_tokens
                stats["prompt_tokens"] = stats.get("prompt_tokens", 0) + prompt_tokens
                stats["completion_tokens"] = stats.get("completion_tokens", 0) + completion_tokens
                stats["total_cost_usd"] = round(stats.get("total_cost_usd", 0.0) + cost_usd, 6)
                stats["last_call_at"] = datetime.datetime.utcnow().isoformat()

                by_model = dict(stats.get("by_model", {}))
                model_key = f"{provider}:{model}"
                m_stat = dict(by_model.get(model_key, {}))
                m_stat["provider"] = provider
                m_stat["model"] = model
                m_stat["is_free"] = is_free
                m_stat["tier_label"] = "Free Tier" if is_free else "Paid Tier"
                m_stat["calls"] = m_stat.get("calls", 0) + 1
                m_stat["prompt_tokens"] = m_stat.get("prompt_tokens", 0) + prompt_tokens
                m_stat["completion_tokens"] = m_stat.get("completion_tokens", 0) + completion_tokens
                m_stat["total_tokens"] = m_stat.get("total_tokens", 0) + total_tokens
                m_stat["cost_usd"] = round(m_stat.get("cost_usd", 0.0) + cost_usd, 6)
                m_stat["last_used_at"] = datetime.datetime.utcnow().isoformat()
                by_model[model_key] = m_stat
                stats["by_model"] = by_model

                from sqlalchemy.orm.attributes import flag_modified
                cfg.usage_stats_json = stats
                flag_modified(cfg, "usage_stats_json")
                session.add(cfg)
                await session.commit()
                logger.info(f"AIClient: Recorded {total_tokens} tokens for [{provider}:{model}]. Total tokens: {stats.get('total_tokens')}")
        except Exception as e:
            logger.warning(f"Failed to record AI token usage: {e}")

    @classmethod
    async def test_provider_connection(
        cls,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        custom_base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Tests a provider and model configuration live.
        Returns latency and verified status.
        """
        test_messages = [
            {"role": "system", "content": "You are an automated API diagnostic agent. Respond strictly in raw JSON."},
            {"role": "user", "content": 'Respond strictly with this exact JSON: {"status": "ok", "ping": "pong"}'},
        ]
        provider_clean = provider.lower().strip()
        endpoint = ""
        key = api_key or ""
        extra_headers: Dict[str, str] = {}

        if provider_clean == "groq":
            endpoint = "https://api.groq.com/openai/v1/chat/completions"
            key = key or settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY") or ""
            model = model.replace("meta-llama/", "") if model.startswith("meta-llama/") else model
        elif provider_clean == "openrouter":
            endpoint = "https://openrouter.ai/api/v1/chat/completions"
            key = key or os.getenv("OPENROUTER_API_KEY") or ""
            extra_headers = {
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "LeadGen Diagnostic",
            }
        elif provider_clean == "openai":
            endpoint = "https://api.openai.com/v1/chat/completions"
            key = key or settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY") or ""
        elif provider_clean == "custom":
            base = (custom_base_url or "http://localhost:11434").rstrip("/")
            endpoint = f"{base}/v1/chat/completions"
            key = key or "custom-key"

        if not key and provider_clean != "custom":
            return {
                "success": False,
                "latency_ms": 0.0,
                "provider": provider,
                "model": model,
                "message": f"API key for {provider.upper()} is missing.",
            }

        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        headers.update(extra_headers)

        payload: Dict[str, Any] = {
            "model": model.strip(),
            "messages": test_messages,
            "max_tokens": 60,
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        }

        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 400 and "response_format" in resp.text:
                    payload.pop("response_format", None)
                    resp = await client.post(endpoint, json=payload, headers=headers)

                elapsed_ms = round((time.time() - t0) * 1000, 1)

                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                    clean_c = re.sub(r"^```(?:json)?\s*", "", content.strip())
                    clean_c = re.sub(r"\s*```$", "", clean_c)
                    try:
                        sample = json.loads(clean_c)
                    except Exception:
                        sample = {"raw_response": content}
                    return {
                        "success": True,
                        "latency_ms": elapsed_ms,
                        "provider": provider,
                        "model": model,
                        "message": f"Connected successfully in {elapsed_ms}ms! (Status 200 OK)",
                        "response_sample": sample,
                    }
                else:
                    return {
                        "success": False,
                        "latency_ms": elapsed_ms,
                        "provider": provider,
                        "model": model,
                        "message": f"Provider returned HTTP {resp.status_code}: {resp.text[:300]}",
                    }
        except Exception as e:
            elapsed_ms = round((time.time() - t0) * 1000, 1)
            return {
                "success": False,
                "latency_ms": elapsed_ms,
                "provider": provider,
                "model": model,
                "message": f"Connection failed: {str(e)}",
            }

    async def _query_openclaw_ws(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """
        Connects directly to OpenClaw Protocol 4 WebSocket gateway.
        """
        import uuid
        import asyncio
        raw_gw = settings.OPENCLAW_GATEWAY_URL or "ws://127.0.0.1:18789"
        candidate_urls = [raw_gw]
        if any(h in raw_gw for h in ["127.0.0.1", "localhost"]):
            candidate_urls.append(raw_gw.replace("127.0.0.1", "host.docker.internal").replace("localhost", "host.docker.internal"))

        for ws_url in candidate_urls:
            try:
                import websockets
                async with websockets.connect(
                    ws_url,
                    additional_headers={"Authorization": f"Bearer {settings.OPENCLAW_GATEWAY_TOKEN or ''}"},
                    close_timeout=5,
                ) as ws:
                    init_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
                    if init_msg.get("type") != "connect":
                        continue

                    req_id = str(uuid.uuid4())
                    await ws.send(json.dumps({
                        "type": "request",
                        "id": req_id,
                        "method": "llm.chat",
                        "params": {
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                            "temperature": 0.0,
                            "response_format": "json",
                        }
                    }))

                    while True:
                        resp_raw = await asyncio.wait_for(ws.recv(), timeout=12.0)
                        resp = json.loads(resp_raw)
                        if resp.get("type") == "response" and resp.get("id") == req_id:
                            result_data = resp.get("result", {})
                            content = result_data.get("content", "{}")
                            clean_c = re.sub(r"^```(?:json)?\s*", "", content.strip())
                            clean_c = re.sub(r"\s*```$", "", clean_c)
                            return json.loads(clean_c)
            except Exception:
                continue

        return None


class MockAIClient:
    """
    Deterministic Offline Fallback Semantic Reasoning Engine.
    Used when no external LLM API key is present or during offline testing.
    """

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

        # Handle geo sub-area decomposition request
        if "sub_areas" in full_context or "sub-areas" in full_context or "sub-districts" in full_context:
            loc_match = re.search(r"in\s+['\"]([^'\"]+)['\"]", user_prompt)
            if not loc_match:
                loc_match = re.search(r"['\"]([^'\"]+)['\"]", user_prompt)
            target = loc_match.group(1).strip() if loc_match else "Commercial District"
            return {
                "sub_areas": [
                    f"{target} Sadar / Central",
                    f"{target} North Commercial Zone",
                    f"{target} South Commercial Zone",
                    f"{target} East Commercial Zone",
                    f"{target} West Commercial Zone",
                    f"{target} Main Market Area",
                    f"{target} Business District",
                    f"{target} Industrial Belt",
                ]
            }


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

        # Handle cold email generation request
        if "email step" in full_context or "cold email" in full_context:
            co_m = re.search(r"target company:\s*([^\n]+)", user_prompt, re.IGNORECASE)
            rec_m = re.search(r"recipient:\s*([^\n]+)", user_prompt, re.IGNORECASE)
            sol_m = re.search(r"matched solution:\s*([^\n]+)", user_prompt, re.IGNORECASE)
            gap_m = re.search(r"identified gap:\s*([^\n]+)", user_prompt, re.IGNORECASE)

            c_name = co_m.group(1).strip() if co_m else "your team"
            r_name = rec_m.group(1).strip() if rec_m else f"Team {c_name}"
            s_name = sol_m.group(1).strip() if sol_m else "our specialized enterprise software"
            g_name = gap_m.group(1).strip() if gap_m else "streamlining client inquiries"

            return {
                "subject": f"Modernizing inquiry capture for {c_name}",
                "body": f"Hi {r_name},\n\nI was reviewing {c_name}'s online client channels and noticed: {g_name}.\n\nOur {s_name} automates this workflow directly, eliminating response delays and converting prospective clients instantly.\n\nWould you be open to a 5-minute interactive walkthrough sometime this week?"
            }

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
