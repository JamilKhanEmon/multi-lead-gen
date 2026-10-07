import re
import urllib.parse
from typing import Dict, Any, List, Tuple, Optional
from app.core.logging import logger
from app.services.ollama_client import OllamaClient, OllamaClientError

class DiscoveryOptimizer:

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
        loc_parts = [p for p in [sub_city, city, country] if p]
        full_loc = ", ".join(loc_parts) if loc_parts else location.strip()
        ind_clean = industry.strip()

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
                base_negs = [w for w in cls.UNIVERSAL_NEGATIVE_KEYWORDS if w not in ind_clean.lower()]
                neg = list(dict.fromkeys(result.get("negative_keywords", []) + base_negs))
                result["negative_keywords"] = neg
                result["industry"] = ind_clean
                result["location"] = full_loc
                result["sub_city"] = sub_city.strip()
                return result
        except Exception as e:
            logger.debug(f"DiscoveryOptimizer: LLM optimization fallback: {e}")

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
        ind_lower = industry.lower().strip()
        loc_parts = [p for p in [sub_city, city, country] if p]
        loc_str = ", ".join(loc_parts) if loc_parts else (location.strip() or f"{city} {country}".strip() or "local")

        city_target = f"{city} {country}".strip() or loc_str
        sub_target = f"{sub_city} {city}".strip() if sub_city else loc_str

        queries = [
            f"{industry} {sub_target} official website",
            f"{industry} companies in {city_target} official website",
            f"top {industry} firms and services in {city_target}",
            f"{industry} commercial business offices {sub_target}",
        ]
        osm = [
            f"{industry} {sub_target}",
            f"{industry} {city_target}",
            f"{industry} Company {loc_str}",
        ]
        pos = [ind_lower, f"{ind_lower} services", f"{ind_lower} company"]
        neg = [w for w in cls.UNIVERSAL_NEGATIVE_KEYWORDS if w not in ind_lower]

        return {
            "industry": industry,
            "location": loc_str,
            "city": city.strip(),
            "sub_city": sub_city.strip(),
            "search_queries": queries,
            "osm_queries": osm,
            "positive_keywords": pos,
            "negative_keywords": neg,
        }

    @classmethod
    def validate_candidate(cls, candidate: Dict[str, Any], plan: Dict[str, Any]) -> Tuple[bool, str]:
        name = (candidate.get("canonical_name") or candidate.get("name") or "").strip()
        domain = (candidate.get("domain") or candidate.get("website") or "").lower()
        snippet = (candidate.get("snippet") or candidate.get("display_name") or "").lower()
        cand_address = (candidate.get("address") or "").lower()
        name_lower = name.lower()

        if len(name) < 3:
            return False, "Business name is too short"

        GENERIC_PLATFORMS = {"facebook", "facebook.com", "instagram", "google", "meta", "twitter", "linkedin", "youtube", "tiktok", "whatsapp"}
        if name_lower in GENERIC_PLATFORMS:
            return False, f"Candidate is a generic platform entity ({name}), not an actual business."
        if any(bad in name_lower for bad in ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "google.com/maps", "twitter.com"]):
            return False, f"Candidate name is a social media / platform URL: '{name}'"

        req_sub_city = (plan.get("sub_city") or "").lower().strip()
        req_city = (plan.get("city") or "").lower().strip()
        if cand_address and req_city and len(req_city) >= 3:
            cand_full_loc = f"{cand_address} {snippet} {candidate.get('location', '')}".lower()
            if req_city not in cand_full_loc and req_sub_city not in cand_full_loc:
                return False, f"Candidate location does not match target city '{req_city}'"

        target_ind = (plan.get("industry") or "").lower().strip()
        if target_ind and name_lower == target_ind:
            return False, f"Candidate name is identical to the target industry category: '{name}'"

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
        positive_keywords: Optional[List[str]] = None,
        ollama_client: Optional[Any] = None,
    ) -> Tuple[bool, str]:
        ind_clean = (target_industry or "commercial").lower().strip()
        ind_phrase = ind_clean.replace("_", " ").strip()
        page_title_l = (page_title or "").lower()
        business_name_l = (business_name or "").lower()
        domain_l = (domain or "").lower()
        meta_desc_l = (meta_description or "").lower()
        heading_l = (heading or "").lower()
        full_text = f"{business_name_l} {domain_l} {page_title_l} {meta_desc_l} {heading_l}"

        if negative_keywords:
            for neg in negative_keywords:
                neg_l = neg.lower().strip()
                if len(neg_l) >= 4 and neg_l in full_text:
                    return False, f"Matched AI negative filter: '{neg}'"

        if ind_phrase and len(ind_phrase) >= 4 and ind_phrase in full_text:
            return True, f"Full industry phrase verified: '{ind_phrase}'"
        if ind_clean.replace(" ", "") in domain_l or ind_phrase.replace(" ", "") in domain_l:
            return True, f"Official domain matches industry: '{domain_l}'"

        if positive_keywords:
            for pos in positive_keywords:
                pos_l = pos.lower().strip()
                if len(pos_l) >= 4 and pos_l in full_text:
                    return True, f"Dynamic AI industry keyword matched: '{pos}'"

        if ollama_client and (page_title or meta_description or business_name):
            try:
                system_prompt = (
                    "You are a strict, objective B2B industry classification expert. "
                    "Analyze the given business name, domain, website title, and meta description. "
                    "Determine whether this company genuinely belongs to or provides services in the target industry. "
                    "Respond ONLY with a JSON object: {\"is_relevant\": true/false, \"reason\": \"<under 10 words>\"}"
                )
                user_prompt = (
                    f"Target Industry: {target_industry}\n"
                    f"Business Name: {business_name}\n"
                    f"Domain: {domain}\n"
                    f"Website Title: {page_title[:150]}\n"
                    f"Website Description: {meta_description[:250]}\n"
                    f"Heading: {heading[:100]}\n"
                    f"Does this business legitimately operate in or provide products/services for '{target_industry}'?"
                )
                res = await ollama_client.analyze(system_prompt=system_prompt, user_prompt=user_prompt)
                if isinstance(res, dict) and "is_relevant" in res:
                    is_rel = bool(res.get("is_relevant"))
                    reason = res.get("reason", "AI dynamic semantic verification")
                    return is_rel, reason
            except Exception as e:
                logger.debug(f"Dynamic AI semantic verification notice: {e}")

        INDUSTRY_SYNONYMS = {
            "real estate": ["realtor", "realty", "property", "properties", "apartment", "apartments", "housing", "developer", "builders", "flat", "land", "estate", "brokerage", "leasing"],
            "real_estate": ["realtor", "realty", "property", "properties", "apartment", "apartments", "housing", "developer", "builders", "flat", "land", "estate", "brokerage", "leasing"],
            "healthcare": ["clinic", "hospital", "doctor", "dental", "dentist", "medical", "physician", "health", "care", "surgery", "therapy"],
            "legal": ["lawyer", "attorney", "law firm", "advocate", "legal", "solicitor", "counsel", "barrister"],
            "construction": ["contractor", "builder", "construction", "architecture", "architect", "engineering", "renovation", "interior"],
            "restaurant": ["cafe", "dining", "eatery", "bistro", "bakery", "food", "kitchen", "grill"],
            "fitness": ["gym", "fitness", "crossfit", "workout", "trainer", "yoga", "pilates"],
            "technology": ["software", "tech", "it solutions", "agency", "developer", "digital", "saas", "cloud", "consulting"]
        }
        
        for ind_key, syns in INDUSTRY_SYNONYMS.items():
            if ind_key in ind_clean or ind_clean in ind_key:
                for syn in syns:
                    if len(syn) >= 4 and syn in full_text:
                        return True, f"Industry synonym verified: '{syn}'"

        AMBIGUOUS_TOKENS = {
            "care", "digital", "smart", "home", "prime", "star", "one", 
            "new", "best", "top", "general", "global", "express", "direct", "city", "center",
            "hub", "point", "group", "life", "first", "pro", "master", "tech", "web", "clean"
        }
        GENERIC_STOPWORDS = {"and", "the", "for", "with", "service", "services", "company", "firm", "agency", "solutions", "group", "ltd", "inc", "co", "of", "in"}
        raw_words = re.split(r'[\s\-_/,]+', ind_clean)
        target_tokens = [w for w in raw_words if len(w) >= 4 and w not in GENERIC_STOPWORDS and w not in AMBIGUOUS_TOKENS]
        for tok in target_tokens:
            stem = tok[:-1] if len(tok) > 4 and tok.endswith('s') else tok
            if tok in full_text or (len(stem) >= 4 and stem in full_text):
                return True, f"Root industry stem matched: '{tok}'"

        if domain and (page_title or meta_description):
            return True, "General commercial relevance"

        return False, f"Website content has no semantic connection to target industry '{target_industry}'"

    @classmethod
    def classify_entity(cls, name: str, domain: Optional[str] = None, business_type: str = "general") -> str:
        btype_l = (business_type or "general").lower()
        clean_type = btype_l.replace("_", " ").replace("-", " ").title()

        if clean_type and clean_type not in ("Other", "General"):
            if any(k in clean_type.lower() for k in ["firm", "company", "agency", "clinic", "shop", "service", "contractor"]):
                return clean_type
            return f"{clean_type} Commercial Firm"

        if domain:
            return "Verified Commercial Company"
        return "Local Commercial Entity"
