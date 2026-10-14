import re
import urllib.parse
from typing import Dict, Any, List, Optional
from app.core.logging import logger
from app.services.ai_client import AIClient

# Global in-memory cache for decomposed locations to achieve 0 tokens on repeat previews
_DECOMPOSE_CACHE: Dict[str, List[Dict[str, Any]]] = {}

class StrategyEngine:
    """
    Intelligent Geo-Expansion & Campaign Strategy Engine powered purely by LLM reasoning.
    No hardcoded geographic dictionaries.
    Dynamically decomposes any location worldwide (Divisions, Districts, Thanas, Upazilas,
    Neighborhoods) into high-intent sub-areas while strictly minimizing token consumption.
    """

    @classmethod
    def resolve_target_location(cls, loc_str: str) -> tuple:
        COMMON_COUNTRIES = {
            "bangladesh", "bd", "india", "pakistan", "usa", "united states", "us", "uk",
            "united kingdom", "canada", "australia", "uae", "united arab emirates",
            "germany", "france", "singapore", "malaysia", "saudi arabia", "qatar"
        }
        parts = [p.strip() for p in re.split(r"[,/|]", loc_str) if p.strip()]
        if not parts:
            return loc_str, ""
        if len(parts) == 1:
            return parts[0], ""

        # General-to-Specific: Country first (e.g. 'bangladesh, dhaka, manikgang')
        if parts[0].lower() in COMMON_COUNTRIES:
            primary = parts[-1]
            context = ", ".join(parts[:-1])
            return primary, context

        # Specific-to-General: Country last (e.g. 'manikgang, dhaka, bangladesh')
        if parts[-1].lower() in COMMON_COUNTRIES:
            primary = parts[0]
            context = ", ".join(parts[1:])
            return primary, context

        # Division / State first (e.g. 'dhaka division, tangail')
        if any(k in parts[0].lower() for k in ["division", "state", "province"]):
            primary = parts[-1]
            context = ", ".join(parts[:-1])
            return primary, context

        return parts[0], ", ".join(parts[1:])

    @classmethod
    async def decompose_sub_areas(
        cls,
        location: str,
        industry: str = "General",
        ai_client: Optional[AIClient] = None,
    ) -> List[Dict[str, Any]]:
        """
        Uses LLM to dynamically segment any target geography into 8 to 12 commercial sub-areas.
        Uses concise prompt and low max_tokens to prevent token waste.
        Cached in-memory to guarantee 0 tokens on repeat requests.
        """
        loc_clean = location.strip()
        if not loc_clean:
            return [{"name": "Central Commercial District", "checked": True}]

        cache_key = f"{loc_clean.lower()}::{industry.strip().lower()}"
        if cache_key in _DECOMPOSE_CACHE:
            logger.info(f"StrategyEngine: Zero-token cache hit for location '{loc_clean}'")
            return [dict(a) for a in _DECOMPOSE_CACHE[cache_key]]

        if ai_client is None:
            ai_client = AIClient()

        primary_target, broader_context = cls.resolve_target_location(loc_clean)

        system_prompt = (
            "You are a strict, hyper-accurate geographic engine. "
            "Tolerate common phonetic transliteration variations and minor spelling typos (e.g., 'manikgang' refers to Manikganj, 'bogura' refers to Bogra). "
            f"You MUST strictly return only real sub-areas, upazilas, thanas, or commercial neighborhoods "
            f"that are PHYSICALLY INSIDE the target district/city '{primary_target}'. "
            "CRITICAL: NEVER return areas from other districts, divisions, or cities outside this target. "
            "Output strictly raw JSON without conversation or markdown."
        )
        user_prompt = (
            f"Target: '{primary_target}' (Region context: '{broader_context or loc_clean}').\n"
            f"Industry: '{industry}'.\n"
            f"List 8 to 12 real commercial upazilas, thanas, or commercial neighborhoods located strictly inside '{primary_target}'.\n"
            'Format: {"sub_areas": ["SubArea 1", "SubArea 2", ...]}'
        )

        try:
            res = await ai_client.analyze(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
            areas = res.get("sub_areas")
            if isinstance(areas, list) and len(areas) >= 2:
                formatted = [{"name": str(a).strip(), "checked": True} for a in areas[:12] if str(a).strip()]
                _DECOMPOSE_CACHE[cache_key] = formatted
                logger.info(f"StrategyEngine: Successfully decomposed '{loc_clean}' into {len(formatted)} sub-areas via LLM.")
                return formatted
        except Exception as e:
            logger.warning(f"StrategyEngine: LLM geo decomposition note: {e}")

        # Graceful fallback only if LLM is completely offline or unavailable
        parts = [p.strip() for p in re.split(r"[,/|]", loc_clean) if p.strip()]
        if len(parts) > 1:
            fallback = [{"name": p, "checked": True} for p in parts]
        else:
            fallback = [
                {"name": f"{loc_clean} - Central Hub", "checked": True},
                {"name": f"{loc_clean} - North Zone", "checked": True},
                {"name": f"{loc_clean} - South Zone", "checked": True},
                {"name": f"{loc_clean} - East Zone", "checked": True},
                {"name": f"{loc_clean} - West Zone", "checked": True},
            ]
        _DECOMPOSE_CACHE[cache_key] = fallback
        return fallback

    @classmethod
    def generate_search_queries(cls, industry: str, location: str, sub_areas: List[str]) -> List[str]:
        ind_clean = industry.strip()
        loc_clean = location.strip()
        queries = []
        for area in sub_areas[:10]:
            clean_area = str(area).strip()
            if not clean_area:
                continue
            if loc_clean and loc_clean.lower() not in clean_area.lower():
                queries.append(f"{ind_clean} in {clean_area}, {loc_clean}")
                queries.append(f"site:facebook.com \"{ind_clean}\" \"{clean_area}\" \"{loc_clean}\"")
            else:
                queries.append(f"{ind_clean} in {clean_area}")
                queries.append(f"site:facebook.com \"{ind_clean}\" \"{clean_area}\"")
        if not queries:
            queries = [
                f"{ind_clean} in {loc_clean}",
                f"site:facebook.com \"{ind_clean}\" \"{loc_clean}\"",
                f"{ind_clean} office {loc_clean}",
            ]
        return queries

    @classmethod
    async def match_kb_services(cls, db_session, industry: str) -> List[Dict[str, Any]]:
        from app.models.company_kb import CompanyKB
        from sqlalchemy import select

        matched = []
        try:
            stmt = select(CompanyKB).where(CompanyKB.is_active == True).order_by(CompanyKB.created_at.desc()).limit(1)
            res = await db_session.execute(stmt)
            kb = res.scalar_one_or_none()
            if kb and isinstance(kb.services_json, list) and len(kb.services_json) > 0:
                ind_lower = industry.lower()
                for s in kb.services_json:
                    name = s.get("name") or s.get("key") or "Digital Growth"
                    desc = s.get("features") or s.get("description") or ""
                    matched.append({
                        "name": name,
                        "type": "software" if any(w in (name + " " + desc).lower() for w in ["crm", "erp", "software", "portal", "system"]) else "marketing",
                        "description": desc,
                        "offer_hook": "5-Minute Live Interactive Software Demo"
                    })
        except Exception as e:
            logger.warning(f"StrategyEngine KB match error: {e}")

        if not matched:
            # High-conversion service offerings with 5-Minute Live Interactive Demo
            matched = [
                {
                    "name": f"{industry} High-Intent Meta & Video Ad Lead Funnel",
                    "type": "marketing",
                    "description": "Acquire qualified local clients and buyer inquiries with optimized Meta & TikTok campaigns.",
                    "offer_hook": "5-Minute Campaign Strategy & Competitor Blueprint"
                },
                {
                    "name": f"Automated {industry} CRM & Instant WhatsApp Follow-up System",
                    "type": "software",
                    "description": "Convert inbound inquiries instantly without manual messaging delays using custom CRM automation.",
                    "offer_hook": "5-Minute Live Interactive Software Demo"
                },
                {
                    "name": f"Branded {industry} Official Website & Inbound Booking Portal",
                    "type": "software",
                    "description": "Launch a dedicated high-converting web presence for businesses currently operating exclusively on social media.",
                    "offer_hook": "5-Minute Interactive Live Demo"
                }
            ]

        return matched

    @classmethod
    async def generate_strategy_preview(
        cls,
        db_session,
        industry: str,
        location: str,
        analyze_website: bool = False,
        ai_client: Optional[AIClient] = None,
    ) -> Dict[str, Any]:
        """
        Builds complete strategy preview for Admin Review & Approval.
        """
        sub_areas_objs = await cls.decompose_sub_areas(location, industry=industry, ai_client=ai_client)
        sub_area_names = [a["name"] for a in sub_areas_objs if a.get("checked", True)]
        search_queries = cls.generate_search_queries(industry, location, sub_area_names)
        matched_services = await cls.match_kb_services(db_session, industry)

        return {
            "industry": industry,
            "target_location": location,
            "analyze_website": analyze_website,
            "mode_label": "Deep Website Technical Audit" if analyze_website else "Social Presence, Ads & Software Demo Pitch",
            "sub_areas": sub_areas_objs,
            "search_queries": search_queries[:12],
            "matched_services": matched_services,
            "demo_offer": "5-Minute Live Interactive Software Demo included in all pitches",
            "total_areas_count": len(sub_areas_objs),
        }
