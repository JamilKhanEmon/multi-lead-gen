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
    async def match_kb_services(
        cls,
        db_session,
        industry: str,
        location: str = "",
        ai_client: Optional[AIClient] = None,
        max_services: int = 0,
    ) -> List[Dict[str, Any]]:
        from app.models.company_kb import CompanyKB
        from sqlalchemy import select

        kb_name = ""
        kb_context_parts = []
        raw_kb_services = []
        try:
            stmt = select(CompanyKB).where(CompanyKB.is_active == True).order_by(CompanyKB.created_at.desc()).limit(1)
            res = await db_session.execute(stmt)
            kb = res.scalar_one_or_none()
            if kb:
                if kb.company_name:
                    kb_name = kb.company_name.strip()
                if kb.tagline_experience:
                    kb_context_parts.append(f"Tagline/Experience: {kb.tagline_experience}")
                if kb.master_kb_notes:
                    kb_context_parts.append(f"Master Overview: {kb.master_kb_notes[:1200]}")
                if kb.services_json and isinstance(kb.services_json, list):
                    raw_kb_services = kb.services_json
                    for s in kb.services_json:
                        s_name = s.get("name") or s.get("key") or ""
                        s_desc = s.get("features") or s.get("description") or ""
                        if s_name:
                            kb_context_parts.append(f"- {s_name}: {s_desc}")
        except Exception as e:
            logger.warning(f"StrategyEngine KB load error: {e}")

        is_auto = not max_services or max_services <= 0
        limit_desc = "the top 2 to 4" if is_auto else f"the top {max_services}"
        exact_desc = "2 to 4 distinct" if is_auto else f"exactly {max_services}"
        slice_limit = 5 if is_auto else max_services

        # 1. If Company KB has services configured, directly format and return up to limit
        if raw_kb_services:
            formatted_kb = []
            for s in raw_kb_services:
                if not isinstance(s, dict):
                    continue
                name = (s.get("name") or s.get("key") or "").strip()
                if not name:
                    continue
                desc = (s.get("description") or s.get("solves_problems") or s.get("features") or "").strip()
                wedge = (s.get("wedge") or "").strip()
                stype = str(s.get("type", "")).lower()
                if stype not in ["software", "marketing"]:
                    combined = f"{name} {desc} {wedge}".lower()
                    if any(k in combined for k in ["software", "crm", "app", "portal", "system", "saas", "dashboard", "bot", "platform", "tool", "website", "web"]):
                        stype = "software"
                    else:
                        stype = "marketing"
                offer_hook = (s.get("offer_hook") or wedge or (
                    "5-Minute Live Interactive Software Demo" if stype == "software" else "5-Minute Interactive Growth Blueprint"
                )).strip()
                formatted_kb.append({
                    "name": name,
                    "type": stype,
                    "description": desc,
                    "offer_hook": offer_hook,
                })
            if formatted_kb:
                return formatted_kb[:slice_limit]

        if ai_client is None:
            ai_client = AIClient()

        kb_context = "\n".join(kb_context_parts) if kb_context_parts else (
            f"Tailored B2B services and workflow automation specifically for {industry}."
        )

        company_identifier = kb_name if kb_name else "our company"
        system_prompt = (
            f"You are the Chief Solutions Architect and Sales Strategist for {company_identifier}. "
            f"Given the target industry ({industry}) and target location ({location}), analyze our offerings and capabilities "
            f"and dynamically decide {limit_desc} highest-converting services and live demo hooks to pitch. "
            "CRITICAL: The recommendations MUST be tailored precisely to the specific bottlenecks, workflows, and high-value needs of this specific industry. "
            "Output strictly raw JSON with key 'services'."
        )
        user_prompt = (
            f"Target Industry: {industry}\n"
            f"Target Location: {location}\n"
            f"Company KB Context:\n{kb_context}\n\n"
            f"Select or craft {exact_desc}, high-impact services for this industry. Format strictly as:\n"
            '{"services": [\n'
            '  {\n'
            '    "name": "Specific Software or Growth Product Name",\n'
            '    "type": "software" or "marketing",\n'
            '    "description": "Specific problem solved for businesses in this industry",\n'
            '    "offer_hook": "5-Minute Live Interactive Software Demo" or "5-Minute Interactive Growth Blueprint"\n'
            '  }\n'
            ']}'
        )

        try:
            res = await ai_client.analyze(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=800)
            services = None
            if isinstance(res, dict):
                for k in ["services", "matched_services", "recommendations", "offerings", "solutions", "data", "items"]:
                    if isinstance(res.get(k), list) and len(res[k]) > 0:
                        services = res[k]
                        break
                if services is None:
                    for val in res.values():
                        if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                            services = val
                            break
            elif isinstance(res, list):
                services = res

            if isinstance(services, list) and len(services) >= 1:
                formatted = []
                for s in services[:slice_limit]:
                    if isinstance(s, dict) and s.get("name"):
                        formatted.append({
                            "name": str(s.get("name")).strip(),
                            "type": "software" if str(s.get("type", "")).lower() == "software" else "marketing",
                            "description": str(s.get("description", "")).strip(),
                            "offer_hook": str(s.get("offer_hook") or "5-Minute Live Interactive Demo").strip(),
                        })
                if formatted:
                    return formatted[:slice_limit]
        except Exception as e:
            logger.warning(f"StrategyEngine AI service matching failed: {e}")

        # No fallback: strictly return empty list if nothing matched or generated
        return []

    @classmethod
    async def generate_strategy_preview(
        cls,
        db_session,
        industry: str,
        location: str,
        analyze_website: bool = False,
        ai_client: Optional[AIClient] = None,
        max_services: int = 0,
    ) -> Dict[str, Any]:
        """
        Builds complete strategy preview for Admin Review & Approval.
        Uses AI to dynamically decompose sub-areas and match relevant services.
        """
        if ai_client is None:
            ai_client = AIClient()

        sub_areas_objs = await cls.decompose_sub_areas(location, industry=industry, ai_client=ai_client)
        sub_area_names = [a["name"] for a in sub_areas_objs if a.get("checked", True)]
        search_queries = cls.generate_search_queries(industry, location, sub_area_names)
        matched_services = await cls.match_kb_services(
            db_session=db_session,
            industry=industry,
            location=location,
            ai_client=ai_client,
            max_services=max_services,
        )

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
