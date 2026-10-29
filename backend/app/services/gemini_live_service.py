import asyncio
import base64
import json
import uuid
import struct
from typing import Dict, Any, List, Optional, Callable, AsyncIterator
import httpx
import websockets

from app.core.config import settings
from app.core.logging import logger

GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
DEFAULT_GEMINI_LIVE_MODEL = "models/gemini-2.0-flash"

AVAILABLE_GEMINI_VOICES = [
    {"id": "Aoede", "name": "Aoede (Warm, Friendly Female)", "gender": "Female", "description": "Highly engaging, consultative B2B specialist"},
    {"id": "Puck", "name": "Puck (Energetic, Natural Male)", "gender": "Male", "description": "Dynamic, charismatic executive style"},
    {"id": "Charon", "name": "Charon (Authoritative, Deep Male)", "gender": "Male", "description": "Professional enterprise strategist"},
    {"id": "Fenrir", "name": "Fenrir (Crisp, Confident Male)", "gender": "Male", "description": "Direct, business-focused closer"},
    {"id": "Kore", "name": "Kore (Calm, Sophisticated Female)", "gender": "Female", "description": "Smooth, professional enterprise advisor"},
]

# Standard mu-law to linear PCM-16 decoding table (pure Python fallback, zero C dependency)
_MULAW_TO_LINEAR_TABLE = []
for i in range(256):
    u = ~i & 0xFF
    sign = -1 if (u & 0x80) else 1
    exponent = (u >> 4) & 0x07
    mantissa = u & 0x0F
    sample = sign * ((mantissa << 3) + 0x84) << exponent
    sample = max(-32768, min(32767, sample - (0x84 * sign)))
    _MULAW_TO_LINEAR_TABLE.append(sample)

# Linear PCM-16 to mu-law encoding table
_LINEAR_TO_MULAW_TABLE = bytearray(65536)
for val in range(-32768, 32768):
    sign = 0x80 if val < 0 else 0x00
    mag = abs(val)
    mag = min(mag, 32767)
    mag += 0x84
    if mag > 32767:
        mag = 32767
    exponent = 7
    for exp in range(8):
        if mag <= (0x84 << exp) + (0x78 << exp):
            exponent = exp
            break
    mantissa = (mag >> (exponent + 3)) & 0x0F
    ulaw_byte = ~(sign | (exponent << 4) | mantissa) & 0xFF
    _LINEAR_TO_MULAW_TABLE[val + 32768] = ulaw_byte


def decode_mulaw_to_pcm16(mulaw_bytes: bytes) -> bytes:
    """Decode 8kHz mu-law audio bytes from Twilio into linear 16-bit PCM (8kHz)."""
    samples = [_MULAW_TO_LINEAR_TABLE[b] for b in mulaw_bytes]
    return struct.pack(f"<{len(samples)}h", *samples)


def resample_8k_to_16k(pcm_8k_bytes: bytes) -> bytes:
    """Upsample 8kHz 16-bit mono PCM to 16kHz by linear interpolation."""
    num_samples = len(pcm_8k_bytes) // 2
    if num_samples == 0:
        return b""
    samples = struct.unpack(f"<{num_samples}h", pcm_8k_bytes)
    out = []
    for i in range(num_samples):
        s1 = samples[i]
        s2 = samples[i + 1] if i + 1 < num_samples else s1
        out.append(s1)
        out.append((s1 + s2) // 2)
    return struct.pack(f"<{len(out)}h", *out)


def downsample_24k_to_8k(pcm_24k_bytes: bytes) -> bytes:
    """Downsample 24kHz 16-bit mono PCM from Gemini to 8kHz by 3:1 decimation."""
    num_samples = len(pcm_24k_bytes) // 2
    if num_samples == 0:
        return b""
    samples = struct.unpack(f"<{num_samples}h", pcm_24k_bytes)
    # Take every 3rd sample
    decimated = samples[::3]
    return struct.pack(f"<{len(decimated)}h", *decimated)


def encode_pcm16_to_mulaw(pcm_8k_bytes: bytes) -> bytes:
    """Encode 8kHz 16-bit linear PCM into 8kHz mu-law bytes for Twilio."""
    num_samples = len(pcm_8k_bytes) // 2
    if num_samples == 0:
        return b""
    samples = struct.unpack(f"<{num_samples}h", pcm_8k_bytes)
    return bytes(_LINEAR_TO_MULAW_TABLE[s + 32768] for s in samples)


class TwilioService:
    """Async Twilio REST client using httpx (Zero heavy SDK dependencies)."""

    @classmethod
    async def make_outbound_call(
        cls,
        account_sid: str,
        auth_token: str,
        from_phone: str,
        to_phone: str,
        twiml_webhook_url: str,
    ) -> Dict[str, Any]:
        """Trigger an outbound call using Twilio REST API."""
        if not account_sid or not auth_token:
            return {"success": False, "error": "Twilio Account SID or Auth Token missing"}
        if not from_phone or not to_phone:
            return {"success": False, "error": "Twilio From or To phone number missing"}

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid.strip()}/Calls.json"
        auth = (account_sid.strip(), auth_token.strip())
        data = {
            "To": to_phone.strip(),
            "From": from_phone.strip(),
            "Url": twiml_webhook_url.strip(),
            "Method": "POST",
            "Record": "false",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, data=data, auth=auth)
                payload = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

                if res.status_code in (200, 201):
                    call_sid = payload.get("sid")
                    logger.info(f"[Twilio] Outbound call placed to {to_phone}. CallSid: {call_sid}")
                    return {"success": True, "call_sid": call_sid, "status": payload.get("status")}
                else:
                    err_msg = payload.get("message") or res.text
                    logger.warning(f"[Twilio] Call dispatch failed ({res.status_code}): {err_msg}")
                    return {"success": False, "error": err_msg, "status_code": res.status_code}
        except Exception as e:
            logger.error(f"[Twilio] Exception while making outbound call: {e}")
            return {"success": False, "error": str(e)}


class GeminiLiveSession:
    """
    Manages a real-time, low-latency bidirectional audio WebSocket connection
    between Twilio and Google Gemini 2.0 Flash Live API.
    """

    def __init__(
        self,
        api_key: str,
        system_prompt: str,
        voice_name: str = "Charon",
        model: Optional[str] = None,
    ):
        self.api_key = api_key.strip()
        self.system_prompt = system_prompt.strip()
        self.voice_name = voice_name.strip() if voice_name else "Charon"
        
        # Clean and auto-migrate deprecated model names to the active multimodal live model
        target_model = (model or "").strip()
        if not target_model or "2.5" in target_model or "native-audio" in target_model or "exp" in target_model:
            self.model = DEFAULT_GEMINI_LIVE_MODEL
        elif not target_model.startswith("models/"):
            self.model = f"models/{target_model}"
        else:
            self.model = target_model

        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_connected = False
        self.transcript_history: List[Dict[str, str]] = []

    async def connect(self):
        """Establish WebSocket connection with Google Gemini Live API and perform initial handshake."""
        ws_url = f"{GEMINI_LIVE_WS_URL}?key={self.api_key}"
        self.ws = await websockets.connect(
            ws_url,
            additional_headers={"Content-Type": "application/json"},
            ping_interval=20,
            ping_timeout=20,
        )
        self.is_connected = True

        # Initial Setup message
        setup_payload = {
            "setup": {
                "model": self.model,
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": self.voice_name
                            }
                        }
                    }
                },
                "systemInstruction": {
                    "parts": [{"text": self.system_prompt}]
                }
            }
        }
        await self.ws.send(json.dumps(setup_payload))
        
        # Await setup confirmation response
        raw_ack = await self.ws.recv()
        logger.info(f"[GeminiLive] Connected and Handshake Completed: {raw_ack[:120]}")

    async def send_audio_chunk(self, mulaw_8k_chunk: bytes):
        """Convert Twilio 8kHz mu-law audio to 16kHz PCM and stream to Gemini."""
        if not self.ws or not self.is_connected:
            return

        pcm_8k = decode_mulaw_to_pcm16(mulaw_8k_chunk)
        pcm_16k = resample_8k_to_16k(pcm_8k)
        await self.send_pcm_chunk(pcm_16k)

    async def send_pcm_chunk(self, pcm_16k_chunk: bytes):
        """Send raw 16kHz 16-bit linear PCM audio chunk directly to Gemini."""
        if not self.ws or not self.is_connected or not pcm_16k_chunk:
            return

        b64_audio = base64.b64encode(pcm_16k_chunk).decode("utf-8")
        msg = {
            "realtimeInput": {
                "mediaChunks": [
                    {
                        "mimeType": "audio/pcm;rate=16000",
                        "data": b64_audio
                    }
                ]
            }
        }
        await self.ws.send(json.dumps(msg))

    async def send_text_chunk(self, text: str):
        """Send textual input/turn directly into Gemini Live session."""
        if not self.ws or not self.is_connected or not text.strip():
            return

        msg = {
            "clientContent": {
                "turns": [
                    {
                        "role": "user",
                        "parts": [{"text": text.strip()}]
                    }
                ],
                "turnComplete": True
            }
        }
        await self.ws.send(json.dumps(msg))

    async def receive_events(self) -> AsyncIterator[Dict[str, Any]]:
        """
        Continuously listen for audio chunks, text, and interruption events from Gemini.
        Yields dicts with:
        - {"type": "audio", "data": bytes (8kHz mulaw for Twilio), "pcm_24k": bytes (for Web Audio)}
        - {"type": "interrupted"}
        - {"type": "turn_complete"}
        - {"type": "text", "text": str}
        """
        if not self.ws:
            return

        try:
            async for raw_message in self.ws:
                try:
                    payload = json.loads(raw_message)
                except Exception:
                    continue

                server_content = payload.get("serverContent")
                if not server_content:
                    continue

                # Check if user interrupted the agent
                if server_content.get("interrupted"):
                    logger.debug("[GeminiLive] User Interruption detected!")
                    yield {"type": "interrupted"}

                model_turn = server_content.get("modelTurn")
                if model_turn:
                    parts = model_turn.get("parts", [])
                    for part in parts:
                        # Spoken Audio stream
                        inline_data = part.get("inlineData")
                        if inline_data and inline_data.get("mimeType", "").startswith("audio/"):
                            raw_b64 = inline_data.get("data", "")
                            pcm_24k = base64.b64decode(raw_b64)
                            # Convert 24kHz PCM to 8kHz mu-law for Twilio
                            pcm_8k = downsample_24k_to_8k(pcm_24k)
                            mulaw_8k = encode_pcm16_to_mulaw(pcm_8k)
                            yield {"type": "audio", "data": mulaw_8k, "pcm_24k": pcm_24k}

                        # Text transcript piece (filter out internal thought/reasoning chains)
                        text_part = part.get("text")
                        is_thought = part.get("thought") is True or (text_part and (text_part.strip().startswith("**") or "I've been working" in text_part))
                        if text_part and not is_thought:
                            yield {"type": "text", "text": text_part}

                if server_content.get("turnComplete"):
                    yield {"type": "turn_complete"}

        except websockets.ConnectionClosed as cc:
            logger.info(f"[GeminiLive] WebSocket connection closed by Gemini (code={cc.code}, reason={cc.reason}).")
        except Exception as e:
            logger.error(f"[GeminiLive] Error in receive_events: {e}")
        finally:
            self.is_connected = False

    async def close(self):
        """Gracefully close the Gemini Live WebSocket connection."""
        self.is_connected = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
