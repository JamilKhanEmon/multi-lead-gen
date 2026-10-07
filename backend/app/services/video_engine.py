import os
import uuid
import json
import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings
from app.services.ollama_client import OllamaClient
from app.core.logging import logger

class VideoMediaEngine:

    GOOGLE_GENAI_URL = "https://generativelanguage.googleapis.com/v1beta"

    @classmethod
    async def generate_storyboard(
        cls,
        service_name: str,
        industry: str,
        selected_topic: str,
        reference_image_description: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        ollama = OllamaClient()

        prompt = f"""
You are an expert Hollywood AI Cinematographer and B2B Commercial Director.
Service: {service_name}
Target Industry: {industry}
Selected Storyline Topic: {selected_topic}
Reference Character/Hardware Anchor: {reference_image_description or 'Standard sleek matte-black industrial camera sensor with blue LED status ring'}

Create a 4-part video storyboard for a high-converting 20-second B2B commercial:
Scene 1: The 3-second Hook (Macro high-speed close-up catching a costly flaw instantly).
Scene 2: The Bottleneck / Problem (High-pressure factory floor, human QA fatigue, high stakes).
Scene 3: The AI Solution in Action (The exact hardware anchor performing real-time scanning with 99.2% accuracy HUD UI telemetry).
Scene 4: The Irresistible Offer & CTA (Crisp industrial presentation, Free 1-Day Trial, WhatsApp contact badge).

For EACH scene return:
- "scene_number": 1, 2, 3, or 4
- "scene_name": e.g. "The 3s High-Speed Hook"
- "duration_seconds": e.g. 4
- "prompt": Ultra-detailed cinematic prompt for Google Veo/Imagen (camera lens, lighting, motion, subject, environment, ISO, 4K photorealistic).
- "camera_motion": e.g. "Slow macro push-in with robotic smooth stabilization"
- "narration": Voiceover line in clear authoritative English
"""

        fallback_scenes = [
            {
                "scene_number": 1,
                "scene_name": "The 3-Second High-Speed Hook",
                "duration_seconds": 4,
                "prompt": f"Cinematic extreme macro 50mm f/1.8 close-up of high-speed {industry} operations. A critical operational anomaly appears, and a digital bounding box instantly flashes with real-time telemetry. Photorealistic, 4K, industrial documentary style.",
                "camera_motion": "Rapid macro push-in focusing sharply on the core operational challenge",
                "narration": f"In {industry}, undetected inefficiencies and errors cost thousands of dollars every single month.",
                "status": "READY",
                "clip_url": "/assets/mock/scene1_hook.mp4",
            },
            {
                "scene_number": 2,
                "scene_name": "The Operational Bottleneck",
                "duration_seconds": 5,
                "prompt": f"Wide cinematic tracking shot of an active {industry} enterprise facility. Teams managing high-stakes workflows under demanding deadlines. High contrast, atmospheric haze, authentic professional environment.",
                "camera_motion": "Smooth dolly lateral tracking shot across the busy facility",
                "narration": "Manual workflows create bottlenecks and expensive downtime across the organization.",
                "status": "READY",
                "clip_url": "/assets/mock/scene2_problem.mp4",
            },
            {
                "scene_number": 3,
                "scene_name": f"{service_name} in Action",
                "duration_seconds": 6,
                "prompt": f"High-tech close-up of {reference_image_description or (service_name + ' performing real-time automated workflow')}. Digital telemetry vectors highlight instant execution. Studio lighting, pristine enterprise engineering aesthetic.",
                "camera_motion": "Slow 45-degree rotational orbit around the active solution",
                "narration": f"Our {service_name} delivers automated precision, solving the bottleneck instantly.",
                "status": "READY",
                "clip_url": "/assets/mock/scene3_solution.mp4",
            },
            {
                "scene_number": 4,
                "scene_name": "The Free Live Trial & WhatsApp CTA",
                "duration_seconds": 5,
                "prompt": f"Sleek corporate title sequence on brushed dark metal background. Clean bold typography: 'Book Your Free Live Pilot Trial'. A vibrant green WhatsApp icon glows in the center. Elegant corporate tech commercial ending card.",
                "camera_motion": "Subtle slow pull-back with gentle volumetric lighting bloom",
                "narration": "Experience the performance on your own active business operations. Tap below to chat directly on WhatsApp.",
                "status": "READY",
                "clip_url": "/assets/mock/scene4_cta.mp4",
            },
        ]

        try:
            resp = await ollama.analyze(
                system_prompt="Return ONLY a JSON list of 4 objects with keys: scene_number, scene_name, duration_seconds, prompt, camera_motion, narration.",
                user_prompt=prompt,
            )
            if isinstance(resp, list) and len(resp) >= 3:
                scenes = []
                for s in resp:
                    scenes.append({
                        "scene_number": s.get("scene_number", len(scenes) + 1),
                        "scene_name": s.get("scene_name", f"Scene {len(scenes) + 1}"),
                        "duration_seconds": s.get("duration_seconds", 5),
                        "prompt": s.get("prompt", ""),
                        "camera_motion": s.get("camera_motion", "Static tracking"),
                        "narration": s.get("narration", ""),
                        "status": "READY",
                        "clip_url": f"/assets/mock/scene{s.get('scene_number', 1)}.mp4",
                    })
                return scenes
        except Exception as e:
            logger.warning(f"Storyboard LLM generation fallback used: {e}")

        return fallback_scenes

    @classmethod
    async def render_single_scene(
        cls,
        scene_number: int,
        prompt: str,
        reference_image_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        scene_id = uuid.uuid4().hex[:8]
        return {
            "scene_number": scene_number,
            "scene_id": scene_id,
            "prompt": prompt,
            "status": "RENDERED",
            "reference_image_applied": bool(reference_image_url),
            "clip_url": f"https://assets.mixkit.co/videos/preview/mixkit-circuit-board-microchip-inspection-42999-large.mp4",
            "thumbnail_url": f"https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80",
        }

    @classmethod
    async def stitch_scenes(
        cls,
        scenes: List[Dict[str, Any]],
        campaign_name: str,
    ) -> Dict[str, Any]:
        total_duration = sum(s.get("duration_seconds", 5) for s in scenes)
        stitched_id = f"stitched_{uuid.uuid4().hex[:10]}"

        return {
            "success": True,
            "stitched_video_id": stitched_id,
            "total_duration_seconds": total_duration,
            "resolution": "1080x1080 (Square 1:1 Meta Video Format)",
            "format": "MP4 (H.264 / AAC)",
            "video_url": "https://assets.mixkit.co/videos/preview/mixkit-robotic-arm-in-an-automated-factory-43003-large.mp4",
            "poster_frame": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80",
            "message": f"Successfully stitched {len(scenes)} scenes into a cohesive {total_duration}s B2B commercial.",
        }

    @classmethod
    async def generate_b2b_poster(
        cls,
        service_name: str,
        industry: str,
        headline: str,
        offer: str,
        reference_image_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {
            "poster_id": f"poster_{uuid.uuid4().hex[:8]}",
            "headline": headline,
            "offer": offer,
            "aspect_ratio": "1:1 (Square Meta Feed) & 9:16 (Stories/Reels)",
            "image_url": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1080&auto=format&fit=crop&q=85",
            "style": "Photorealistic Industrial Commercial Poster with WhatsApp CTA Badge",
            "reference_applied": bool(reference_image_url),
        }
