import httpx
from typing import Optional, List, Dict, Any
from app.core.config import settings
from app.core.logging import logger

PREMADE_VOICES: List[Dict[str, Any]] = [
    {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",
        "name": "Rachel (Calm & Professional)",
        "category": "premade",
        "labels": {"accent": "American", "gender": "female", "use_case": "conversational"},
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3"
    },
    {
        "voice_id": "pNInz6obpgDQGcFmaJgB",
        "name": "Adam (Deep & Authoritative)",
        "category": "premade",
        "labels": {"accent": "American", "gender": "male", "use_case": "sales pitch"},
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/6734d75e-5fd8-452c-ab23-f343a42eb6a1.mp3"
    },
    {
        "voice_id": "ErXwobaYiN019PkySvjV",
        "name": "Antoni (Energetic & Consultative)",
        "category": "premade",
        "labels": {"accent": "American", "gender": "male", "use_case": "business"},
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/38d8f8f3-04b3-4f94-916c-e587f1eb7a08.mp3"
    },
    {
        "voice_id": "ThT5KcBeYPX3keUQqHPh",
        "name": "Dorothy (Pleasant & Warm)",
        "category": "premade",
        "labels": {"accent": "British", "gender": "female", "use_case": "customer support"},
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/ThT5KcBeYPX3keUQqHPh/d949ec30-17e9-447a-a4a5-9ff27d2c3dfb.mp3"
    },
    {
        "voice_id": "IKne3meq5aSn9XLyUdCD",
        "name": "Charlie (Conversational Male)",
        "category": "premade",
        "labels": {"accent": "Australian", "gender": "male", "use_case": "conversational"},
        "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/IKne3meq5aSn9XLyUdCD/102de6f2-22ed-41a0-a502-ae45d5f1dd3d.mp3"
    }
]

class ElevenLabsService:

    @classmethod
    def _get_api_key(cls, explicit_key: Optional[str] = None) -> Optional[str]:
        if explicit_key and explicit_key.strip():
            return explicit_key.strip()
        return settings.ELEVENLABS_API_KEY

    @classmethod
    async def list_voices(cls, explicit_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """List available voices from ElevenLabs API, or return curated premade voices."""
        key = cls._get_api_key(explicit_key)
        if not key:
            return PREMADE_VOICES

        url = "https://api.elevenlabs.io/v1/voices"
        headers = {"xi-api-key": key}

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    voices = data.get("voices", [])
                    return [
                        {
                            "voice_id": v.get("voice_id"),
                            "name": v.get("name"),
                            "category": v.get("category", "generated"),
                            "labels": v.get("labels", {}),
                            "preview_url": v.get("preview_url"),
                        }
                        for v in voices
                    ]
                else:
                    logger.warning(f"ElevenLabs list_voices HTTP {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            logger.debug(f"ElevenLabs list_voices notice: {e}")

        return PREMADE_VOICES

    @classmethod
    async def get_account_status(cls, explicit_key: Optional[str] = None) -> Dict[str, Any]:
        """Fetch live account details: subscription tier, credit usage, models, voices, and convai agents."""
        key = cls._get_api_key(explicit_key)
        if not key:
            return {
                "is_connected": False,
                "error": "No API Key provided",
                "subscription": None,
                "models": [],
                "voices": [],
                "agents": []
            }

        headers = {"xi-api-key": key}
        result = {
            "is_connected": True,
            "subscription": None,
            "models": [],
            "voices": [],
            "agents": []
        }

        async with httpx.AsyncClient(timeout=12.0) as client:
            # 1. Fetch Subscription Info
            try:
                sub_res = await client.get("https://api.elevenlabs.io/v1/user/subscription", headers=headers)
                if sub_res.status_code == 200:
                    sub_data = sub_res.json()
                    result["subscription"] = {
                        "tier": sub_data.get("tier", "free"),
                        "character_count": sub_data.get("character_count", 0),
                        "character_limit": sub_data.get("character_limit", 10000),
                        "can_extend_character_limit": sub_data.get("can_extend_character_limit", False),
                        "status": sub_data.get("status", "active"),
                        "next_character_count_reset_unix": sub_data.get("next_character_count_reset_unix"),
                    }
                elif sub_res.status_code == 401:
                    return {
                        "is_connected": False,
                        "error": "Invalid API Key. Please verify your ElevenLabs sk_... key.",
                        "subscription": None,
                        "models": [],
                        "voices": [],
                        "agents": []
                    }
            except Exception as e:
                logger.debug(f"Subscription fetch notice: {e}")

            # 2. Fetch Models
            try:
                models_res = await client.get("https://api.elevenlabs.io/v1/models", headers=headers)
                if models_res.status_code == 200:
                    models_data = models_res.json()
                    result["models"] = [
                        {
                            "model_id": m.get("model_id"),
                            "name": m.get("name"),
                            "description": m.get("description", ""),
                            "can_do_text_to_speech": m.get("can_do_text_to_speech", True),
                            "languages": [l.get("language_id") for l in m.get("languages", []) if isinstance(l, dict)],
                        }
                        for m in models_data
                        if m.get("can_do_text_to_speech", True)
                    ]
            except Exception as e:
                logger.debug(f"Models fetch notice: {e}")

            # 3. Fetch Voices
            try:
                voices_res = await client.get("https://api.elevenlabs.io/v1/voices", headers=headers)
                if voices_res.status_code == 200:
                    v_data = voices_res.json()
                    result["voices"] = [
                        {
                            "voice_id": v.get("voice_id"),
                            "name": v.get("name"),
                            "category": v.get("category", "premade"),
                            "preview_url": v.get("preview_url"),
                            "labels": v.get("labels", {}),
                        }
                        for v in v_data.get("voices", [])
                    ]
            except Exception as e:
                logger.debug(f"Voices fetch notice: {e}")

            # 4. Fetch Conversational AI Agents
            try:
                agents_res = await client.get("https://api.elevenlabs.io/v1/convai/agents", headers=headers)
                if agents_res.status_code == 200:
                    agents_data = agents_res.json()
                    raw_agents = agents_data.get("agents", []) if isinstance(agents_data, dict) else (agents_data if isinstance(agents_data, list) else [])
                    result["agents"] = [
                        {
                            "agent_id": a.get("agent_id"),
                            "name": a.get("name"),
                            "created_at_unix": a.get("created_at_unix"),
                        }
                        for a in raw_agents
                    ]
            except Exception as e:
                logger.debug(f"ConvAI Agents fetch notice: {e}")

        return result

    @classmethod
    async def clone_voice(
        cls,
        voice_name: str,
        audio_bytes: bytes,
        filename: str = "sample.mp3",
        explicit_key: Optional[str] = None,
        description: str = "Cloned user voice for autonomous sales calls"
    ) -> Dict[str, Any]:
        """Clone user's voice using ElevenLabs Instant Voice Cloning API."""
        key = cls._get_api_key(explicit_key)
        if not key:
            raise ValueError("ElevenLabs API Key is required to clone a voice. Please enter your ElevenLabs Key.")

        url = "https://api.elevenlabs.io/v1/voices/add"
        headers = {"xi-api-key": key}
        
        files = {
            "files": (filename, audio_bytes, "audio/mpeg")
        }
        data = {
            "name": voice_name,
            "description": description,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, data=data, files=files)
            if resp.status_code in [200, 201]:
                res_data = resp.json()
                voice_id = res_data.get("voice_id")
                logger.info(f"Successfully cloned voice '{voice_name}' (ID: {voice_id}) on ElevenLabs")
                return {"voice_id": voice_id, "name": voice_name}
            else:
                logger.error(f"ElevenLabs clone voice error {resp.status_code}: {resp.text}")
                raise RuntimeError(f"ElevenLabs Voice Cloning failed: {resp.text}")

    @classmethod
    async def synthesize_speech(
        cls,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        explicit_key: Optional[str] = None,
        model_id: str = "eleven_multilingual_v2"
    ) -> Optional[bytes]:
        """Synthesize high-fidelity multilingual speech using ElevenLabs."""
        key = cls._get_api_key(explicit_key)
        if not key:
            return None

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }
        payload = {
            "text": text,
            "model_id": model_id or "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.8,
                "style": 0.2,
                "use_speaker_boost": True
            }
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    return resp.content
                else:
                    logger.warning(f"ElevenLabs TTS HTTP {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            logger.error(f"ElevenLabs synthesis exception: {e}")

        return None

    @classmethod
    def build_agent_system_prompt(cls, kb: Any) -> str:
        """Compose the comprehensive master prompt with script steps and FAQ KB for ElevenLabs LLM."""
        company = getattr(kb, "company_name", "Our Company")
        persona = getattr(kb, "agent_persona_name", "Alex")
        service = getattr(kb, "service_name", "B2B Solutions")
        offer = getattr(kb, "core_offer", "100% Risk-Free 14-Day Pilot Implementation")
        system_base = getattr(kb, "system_prompt", "You are an elite, consultative B2B Sales Executive.")

        prompt_lines = [
            system_base,
            f"\n--- CONTEXT ---",
            f"Persona Name: {persona}",
            f"Representing: {company}",
            f"Service: {service}",
            f"Core Risk-Free Offer: {offer}",
            f"\n--- OBJECTIVE & RULES ---",
            f"1. You are speaking on an active live phone call with a business decision maker.",
            f"2. Keep EVERY turn concise and conversational (maximum 1-2 short sentences, under 18 words).",
            f"3. Never give long lectures. Speak warmly, respectfully, and listen attentively.",
            f"4. Multi-Signal Adaptive Language: Always listen to the caller's spoken language. If the caller speaks in Bengali, reply naturally in clean, polite Bengali. If in English, reply in English. If in Arabic, reply in Arabic.",
            f"5. Pivot smoothly to provide our Calendly booking link ({getattr(kb, 'calendly_url', '') or 'our calendar link'}) so the prospect can schedule their preferred time."
        ]

        # Append Dynamic Outbound Script Steps
        script_questions = getattr(kb, "script_questions_json", []) or []
        if script_questions:
            prompt_lines.append("\n--- OUTBOUND CALL SCRIPT STEPS ---")
            for sq in script_questions:
                if sq.get("active", True):
                    step_num = sq.get("step", 1)
                    purpose = sq.get("purpose", "Goal")
                    question = sq.get("question", "")
                    prompt_lines.append(f"Step {step_num} [{purpose}]: {question}")

        # Append FAQ Knowledge Base
        faq_kb = getattr(kb, "faq_kb_json", []) or []
        if faq_kb:
            prompt_lines.append("\n--- FREQUENT QUESTIONS & OBJECTION COUNTERS (KB) ---")
            for faq in faq_kb:
                if faq.get("active", True):
                    q = faq.get("question", "")
                    ans = faq.get("answer", "")
                    cat = faq.get("category", "General")
                    prompt_lines.append(f"[{cat}] Q: {q} -> A: {ans}")

        # Append Dynamic WhatsApp, Email and Wrap-up Confirmation Prompts (Zero Hardcoded Speech)
        whatsapp_q = getattr(kb, "whatsapp_prompt_question", None) or "এই নম্বরটাই কি আপনার হোয়াটসঅ্যাপ নম্বর নাকি অন্য কোনো নম্বরে লিংক পাঠাব?"
        email_q = getattr(kb, "email_prompt_question", None) or "আর আপনার অফিসিয়াল ইমেইল অ্যাড্রেসটা একটু বলবেন কি যাতে গুগল ক্যালেন্ডার ইনভাইট পাঠিয়ে দিতে পারি?"
        confirm_speech = getattr(kb, "meeting_confirmation_speech", None) or "পারফেক্ট! আমি এখনই আপনার হোয়াটসঅ্যাপ ও ইমেইলে গুগল মিট লিংক পাঠিয়ে দিয়েছি। কাল কথা হচ্ছে, ভালো থাকবেন!"

        prompt_lines.append("\n--- MEETING CONFIRMATION & CONTACT COLLECTION RULES ---")
        prompt_lines.append(f"1. When meeting slot is agreed, ask for WhatsApp: '{whatsapp_q}'")
        prompt_lines.append(f"2. Next, ask for their email address: '{email_q}'")
        prompt_lines.append(f"3. Conclude call warmly with: '{confirm_speech}'")

        return "\n".join(prompt_lines)

    @classmethod
    async def create_or_sync_conversational_agent(
        cls,
        kb: Any,
        explicit_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create or update an ElevenLabs Conversational AI Agent using ElevenLabs Cloud API."""
        key = cls._get_api_key(explicit_key)
        if not key:
            raise ValueError("ElevenLabs API Key is required to create or sync an Agent.")

        agent_prompt = cls.build_agent_system_prompt(kb)
        agent_id = getattr(kb, "elevenlabs_agent_id", None)
        voice_id = getattr(kb, "elevenlabs_voice_id", "21m00Tcm4TlvDq8ikWAM")
        llm_model = getattr(kb, "elevenlabs_llm", "gemini-1.5-flash") or "gemini-1.5-flash"
        first_msg = getattr(kb, "first_message", "Hello! I am calling regarding your business growth.")

        # ElevenLabs ConvAI requires eleven_turbo_v2 or eleven_flash_v2 for real-time conversational streaming
        raw_model = getattr(kb, "elevenlabs_model_id", None)
        convai_model_id = "eleven_turbo_v2" if (not raw_model or raw_model in ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_turbo_v2", ""]) else raw_model

        # Voice audio settings from Admin sliders
        stability = float(getattr(kb, "voice_stability", 0.5) or 0.5)
        similarity = float(getattr(kb, "voice_similarity", 0.75) or 0.75)

        conversation_config = {
            "agent": {
                "prompt": {
                    "prompt": agent_prompt,
                    "llm": llm_model,
                    "temperature": 0.5,
                    "max_tokens": 150
                },
                "first_message": first_msg,
                "language": "en"
            },
            "tts": {
                "voice_id": voice_id,
                "model_id": convai_model_id,
                "stability": stability,
                "similarity_boost": similarity
            }
        }

        headers = {
            "xi-api-key": key,
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            if agent_id and agent_id.strip():
                # Update existing agent
                url = f"https://api.elevenlabs.io/v1/convai/agents/{agent_id.strip()}"
                payload = {
                    "name": f"{getattr(kb, 'company_name', 'LeadGen')} Voice Agent",
                    "conversation_config": conversation_config
                }
                resp = await client.patch(url, headers=headers, json=payload)
                if resp.status_code in [200, 201]:
                    logger.info(f"Updated ElevenLabs Agent {agent_id}")
                    return {"agent_id": agent_id, "status": "updated", "llm": llm_model}
                else:
                    logger.warning(f"ElevenLabs Agent patch failed {resp.status_code}: {resp.text}, will try creating new")

            # Create new agent
            create_url = "https://api.elevenlabs.io/v1/convai/agents/create"
            payload = {
                "name": f"{getattr(kb, 'company_name', 'LeadGen')} Sales Agent",
                "conversation_config": conversation_config
            }
            resp = await client.post(create_url, headers=headers, json=payload)
            if resp.status_code in [200, 201]:
                data = resp.json()
                new_agent_id = data.get("agent_id")
                logger.info(f"Successfully created new ElevenLabs Agent ID: {new_agent_id}")
                return {"agent_id": new_agent_id, "status": "created", "llm": llm_model}
            else:
                logger.error(f"ElevenLabs create agent error {resp.status_code}: {resp.text}")
                raise RuntimeError(f"ElevenLabs Agent deployment failed: {resp.text[:200]}")

    @classmethod
    async def get_signed_conversation_url(
        cls,
        agent_id: str,
        explicit_key: Optional[str] = None
    ) -> Optional[str]:
        """Fetch secure signed WebSocket URL for ElevenLabs Conversational AI browser connection."""
        key = cls._get_api_key(explicit_key)
        if not key or not agent_id:
            return None

        url = f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id={agent_id.strip()}"
        headers = {"xi-api-key": key}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("signed_url")
                else:
                    logger.warning(f"ElevenLabs get_signed_url HTTP {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            logger.error(f"ElevenLabs get_signed_url exception: {e}")

        return None

    @classmethod
    async def delete_conversational_agent(
        cls,
        agent_id: str,
        explicit_key: Optional[str] = None
    ) -> bool:
        """Delete an agent from ElevenLabs Conversational AI account."""
        key = cls._get_api_key(explicit_key)
        if not key:
            raise ValueError("ElevenLabs API Key is required to delete an Agent.")

        headers = {"xi-api-key": key}

        async with httpx.AsyncClient(timeout=20.0) as client:
            url = f"https://api.elevenlabs.io/v1/convai/agents/{agent_id.strip()}"
            resp = await client.delete(url, headers=headers)
            if resp.status_code in [200, 204]:
                logger.info(f"Successfully deleted ElevenLabs Agent ID: {agent_id}")
                return True
            elif resp.status_code == 404:
                return True
            else:
                logger.error(f"ElevenLabs delete agent error {resp.status_code}: {resp.text}")
                raise RuntimeError(f"ElevenLabs returned {resp.status_code}: {resp.text[:200]}")


