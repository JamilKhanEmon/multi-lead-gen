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
