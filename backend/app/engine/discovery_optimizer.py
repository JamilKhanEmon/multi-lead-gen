"""
Discovery Optimizer: LLM Query Expansion & Semantic Discovery Filter.
Transforms user fuzzy inputs into high-precision commercial queries,
positive keyword filters, and negative keyword blacklists.
Eliminates unrelated entities (e.g. residential housing societies, retail shops, pharmacies).
"""
import re
import urllib.parse
from typing import Dict, Any, List, Tuple, Optional
from app.core.logging import logger
from app.services.ollama_client import OllamaClient, OllamaClientError


class DiscoveryOptimizer:
    """Optimizes discovery queries and filters candidate businesses."""

    # Universal negative keywords that disqualify non-commercial or irrelevant results
    UNIVERSAL_NEGATIVE_KEYWORDS = [
        "housing society", "residential society", "cooperative society",
        "mess", "hostel", "dormitory", "bachelor mess",
        "pharmacy", "pharma", "medicine store", "medical hall", "drug store", "dispensary",
        "restaurant", "cafe", "bistro", "fast food", "sweetmeat", "sweets", "confectionery", "bakery",
        "salon", "beauty parlour", "barber",
        "grocery", "super shop", "departmental store",
        "school", "college", "kindergarten", "madrasa",
        "graveyard", "cemetery", "mosque", "temple", "church",
        "rent a car", "courier", "parcel", "transport agency",
        "bus stand", "bus stop", "railway station",
    ]

    # Pre-configured taxonomies for common business verticals (instant deterministic fallback)
    INDUSTRY_TAXONOMIES = {
        "real_estate": {
            "keywords": ["estate", "property", "properties", "housing", "land", "realt", "builder", "developer"],
            "search_queries": [
                "top {industry} developer companies in {location} official website",
                "commercial property development firms in {location}",
                "{industry} agency firms {location}",
                "leading real estate developers {location}",
            ],
            "osm_queries": [
                "Real Estate Developer {location}",
                "Real Estate Agency {location}",
                "Property Management {location}",
                "Builders and Developers {location}",
            ],
            "positive_keywords": [
                "real estate", "developer", "realtor", "properties", "holdings",
                "builders", "estate agency", "property management", "land development",
                "commercial property", "housing development",
            ],
            "negative_keywords": [
                "housing society", "residential area", "kallyan samity",
                "hostel", "mess", "pharmacy", "medical hall", "restaurant",
                "cafe", "fast food", "sweets", "confectionery", "clinic",
                "hospital", "salon", "school", "college", "graveyard",
                "mosque", "to let", "flat rent", "room rent", "rent a car",
                "courier", "road no", "lane", "sector", "block",
            ],
        },
        "dental_medical": {
            "keywords": ["dent", "teeth", "ortho", "clinic", "hospital", "doctor", "health", "medic"],
            "search_queries": [
                "specialized {industry} clinic in {location} official website",
                "top {industry} center in {location}",
                "private {industry} healthcare in {location}",
            ],
            "osm_queries": [
                "Dental Clinic {location}",
                "Specialized Clinic {location}",
                "Private Medical Center {location}",
            ],
            "positive_keywords": [
                "dental", "clinic", "hospital", "dentist", "healthcare",
                "orthodontics", "medical center", "surgery", "implant",
            ],
            "negative_keywords": [
                "pharmacy", "medicine store", "medical hall", "gym", "spa",
                "restaurant", "school", "equipment supplier", "veterinary",
            ],
        },
        "legal": {
            "keywords": ["law", "legal", "attorney", "advocate", "barrister", "solicitor"],
            "search_queries": [
                "top corporate law firms in {location} official website",
                "legal associates and attorneys in {location}",
                "barristers and solicitors {location}",
            ],
            "osm_queries": [
                "Law Firm {location}",
                "Legal Associates {location}",
                "Corporate Attorneys {location}",
            ],
            "positive_keywords": [
                "law firm", "advocate", "attorney", "legal services",
                "barrister", "legal consultant", "solicitor", "chambers",
            ],
            "negative_keywords": [
                "police", "court", "jail", "notary stamp", "law book",
                "canteen", "stationary",
            ],
        },
        "tech_software": {
            "keywords": ["software", "tech", "it", "web", "saas", "agency"],
            "search_queries": [
                "software development companies in {location} official website",
                "top IT solutions and tech agencies in {location}",
                "custom software development firms {location}",
            ],
            "osm_queries": [
                "Software Company {location}",
                "IT Solutions {location}",
                "Software Agency {location}",
            ],
            "positive_keywords": [
                "software", "technology", "tech agency", "web development",
                "it solutions", "saas", "software company", "digital agency",
            ],
            "negative_keywords": [
                "computer repair", "hardware shop", "cyber cafe",
                "photocopy", "training institute", "coaching",
            ],
        },
    }

    @classmethod
    async def optimize_search_plan(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
    ) -> Dict[str, Any]:
        """
        Uses LLM (or intelligent fallback) to translate fuzzy user input into:
        - High-precision search queries (for browser & web search)
        - Clean OSM search targets (excluding residential areas)
        - Positive keywords to verify domain relevance
        - Negative keywords to discard noisy/unrelated results
        """
        loc_parts = [p for p in [city, country] if p]
        full_loc = ", ".join(loc_parts) if loc_parts else location.strip()
        ind_clean = industry.strip()

        # Step 1: Try LLM Query Expansion
        try:
            ollama = OllamaClient(timeout=8.0)
            system_prompt = (
                "You are an expert B2B Lead Generation Discovery Query Optimizer.\n"
                "Given a target industry and location, generate precise search queries, OSM directory queries, "
                "positive keywords indicating real commercial businesses, and negative keywords (unrelated retail, "
                "residential neighborhoods, societies, stores) that must be filtered out.\n"
                "Return pure JSON with keys: 'search_queries' (list of 4 strings), 'osm_queries' (list of 3 strings), "
                "'positive_keywords' (list of 6 strings), 'negative_keywords' (list of 10 strings)."
            )
            user_prompt = (
                f"Target Industry: {ind_clean}\n"
                f"Target Location: {full_loc}\n"
                f"Ensure queries target ONLY genuine commercial operating businesses or agencies, NOT residential areas or random shops."
            )

            result = await ollama.analyze(system_prompt=system_prompt, user_prompt=user_prompt)
            if (
                isinstance(result, dict)
                and "search_queries" in result
                and isinstance(result["search_queries"], list)
                and len(result["search_queries"]) > 0
            ):
                logger.info(f"DiscoveryOptimizer: Successfully generated LLM search plan for '{ind_clean}' in '{full_loc}'.")
                # Merge universal negative keywords for safety
                neg = list(set(result.get("negative_keywords", []) + cls.UNIVERSAL_NEGATIVE_KEYWORDS))
                result["negative_keywords"] = neg
                result["industry"] = ind_clean
                result["location"] = full_loc
                return result
        except Exception as e:
            logger.debug(f"DiscoveryOptimizer: LLM optimization fallback to taxonomy: {e}")

        # Step 2: High-Quality Deterministic Taxonomy Fallback
        return cls.build_fallback_plan(industry=ind_clean, location=full_loc, country=country, city=city)

    @classmethod
    def build_fallback_plan(
        cls,
        industry: str,
        location: str = "",
        country: str = "",
        city: str = "",
    ) -> Dict[str, Any]:
        """Constructs an intelligent, deterministic plan for any industry."""
        ind_lower = industry.lower()
        loc_str = location.strip() or f"{city} {country}".strip() or "local"

        matched_tax = None
        for tax_key, tax_data in cls.INDUSTRY_TAXONOMIES.items():
            if any(k in ind_lower for k in tax_data["keywords"]):
                matched_tax = tax_data
                break

        if matched_tax:
            queries = [q.format(industry=industry, location=loc_str) for q in matched_tax["search_queries"]]
            osm = [q.format(location=loc_str) for q in matched_tax["osm_queries"]]
            pos = matched_tax["positive_keywords"]
            neg = list(set(matched_tax["negative_keywords"] + cls.UNIVERSAL_NEGATIVE_KEYWORDS))
        else:
            # Universal fallback for novel/unmapped industries
            queries = [
                f"top {industry} companies in {loc_str} official website",
                f"{industry} firms and services {loc_str}",
                f"leading {industry} agency {loc_str}",
                f"{industry} commercial business {loc_str}",
            ]
            osm = [
                f"{industry} Company {loc_str}",
                f"{industry} Services {loc_str}",
                f"{industry} Agency {loc_str}",
            ]
            pos = [industry.lower(), f"{industry.lower()} services", f"{industry.lower()} company"]
            neg = cls.UNIVERSAL_NEGATIVE_KEYWORDS

        return {
            "industry": industry,
            "location": loc_str,
            "search_queries": queries,
            "osm_queries": osm,
            "positive_keywords": pos,
            "negative_keywords": neg,
        }

    @classmethod
    def validate_candidate(cls, candidate: Dict[str, Any], plan: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Validates if a discovered candidate is genuinely in the target industry.
        Rejects residential housing societies, roads, pharmacies, unrelated retail, etc.
        Returns: (is_valid: bool, rejection_reason: str)
        """
        name = (candidate.get("canonical_name") or candidate.get("name") or "").strip()
        domain = (candidate.get("domain") or candidate.get("website") or "").lower()
        snippet = (candidate.get("snippet") or candidate.get("display_name") or "").lower()
        name_lower = name.lower()

        if len(name) < 3:
            return False, "Business name is too short"

        # Check for generic road/sector/lane addresses mistakenly picked as business names
        if any(name_lower.startswith(p) for p in ["road no", "road #", "road-", "lane no", "sector ", "block ", "avenue ", "plot "]):
            return False, f"Name appears to be an address/street, not a business: '{name}'"

        # Check for exact single generic terms
        generic_terms = {"real estate", "housing", "properties", "clinic", "hospital", "company", "agency", "firm", "store", "shop"}
        if name_lower in generic_terms:
            return False, f"Name is a generic category term: '{name}'"

        # Check negative keywords in name or domain
        negatives = plan.get("negative_keywords", cls.UNIVERSAL_NEGATIVE_KEYWORDS)
        for neg in negatives:
            neg_l = neg.lower()
            if neg_l in name_lower:
                return False, f"Business name contains disqualified term '{neg}': '{name}'"
            if neg_l.replace(" ", "") in domain:
                return False, f"Domain contains disqualified term '{neg}': '{domain}'"

        # If it's a real estate search, ensure it doesn't represent purely residential communities or housing societies
        ind_lower = plan.get("industry", "").lower()
        if any(w in ind_lower for w in ["estate", "property", "housing", "land"]):
            if "society" in name_lower and not any(w in name_lower for w in ["developer", "builder", "realtor", "agency", "holdings"]):
                return False, f"Entity appears to be a residential society/colony, not a commercial developer: '{name}'"

        return True, "Valid commercial entity"
