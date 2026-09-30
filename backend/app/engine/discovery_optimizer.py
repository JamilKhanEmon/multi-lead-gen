"""
Discovery Optimizer: Dynamic AI-Driven Query Expansion & Discovery Filter.
Translates user fuzzy inputs into high-precision commercial queries,
positive keyword filters, and negative keyword blacklists using LLM (qwen2.5:7b).
100% generic, multi-business, and worldwide: No hardcoded vertical or geographic rules.
"""
import re
import urllib.parse
from typing import Dict, Any, List, Tuple, Optional
from app.core.logging import logger
from app.services.ollama_client import OllamaClient, OllamaClientError


class DiscoveryOptimizer:
    """Optimizes discovery queries and filters candidate businesses dynamically."""

    # Universal non-commercial baseline negative keywords (e.g. public utilities, worship, schools)
    UNIVERSAL_NEGATIVE_KEYWORDS = [
        "housing society", "residential society", "hostel", "dormitory",
        "pharmacy", "drug store",
        "salon", "barber",
        "cemetery", "graveyard", "place of worship",
        "courier", "bus station",
    ]

    @classmethod
    async def optimize_search_plan(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
        sub_city: str = "",
    ) -> Dict[str, Any]:
        """
        Uses LLM (qwen2.5:7b) to dynamically translate user input into:
        - High-precision search queries (for browser & web search)
        - Clean OSM search targets
        - Positive keywords indicating real operating businesses
        - Negative keywords to discard noisy/unrelated results dynamically for ANY industry worldwide.
        """
        loc_parts = [p for p in [sub_city, city, country] if p]
        full_loc = ", ".join(loc_parts) if loc_parts else location.strip()
        ind_clean = industry.strip()

        # Step 1: Try LLM Query Expansion
        try:
            ollama = OllamaClient(timeout=8.0)
            system_prompt = (
                "You are an expert B2B Lead Generation Discovery Query Optimizer.\n"
                "Given any target industry and any location worldwide, generate broad, high-coverage search queries, "
                "OSM directory queries, positive keywords indicating real operating commercial businesses, and negative keywords "
                "(unrelated industries, non-commercial entities, retail shops, or common search noise for this specific industry) to filter out.\n"
                "IMPORTANT: In 'negative_keywords', dynamically include distinct, unrelated industries that frequently appear as false positive noise when searching for this target industry.\n"
                "Return pure JSON with keys: 'search_queries' (list of 4 strings), 'osm_queries' (list of 3 strings), "
                "'positive_keywords' (list of 6 strings), 'negative_keywords' (list of 10 strings)."
            )
            user_prompt = (
                f"Target Industry: {ind_clean}\n"
                f"Target Location: {full_loc}\n"
                f"Ensure queries target all active commercial businesses, firms, clinics, or agencies in this area, NOT residential areas or random shops."
            )

            result = await ollama.analyze(system_prompt=system_prompt, user_prompt=user_prompt)
            if (
                isinstance(result, dict)
                and "search_queries" in result
                and isinstance(result["search_queries"], list)
                and len(result["search_queries"]) > 0
            ):
                logger.info(f"DiscoveryOptimizer: Successfully generated dynamic LLM search plan for '{ind_clean}' in '{full_loc}'.")
                # Merge universal negative keywords for safety (excluding the target industry itself)
                base_negs = [w for w in cls.UNIVERSAL_NEGATIVE_KEYWORDS if w not in ind_clean.lower()]
                neg = list(dict.fromkeys(result.get("negative_keywords", []) + base_negs))
                result["negative_keywords"] = neg
                result["industry"] = ind_clean
                result["location"] = full_loc
                result["sub_city"] = sub_city.strip()
                return result
        except Exception as e:
            logger.debug(f"DiscoveryOptimizer: LLM optimization fallback: {e}")

        # Step 2: Intelligent Dynamic Fallback (No hardcoded verticals)
        return cls.build_fallback_plan(industry=ind_clean, location=full_loc, country=country, city=city, sub_city=sub_city)

    @classmethod
    def build_fallback_plan(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
        sub_city: str = "",
    ) -> Dict[str, Any]:
        """Constructs an intelligent, deterministic plan for any industry dynamically."""
        ind_lower = industry.lower().strip()
        loc_parts = [p for p in [sub_city, city, country] if p]
        loc_str = ", ".join(loc_parts) if loc_parts else (location.strip() or f"{city} {country}".strip() or "local")

        queries = [
            f"{industry} companies in {loc_str} official website",
            f"{industry} firms and services {loc_str}",
            f"{industry} local offices {loc_str}",
            f"{industry} commercial business directory {loc_str}",
        ]
        osm = [
            f"{industry} Company {loc_str}",
            f"{industry} Services {loc_str}",
            f"{industry} Agency {loc_str}",
        ]
        pos = [ind_lower, f"{ind_lower} services", f"{ind_lower} company"]
        neg = [w for w in cls.UNIVERSAL_NEGATIVE_KEYWORDS if w not in ind_lower]

        return {
            "industry": industry,
            "location": loc_str,
            "sub_city": sub_city.strip(),
            "search_queries": queries,
            "osm_queries": osm,
            "positive_keywords": pos,
            "negative_keywords": neg,
        }

    @classmethod
    def validate_candidate(cls, candidate: Dict[str, Any], plan: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Pure dynamic AI-driven candidate validation.
        No hardcoded industry or regional rules.
        Rejection is driven entirely by the search plan negative keywords,
        snippet semantics, and strict geographic locality matching.
        """
        name = (candidate.get("canonical_name") or candidate.get("name") or "").strip()
        domain = (candidate.get("domain") or candidate.get("website") or "").lower()
        snippet = (candidate.get("snippet") or candidate.get("display_name") or "").lower()
        cand_address = (candidate.get("address") or "").lower()
        name_lower = name.lower()

        # 1. Reject empty or abnormally short strings (e.g. single/double letter noise)
        if len(name) < 3:
            return False, "Business name is too short"

        # 2. Reject generic social media & tech platform homepages (e.g. facebook.com, instagram.com)
        GENERIC_PLATFORMS = {"facebook", "facebook.com", "instagram", "google", "meta", "twitter", "linkedin", "youtube", "tiktok", "whatsapp"}
        if name_lower in GENERIC_PLATFORMS:
            return False, f"Candidate is a generic platform entity ({name}), not an actual business."
        if any(bad in name_lower for bad in ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "google.com/maps", "twitter.com"]):
            return False, f"Candidate name is a social media / platform URL: '{name}'"

        # 3. Strict Locality Match: If user specified a sub-city/area, enforce geographic boundary
        req_sub_city = (plan.get("sub_city") or "").lower().strip()
        if req_sub_city and len(req_sub_city) >= 3:
            cand_full_loc = f"{cand_address} {snippet} {candidate.get('location', '')}".lower()
            if cand_address and req_sub_city not in cand_full_loc:
                return False, f"Candidate location does not match requested area '{req_sub_city}'"

        # 4. Disqualify if candidate name is merely the generic industry category name itself
        target_ind = (plan.get("industry") or "").lower().strip()
        if target_ind and name_lower == target_ind:
            return False, f"Candidate name is identical to the target industry category: '{name}'"

        # 5. Semantic Negative Keyword Filter:
        # Checked against name, domain, and snippet description
        negatives = plan.get("negative_keywords", [])
        for neg in negatives:
            neg_l = neg.lower().strip()
            if not neg_l:
                continue
            if neg_l in name_lower:
                return False, f"Candidate matched AI negative filter '{neg}': '{name}'"
            if neg_l.replace(" ", "") in domain:
                return False, f"Domain matched AI negative filter '{neg}': '{domain}'"
            if len(neg_l) >= 4 and neg_l in snippet:
                return False, f"Candidate snippet matched AI negative filter '{neg}': '{name}'"

        return True, "Valid commercial entity"

    @classmethod
    async def verify_industry_fit(
        cls,
        target_industry: str,
        business_name: str,
        domain: str = "",
        page_title: str = "",
        meta_description: str = "",
        heading: str = "",
        negative_keywords: Optional[List[str]] = None,
        ollama_client: Optional[Any] = None,
    ) -> Tuple[bool, str]:
        """
        100% Dynamic, Multi-Business Industry Relevance Gate (Worldwide, No Hardcoding):
        Works for ANY vertical (Roofing, Dental, Solar, SaaS, Gym, Maritime, Bakery, etc.)
        Phase 1 (0 Tokens): Dynamic keyword matching from target_industry + rejection of dynamic negative filters.
        Phase 2 (~50 Tokens): Micro LLM verification ONLY for ambiguous candidates.
        Phase 3 (0 Tokens): Safe fallback if AI is unavailable.
        """
        ind_clean = (target_industry or "commercial").lower().strip()
        page_title_l = (page_title or "").lower()
        business_name_l = (business_name or "").lower()
        domain_l = (domain or "").lower()
        meta_desc_l = (meta_description or "").lower()

        # Step 1: Reject if content matches dynamically generated AI negative keywords (0 Tokens)
        if negative_keywords:
            for neg in negative_keywords:
                neg_l = neg.lower().strip()
                if len(neg_l) >= 4 and (neg_l in page_title_l or neg_l in business_name_l or neg_l in meta_desc_l):
                    return False, f"Matched dynamic negative filter: '{neg}'"

        # Step 2: Dynamic Positive Semantic Match (0 Tokens)
        # Extract meaningful root keywords from user's target_industry (skipping generic suffixes)
        GENERIC_STOPWORDS = {"and", "the", "for", "with", "service", "services", "company", "firm", "agency", "solutions", "group", "ltd", "inc", "co"}
        target_words = [
            w for w in re.split(r'[\s\-_/,]+', ind_clean)
            if len(w) >= 3 and w not in GENERIC_STOPWORDS
        ]
        if target_words:
            matched_words = [
                w for w in target_words
                if w in page_title_l or w in business_name_l or w in domain_l
            ]
            if matched_words:
                return True, f"Direct dynamic industry keyword matched: {matched_words}"

        # Step 3: Ambiguous Candidate AI Verification (~50-80 Tokens)
        # LLM evaluates ANY industry dynamically without predefined verticals
        if ollama_client and (page_title or meta_description or business_name):
            try:
                system_prompt = (
                    "You are a strict B2B industry relevance validator.\n"
                    "Analyze the business name and website to determine if it directly belongs to the specified target industry.\n"
                    "Respond ONLY with a JSON object: {\"is_relevant\": true/false, \"reason\": \"<under 10 words>\"}"
                )
                user_prompt = (
                    f"Target Industry: {target_industry}\n"
                    f"Business Name: {business_name}\n"
                    f"Website Title: {page_title[:120]}\n"
                    f"Website Description: {meta_description[:200]}\n"
                    f"Question: Does this company operate in or provide products/services for '{target_industry}'?"
                )
                res = await ollama_client.analyze(system_prompt=system_prompt, user_prompt=user_prompt)
                if isinstance(res, dict) and "is_relevant" in res:
                    is_rel = bool(res.get("is_relevant"))
                    reason = res.get("reason", "AI industry verification")
                    return is_rel, reason
            except Exception as e:
                logger.debug(f"Dynamic AI industry micro-verification notice: {e}")

        # Step 4: Fallback Acceptance (0 Tokens)
        return True, "Passed basic filter (dynamic industry fallback)"

    @classmethod
    def classify_entity(cls, name: str, domain: Optional[str] = None, business_type: str = "general") -> str:
        """Classifies and formats the business entity title cleanly for any industry."""
        btype_l = (business_type or "general").lower()
        clean_type = btype_l.replace("_", " ").replace("-", " ").title()

        if clean_type and clean_type not in ("Other", "General"):
            if any(k in clean_type.lower() for k in ["firm", "company", "agency", "clinic", "shop", "service", "contractor"]):
                return clean_type
            return f"{clean_type} Commercial Firm"

        if domain:
            return "Verified Commercial Company"
        return "Local Commercial Entity"
