import re
import urllib.parse
from typing import Dict, Any, List, Tuple, Optional
from app.core.logging import logger
from app.services.ai_client import AIClient, AIClientError

class IndustryFitResult(tuple):
    def __new__(cls, is_fit: bool, reason: str, insights: Optional[Dict[str, Any]] = None):
        return super().__new__(cls, (is_fit, reason))

    def __init__(self, is_fit: bool, reason: str, insights: Optional[Dict[str, Any]] = None):
        self.is_fit = is_fit
        self.reason = reason
        self.insights = insights or {}

class DiscoveryOptimizer:

    UNIVERSAL_NEGATIVE_KEYWORDS = [
        "directory", "directories", "listing", "listings",
        "yellowpages", "review platform", "aggregator"
    ]

    _city_cache: Dict[str, List[str]] = {}

    @classmethod
    async def get_country_commercial_cities(cls, country: str, limit: int = 50) -> List[str]:
        clean_country = country.strip()
        if not clean_country:
            return []

        # Handle common country typos gracefully
        if clean_country.lower() in ["bangladseh", "bangldesh", "bagladesh", "bangla", "bd"]:
            clean_country = "Bangladesh"

        cache_key = f"{clean_country.lower()}_{limit}"
        if cache_key in cls._city_cache and len(cls._city_cache[cache_key]) > 1:
            return cls._city_cache[cache_key]

        try:
            ai = AIClient(timeout=25.0)
            system_prompt = (
                "You are an expert global geospatial business intelligence engine.\n"
                "Your job is to perform a deep, nationwide commercial territory decomposition for targeted B2B lead generation.\n\n"
                "When given a target country (e.g., Bangladesh, United States, UK, UAE, Germany, etc.):\n"
                "1. Identify all major administrative divisions, states, or provinces of that country.\n"
                "2. For each division/state, decompose it into its most prominent commercial business hubs, upazilas, and high-density business districts / sub-cities.\n"
                "   Example for Bangladesh:\n"
                "   - Dhaka Division: Uttara, Mirpur, Gulshan, Banani, Badda, Motijheel, Dhanmondi, Tejgaon, Gazipur Sadar, Narayanganj Sadar\n"
                "   - Sylhet Division: Sylhet Sadar, Zindabazar, Habiganj, Moulvibazar, Sreemangal, Sunamganj\n"
                "   - Chittagong Division: Agrabad, GEC Circle, Nasirabad, Khatunganj, Cox's Bazar Sadar, Comilla Sadar, Feni\n"
                "   - Rajshahi Division: Rajshahi Sadar, Bogra Sadar, Pabna, Naogaon\n"
                "   - Khulna Division: Khulna Sadar, Jessore Sadar, Kushtia\n"
                "   - Other divisions: Barisal Sadar, Rangpur Sadar, Mymensingh Sadar, Dinajpur\n\n"
                "3. Return a comprehensive, balanced list of up to {limit} localized commercial territories covering every single division and major economic corridor.\n"
                "Format: Return pure JSON with key 'cities': ['Sub-City / Area 1, City 1', 'Sub-City / Area 2, City 2', ...]."
            )
            user_prompt = f"Target Country: {clean_country}\nPerform a deep multi-division, multi-subcity commercial territory decomposition covering the entire nation."
            result = await ai.analyze(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=1200)
            if isinstance(result, dict) and "cities" in result and isinstance(result["cities"], list):
                valid_cities = [str(c).strip() for c in result["cities"] if str(c).strip()]
                if len(valid_cities) > 1:
                    logger.info(f"DiscoveryOptimizer: Deep LLM decomposition for '{clean_country}' produced {len(valid_cities)} sub-city territories.")
                    cls._city_cache[cache_key] = valid_cities[:limit]
                    return valid_cities[:limit]
        except Exception as e:
            logger.warning(f"DiscoveryOptimizer: Dynamic city expansion error: {e}")

        return [clean_country]

    @classmethod
    async def optimize_search_plan(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
        sub_city: str = "",
        sub_areas: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        loc_parts = []
        for p in [sub_city, city, country]:
            p_clean = str(p or "").strip()
            if p_clean and p_clean.lower() not in [x.lower() for x in loc_parts]:
                if any(p_clean.lower() in existing.lower() for existing in loc_parts):
                    continue
                loc_parts.append(p_clean)
        full_loc = ", ".join(loc_parts) if loc_parts else location.strip()
        ind_clean = industry.strip()
        areas_clean = [str(a).strip() for a in (sub_areas or []) if str(a).strip()][:15]

        try:
            ai = AIClient(timeout=12.0)
            system_prompt = (
                "You are an expert B2B Lead Generation Discovery Query Engineer.\n"
                "Your role is to analyze any raw or composite user industry input (e.g. 'Solar, IPS & Generator', 'Dental Clinic & Care', 'HVAC / AC repair') "
                "and decompose it into a comprehensive, high-yield web and social search plan for web crawlers (Brave, Google, DuckDuckGo, Facebook).\n\n"
                "RULES FOR QUERY GENERATION:\n"
                "1. Normalized Sub-Industries: Split composite industries into clean, individual industry keywords (e.g. ['Solar Energy', 'IPS Inverter', 'Generator Supplier']).\n"
                "2. Dynamic Geographic & Spelling Correction: If the user provided a misspelled country or city name (e.g. 'Bnagladesh' -> 'Bangladesh', 'Dhka' -> 'Dhaka', 'Karchi' -> 'Karachi'), automatically correct it into its official proper name in 'normalized_country' and 'normalized_city'. Ensure all search queries use this properly spelled official country and city.\n"
                "3. High-Yield Web Queries: Generate 15 to 25 natural search queries combining each normalized sub-industry with the target city and specified sub-areas.\n"
                "   CRITICAL: NEVER wrap multi-word combinations or whole queries in strict double quotes (\"...\"). Keep them natural so search engines return rich commercial results.\n"
                "4. Social Media Discovery: Include queries targeting commercial Facebook business pages (e.g. 'site:facebook.com solar energy Dhaka', 'site:facebook.com IPS battery Dhaka').\n"
                "5. Directory / OSM Targets: Generate 3 to 5 single-concept directory query strings (e.g. 'Solar Energy', 'Generator', 'Electrical Supplies').\n"
                "6. Positive Keywords: Words indicating legitimate operating commercial businesses/services in these sectors.\n"
                "7. Negative Keywords: Irrelevant noise, retail consumer goods, or unrelated shops to filter out (e.g. tyre, grocery, salon, dental, pharmacy, restaurant, clothes).\n\n"
                "Return pure JSON with keys:\n"
                "- 'normalized_country': string (official proper spelling of the country)\n"
                "- 'normalized_city': string (official proper spelling of the city)\n"
                "- 'normalized_sub_industries': list of strings\n"
                "- 'search_queries': list of 15 to 25 strings\n"
                "- 'osm_queries': list of 3 to 5 strings\n"
                "- 'positive_keywords': list of 6 to 10 strings\n"
                "- 'negative_keywords': list of 10 to 15 strings"
            )
            user_prompt = (
                f"User Industry Input: {ind_clean}\n"
                f"Target Location: {full_loc}\n"
                f"Target City: {city}\n"
                f"Target Country: {country}\n"
                f"Approved Sub-Areas / Neighborhoods: {areas_clean}\n\n"
                f"CRITICAL GEOGRAPHIC ANCHOR: Automatically fix any spelling mistakes in the country/city name, and ensure every search query explicitly contains the properly spelled country and city (e.g. 'Solar company Gulshan Dhaka Bangladesh'). "
                f"Ensure queries strictly target commercial businesses in {full_loc} only."
            )

            result = await ai.analyze(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=850,
            )
            if (
                isinstance(result, dict)
                and "search_queries" in result
                and isinstance(result["search_queries"], list)
                and len(result["search_queries"]) > 0
            ):
                if result.get("normalized_country") and len(str(result["normalized_country"]).strip()) >= 2:
                    country = str(result["normalized_country"]).strip()
                if result.get("normalized_city") and len(str(result["normalized_city"]).strip()) >= 2:
                    city = str(result["normalized_city"]).strip()
                logger.info(f"DiscoveryOptimizer: Successfully generated dynamic LLM search plan for '{ind_clean}' in '{full_loc}'. (Queries: {len(result['search_queries'])})")
                base_negs = [w for w in cls.UNIVERSAL_NEGATIVE_KEYWORDS if w not in ind_clean.lower()]
                neg = list(dict.fromkeys(result.get("negative_keywords", []) + base_negs))
                result["negative_keywords"] = neg
                result["industry"] = ind_clean
                result["location"] = full_loc
                result["city"] = city.strip()
                result["country"] = country.strip()
                result["sub_city"] = sub_city.strip()
                result["sub_areas"] = areas_clean
                if "normalized_sub_industries" not in result or not result["normalized_sub_industries"]:
                    result["normalized_sub_industries"] = [
                        t.strip() for t in re.split(r'[,/|&]|(?:\band\b)', ind_clean, flags=re.IGNORECASE) if len(t.strip()) >= 2
                    ] or [ind_clean]
                return result
        except Exception as e:
            logger.debug(f"DiscoveryOptimizer: LLM optimization fallback: {e}")

        return cls.build_fallback_plan(
            industry=ind_clean,
            location=full_loc,
            country=country,
            city=city,
            sub_city=sub_city,
            sub_areas=areas_clean,
        )

    @classmethod
    def build_fallback_plan(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
        sub_city: str = "",
        sub_areas: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        ind_clean = industry.strip()
        ind_lower = ind_clean.lower()
        loc_parts = []
        for p in [sub_city, city, country]:
            p_clean = str(p or "").strip()
            if p_clean and not any(p_clean.lower() == existing.lower() for existing in loc_parts):
                loc_parts.append(p_clean)
        loc_str = ", ".join(loc_parts) if loc_parts else (location.strip() or f"{city} {country}".strip() or "local")

        city_target = f"{city} {country}".strip() if city.lower() != country.lower() else city.strip()
        if not city_target:
            city_target = loc_str

        # Split composite industries (e.g., 'Solar, IPS & Generator' -> ['Solar', 'IPS', 'Generator'])
        sub_industries = [
            term.strip() for term in re.split(r'[,/|&]|(?:\band\b)', ind_clean, flags=re.IGNORECASE)
            if len(term.strip()) >= 2
        ]
        if not sub_industries:
            sub_industries = [ind_clean]

        queries = []
        osm = []
        pos = []

        areas = [str(a).strip() for a in (sub_areas or []) if str(a).strip()][:10]

        for s_ind in sub_industries:
            pos.append(s_ind.lower())
            pos.append(f"{s_ind.lower()} company")
            pos.append(f"{s_ind.lower()} services")

            osm.append(f"{s_ind} {city_target}".strip())
            osm.append(f"{s_ind} Company {loc_str}".strip())

            queries.append(f"{s_ind} company in {city_target} official website")
            queries.append(f"top {s_ind} firms and suppliers in {city_target}")
            queries.append(f"site:facebook.com {s_ind} {city_target}")

            for a in areas:
                queries.append(f"{s_ind} company in {a}, {city_target}".strip())
                queries.append(f"site:facebook.com {s_ind} {a} {city_target}".strip())

        queries = list(dict.fromkeys(queries))
        osm = list(dict.fromkeys(osm))[:5]
        pos = list(dict.fromkeys(pos))
        neg = [w for w in cls.UNIVERSAL_NEGATIVE_KEYWORDS if w not in ind_lower]

        return {
            "industry": ind_clean,
            "normalized_sub_industries": sub_industries,
            "location": loc_str,
            "country": country.strip(),
            "city": city.strip(),
            "sub_city": sub_city.strip(),
            "sub_areas": areas,
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

        from app.engine.deduplication import DeduplicationEngine
        if DeduplicationEngine.is_generic_platform(domain) or DeduplicationEngine.is_generic_platform(name_lower):
            return False, f"Candidate is a generic platform entity ({name}), not an actual business."
        if DeduplicationEngine.is_directory_or_aggregator(domain, name) or DeduplicationEngine.is_directory_or_aggregator(candidate.get("website") or "", snippet):
            return False, f"Candidate is a directory/aggregator platform ({domain}), not a direct business."
        if any(bad in name_lower for bad in ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "google.com/maps", "twitter.com"]):
            return False, f"Candidate name is a social media / platform URL: '{name}'"

        req_country = (plan.get("country") or "").lower().strip()
        req_location = (plan.get("location") or "").lower().strip()
        req_sub_city = (plan.get("sub_city") or "").lower().strip()
        req_city = (plan.get("city") or "").lower().strip()
        cand_full_loc = f"{cand_address} {snippet} {candidate.get('location', '')}".lower()

        # Strict International Geo-Fencing
        if req_country:
            conflicting_countries = {
                "bangladesh": ["pakistan", "karachi", "lahore", "islamabad", "rawalpindi", "india", "mumbai", "delhi", "kolkata"],
                "pakistan": ["bangladesh", "dhaka", "chittagong", "india", "delhi", "mumbai"],
                "india": ["pakistan", "bangladesh", "karachi", "lahore", "dhaka"],
                "united states": ["uk", "united kingdom", "london", "bangladesh", "pakistan", "india"],
                "united kingdom": ["usa", "united states", "bangladesh", "pakistan", "india"],
            }
            conflicts = conflicting_countries.get(req_country, [])
            for bad_loc in conflicts:
                if re.search(r'\b' + re.escape(bad_loc) + r'\b', cand_full_loc):
                    return False, f"Geographic mismatch: Candidate mentions '{bad_loc}', outside target '{req_country}'"

            # Check phone country codes
            cand_phone = candidate.get("phone") or ""
            clean_digits = re.sub(r'\D', '', cand_phone)
            if req_country == "bangladesh":
                if cand_phone.startswith("+92") or (clean_digits.startswith("92") and len(clean_digits) == 12):
                    return False, "Candidate has a Pakistani phone number (+92), not Bangladesh"
                if cand_phone.startswith("+91") or (clean_digits.startswith("91") and len(clean_digits) == 12):
                    return False, "Candidate has an Indian phone number (+91), not Bangladesh"

        if cand_address and req_sub_city and len(req_sub_city) >= 3:
            if req_sub_city not in cand_full_loc and (req_city and req_city not in cand_full_loc):
                return False, f"Candidate address '{cand_address}' does not match requested area '{req_sub_city}' or city '{req_city}'"
        elif cand_address and req_city and len(req_city) >= 3:
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
            if re.search(r'\b' + re.escape(neg_l) + r'\b', name_lower):
                return False, f"Candidate matched AI negative filter '{neg}': '{name}'"
            if neg_l.replace(" ", "") in domain:
                return False, f"Domain matched AI negative filter '{neg}': '{domain}'"
            if len(neg_l) >= 4 and re.search(r'\b' + re.escape(neg_l) + r'\b', snippet):
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
        page_text_summary: str = "",
        phone: str = "",
        email: str = "",
        location: str = "",
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
        page_text_l = (page_text_summary or "").lower()
        full_text = f"{business_name_l} {domain_l} {page_title_l} {meta_desc_l} {heading_l} {page_text_l}"

        from app.engine.deduplication import DeduplicationEngine
        if DeduplicationEngine.is_generic_platform(domain) or DeduplicationEngine.is_directory_or_aggregator(domain, business_name):
            return IndustryFitResult(False, f"Entity is an aggregator or directory platform: '{domain}'")

        if DeduplicationEngine.is_directory_or_aggregator(f"https://{domain}", page_title):
            return IndustryFitResult(False, f"Page title or domain indicates a directory/aggregator platform: '{page_title}'")

        if negative_keywords:
            for neg in negative_keywords:
                neg_l = neg.lower().strip()
                if len(neg_l) >= 4 and neg_l in full_text:
                    return IndustryFitResult(False, f"Matched dynamic negative filter: '{neg}'")

        # 360-Degree AI Semantic Verification with phone, email, headings & rich offerings
        if ollama_client and (page_title or meta_description or business_name or heading or page_text_summary):
            try:
                system_prompt = (
                    "You are a strict, objective B2B industry classification and commercial intelligence expert. "
                    "Analyze the given business name, domain, verified contacts, territory, website title, headings, and core service summary. "
                    "Determine whether this company is genuinely a direct operating business/firm in the target industry, "
                    "OR if it is a directory, review platform, marketplace, article listicle, job portal, or unrelated business. "
                    "CRITICAL: If it is a directory, aggregator, review site (like GoodFirms, Clutch, Yelp), or blog, return is_relevant: false. "
                    "Also formulate a 1-sentence punchy, personalized outreach pitch highlighting their core offering or key business improvement opportunity. "
                    "Respond ONLY with a JSON object: {\"is_relevant\": true/false, \"reason\": \"<under 10 words>\", \"core_offerings\": \"<under 15 words>\", \"killer_pitch\": \"<1 punchy sentence>\"}"
                )
                user_prompt = (
                    f"Target Industry: {target_industry}\n"
                    f"Business Name: {business_name}\n"
                    f"Domain: {domain or 'No website (Social / Map presence only)'}\n"
                    f"Location / Territory: {location or 'Target Territory'}\n"
                    f"Verified Phone: {phone or 'Not detected'}\n"
                    f"Verified Email: {email or 'Not detected'}\n"
                    f"Website Title: {page_title[:150]}\n"
                    f"Headings: {heading[:180]}\n"
                    f"Website Description: {meta_description[:250]}\n"
                    f"Core Offerings / Page Summary: {page_text_summary[:900]}\n\n"
                    f"Is this entity a direct commercial company in '{target_industry}' (NOT a directory, aggregator, or review portal)?"
                )
                res = await ollama_client.analyze(system_prompt=system_prompt, user_prompt=user_prompt)
                if isinstance(res, dict) and "is_relevant" in res:
                    is_rel = bool(res.get("is_relevant"))
                    reason = res.get("reason", "AI dynamic semantic verification")
                    insights = {
                        "core_offerings": res.get("core_offerings") or "",
                        "killer_pitch": res.get("killer_pitch") or "",
                    }
                    return IndustryFitResult(is_rel, reason, insights)
            except Exception as e:
                logger.debug(f"Dynamic AI semantic verification notice: {e}")

        if ind_phrase and len(ind_phrase) >= 4 and ind_phrase in full_text:
            return IndustryFitResult(True, f"Direct dynamic industry keyword matched: '{ind_phrase}'")
        if ind_clean.replace(" ", "") in domain_l or ind_phrase.replace(" ", "") in domain_l:
            return IndustryFitResult(True, f"Official domain matches industry: '{domain_l}'")

        if positive_keywords:
            for pos in positive_keywords:
                pos_l = pos.lower().strip()
                if len(pos_l) >= 4 and pos_l in full_text:
                    return IndustryFitResult(True, f"Dynamic AI industry keyword matched: '{pos}'")


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
                return IndustryFitResult(True, f"Direct dynamic industry keyword matched: '{tok}'")

        if domain and (page_title or meta_description):
            return IndustryFitResult(True, "General commercial relevance")

        return IndustryFitResult(False, f"Website content has no semantic connection to target industry '{target_industry}'")

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
