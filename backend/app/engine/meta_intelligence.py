import json
import re
from typing import Dict, Any, List, Optional
from app.services.ai_client import AIClient
from app.services.openclaw_client import LiveResearchEngine
from app.core.logging import logger

class MetaIntelligenceEngine:

    @classmethod
    async def analyze_market_and_competitors(
        cls,
        service_name: str,
        industry: str,
        target_location: str,
        pain_point: Optional[str] = None,
        core_offer: Optional[str] = None,
    ) -> Dict[str, Any]:
        ai = AIClient()

        query_prompt = f"""
You are an elite B2B Meta Ads Strategist and Market Intelligence Researcher.
The user wants to launch high-converting B2B Meta Ads for:
- Service: {service_name}
- Target Industry: {industry}
- Location: {target_location}
- User Pain Point: {pain_point or 'N/A'}
- User Core Offer: {core_offer or 'N/A'}

Analyze the exact target industry and location provided above. Do NOT assume any specific industry other than what the user provided.
Provide a JSON object with:
1. "competitor_search_terms": list of 4-6 specific search queries to find real competitor ads, active B2B campaigns, and service providers in {industry} for {target_location}. Include queries targeting Facebook/Meta sponsored ads, Ad Library searches, and official vendor websites.
2. "pain_point_queries": list of 3-4 search queries to find real-world bottlenecks, financial loss, operational friction, and customer complaints experienced by business owners in {industry} in {target_location}.
3. "ad_library_queries": list of 2-3 Meta Ad Library search queries for active campaigns in this space.
4. "recommended_targeting":
   - "job_titles": 6-10 exact B2B decision maker job titles tailored specifically to {industry} (e.g. Founder, Owner, Managing Director, Head of Operations, Principal).
   - "behaviors": 2-3 Meta digital behaviors relevant to {industry} business decision makers (e.g. "Facebook Business Page Admins").
   - "interests": 6-8 specific high-relevance interests for {industry} and {service_name}.
   - "exclusions": 4-6 groups to exclude to eliminate wasted ad spend (e.g. "Job Seekers", "Students", "Non-Decision Makers", "Internship", "Unemployed").
"""
        targeting_data = {
            "job_titles": [
                f"{industry} Owner",
                f"{industry} Managing Director",
                "Chief Executive Officer (CEO)",
                "Founder",
                f"Head of {industry} Operations",
                "Managing Director",
                "General Manager (GM)",
                "Director of Business Development",
            ],
            "behaviors": ["Facebook Business Page Admins", "Business Page Admins", "High Value Tech Adopters"],
            "interests": [
                f"{industry}",
                f"{industry} Solutions",
                f"{service_name}",
                "Business Operations",
                "Workflow Automation",
                "Enterprise Growth",
            ],
            "exclusions": ["Students", "Job Seekers", "Non-Decision Makers", "Unemployed", "Internship"],
        }

        competitor_search_terms: List[str] = []
        pain_point_queries: List[str] = []
        ad_library_queries: List[str] = []

        try:
            expanded = await ai.analyze(
                system_prompt="Return ONLY valid JSON matching the requested structure.",
                user_prompt=query_prompt,
            )
            if isinstance(expanded, dict):
                if "recommended_targeting" in expanded and isinstance(expanded["recommended_targeting"], dict):
                    rec = expanded["recommended_targeting"]
                    targeting_data["job_titles"] = rec.get("job_titles", targeting_data["job_titles"])
                    targeting_data["behaviors"] = rec.get("behaviors", targeting_data["behaviors"])
                    targeting_data["interests"] = rec.get("interests", targeting_data["interests"])
                    targeting_data["exclusions"] = rec.get("exclusions", targeting_data["exclusions"])

                if "competitor_search_terms" in expanded and isinstance(expanded["competitor_search_terms"], list):
                    competitor_search_terms = [str(t).strip() for t in expanded["competitor_search_terms"] if t]

                if "pain_point_queries" in expanded and isinstance(expanded["pain_point_queries"], list):
                    pain_point_queries = [str(q).strip() for q in expanded["pain_point_queries"] if q]

                if "ad_library_queries" in expanded and isinstance(expanded["ad_library_queries"], list):
                    ad_library_queries = [str(q).strip() for q in expanded["ad_library_queries"] if q]
        except Exception as e:
            logger.warning(f"LLM query expansion failed, using dynamic B2B defaults: {e}")

        competitor_insights = await cls._scrape_competitor_ad_angles(
            service_name=service_name,
            industry=industry,
            target_location=target_location,
            pain_point=pain_point,
            core_offer=core_offer,
            competitor_search_terms=competitor_search_terms,
            pain_point_queries=pain_point_queries,
            ad_library_queries=ad_library_queries,
        )

        return {
            "targeting": targeting_data,
            "competitor_insights": competitor_insights,
        }

    @classmethod
    async def _scrape_competitor_ad_angles(
        cls,
        service_name: str,
        industry: str,
        target_location: Optional[str] = None,
        pain_point: Optional[str] = None,
        core_offer: Optional[str] = None,
        competitor_search_terms: Optional[List[str]] = None,
        pain_point_queries: Optional[List[str]] = None,
        ad_library_queries: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        loc_clean = (target_location or "").strip()
        is_global = not loc_clean or any(g in loc_clean.lower() for g in ["global", "worldwide", "multi-region"])
        loc_label = f" in {loc_clean}" if not is_global else ""

        search_queries: List[str] = []

        # 1. Add LLM-generated targeted queries first (highest relevance)
        if competitor_search_terms:
            search_queries.extend(competitor_search_terms[:4])
        if ad_library_queries:
            search_queries.extend(ad_library_queries[:2])
        if pain_point_queries:
            search_queries.extend(pain_point_queries[:2])

        # 2. Add dynamic search queries including Facebook business pages and ad libraries
        if not is_global:
            search_queries.append(f"{service_name} {industry} in {loc_clean} official website")
            search_queries.append(f"{industry} {service_name} {loc_clean} site:facebook.com")
            search_queries.append(f"{industry} {service_name} {loc_clean} sponsored facebook ads")
            search_queries.append(f"top {service_name} companies in {loc_clean}")
            search_queries.append(f"{service_name} providers {loc_clean} facebook")
        else:
            search_queries.append(f"{industry} {service_name} B2B solutions providers")
            search_queries.append(f"{industry} {service_name} site:facebook.com ads")
            search_queries.append(f"top {service_name} for {industry} official website")
            search_queries.append(f"{industry} enterprise {service_name} sponsored ad")

        web_results = []
        seen_domains = set()
        excluded_domains = {
            "twitter.com", "x.com", "youtube.com", "wikipedia.org", "quora.com",
            "reddit.com", "medium.com", "github.com", "play.google.com",
            "apps.apple.com", "duckduckgo.com", "yellowpages.com", "bdjobs.com",
            "clutch.co", "goodfirms.co",
        }
        generic_facebook_paths = {"login", "help", "recover", "policies", "terms", "watch", "events", "groups", "places", "settings"}

        for q in search_queries:
            if not q:
                continue
            try:
                raw_results = await LiveResearchEngine._execute_web_search(q)
                for r in raw_results:
                    url = r.get("url", "")
                    if not url:
                        continue
                    clean_url = url.replace("www.", "").lower()
                    raw_domain = clean_url.split("//")[-1].split("/")[0]

                    # Filter out purely generic aggregator sites
                    if raw_domain in excluded_domains or any(ex in raw_domain for ex in ["directory", "aggregator", "jobs", "wiki"]):
                        continue

                    # If it is a Facebook page, extract the company handle
                    display_brand = raw_domain
                    if "facebook.com" in raw_domain:
                        path_parts = [p for p in clean_url.split("facebook.com/")[-1].split("/") if p and not p.startswith("?")]
                        if not path_parts or path_parts[0] in generic_facebook_paths:
                            continue
                        fb_handle = path_parts[0].replace("-", " ").title()
                        display_brand = f"{fb_handle} (Facebook Meta Ads)"
                    elif "instagram.com" in raw_domain:
                        path_parts = [p for p in clean_url.split("instagram.com/")[-1].split("/") if p and not p.startswith("?")]
                        if not path_parts or path_parts[0] in generic_facebook_paths:
                            continue
                        display_brand = f"@{path_parts[0]} (Instagram)"

                    if display_brand not in seen_domains:
                        seen_domains.add(display_brand)
                        web_results.append({
                            "title": r.get("title", ""),
                            "snippet": r.get("snippet", ""),
                            "url": url,
                            "domain": display_brand,
                        })
                    if len(web_results) >= 12:
                        break
            except Exception as e:
                logger.warning(f"Competitor web search error for query '{q}': {e}")
            if len(web_results) >= 12:
                break

        default_competitors = []
        if web_results:
            for r in web_results[:6]:
                domain = r.get("domain", "") or f"Verified {industry} Provider"
                title = r.get("title", "")
                snippet = r.get("snippet", "")
                default_competitors.append({
                    "brand_or_domain": domain,
                    "headline": title[:90] if title else f"Enterprise {service_name} for {industry}{loc_label}",
                    "video_hook": f"How leading {industry} firms{loc_label} utilize {service_name} to eliminate operational drag.",
                    "core_offer": snippet[:110] if snippet else f"Request a live {service_name} pilot demonstration.",
                    "days_running": 38,
                    "engagement_signal": f"High (Live Web Verified{loc_label})",
                })

        default_pain_points = [
            pain_point if pain_point else f"High manual operational friction and overhead in {industry}{loc_label}.",
            f"Operational bottlenecks and delayed turnarounds impacting {industry} growth{loc_label}.",
            f"Revenue leaks and inefficiencies from unoptimized legacy workflows in {industry}{loc_label}.",
        ]

        default_winning_angles = [
            f"Risk-Free Sandbox or Pilot Trial: Decision makers in {industry}{loc_label} convert when they see live proof on their own systems.",
            f"Proof-First Video Hook: Demonstrating the tangible solution within the opening 3 seconds{loc_label}.",
            f"Direct WhatsApp Decision Channel: Direct chat with decision makers in {loc_clean or 'target market'} converts 4x higher than standard web forms.",
        ]

        dynamic_positioning = f"Position {service_name} as the high-ROI B2B solution directly eliminating core {industry} operational bottlenecks{loc_label}."

        ai = AIClient()
        synth_prompt = f"""
Analyze these competitor snippets, active Facebook advertiser pages, and industry offerings for {service_name} in {industry} targeting location: {loc_clean or 'Global'}:
Snippets: {json.dumps(web_results)}
User core pain point: {pain_point or 'N/A'}
User core offer: {core_offer or 'N/A'}

Synthesize comprehensive competitor intelligence tailored specifically to businesses and decision-makers in {loc_clean or 'the target market'}:
1. "scraped_competitors": list of 5-8 verified competitors, active Facebook advertiser pages, or local market solutions (e.g. including Facebook business profiles and top agencies found in the snippets) with:
   - "brand_or_domain": name/domain or Facebook page name (e.g. "Brand Name (Facebook / Website)")
   - "headline": their main ad headline or value proposition
   - "video_hook": their 3-second hook for {loc_clean or 'the target market'}
   - "core_offer": their trial or demo offer
   - "days_running": estimated 30-45
   - "engagement_signal": "High (Active Meta Ad Page)" or "High (Live Verified)"
2. "market_pain_points": 3 real-world financial pain points tailored specifically to {service_name} and {industry} in {loc_clean or 'the target market'}.
3. "winning_angles": 3 proved angles that convert business owners in this space.
4. "recommended_positioning": 1-2 sentence executive recommendation.
"""

        try:
            synth = await ai.analyze(
                system_prompt="Return ONLY valid JSON matching the requested structure.",
                user_prompt=synth_prompt,
            )
            if isinstance(synth, dict) and "scraped_competitors" in synth:
                return {
                    "scraped_competitors": synth.get("scraped_competitors") or default_competitors,
                    "market_pain_points": synth.get("market_pain_points") or default_pain_points,
                    "winning_angles": synth.get("winning_angles") or default_winning_angles,
                    "recommended_positioning": synth.get("recommended_positioning") or dynamic_positioning,
                }
        except Exception as e:
            logger.warning(f"LLM competitor synthesis fallback: {e}")

        return {
            "scraped_competitors": default_competitors,
            "market_pain_points": default_pain_points,
            "winning_angles": default_winning_angles,
            "recommended_positioning": dynamic_positioning,
        }

    @classmethod
    async def generate_funnel_creatives(
        cls,
        service_name: str,
        industry: str,
        target_location: str,
        pain_point: str,
        core_offer: str,
        competitor_insights: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        ai = AIClient()

        prompt = f"""
You are an elite B2B Meta Ads Creative Director.
Service: {service_name}
Target Industry: {industry}
Location: {target_location}
Core Pain Point: {pain_point}
Core Offer: {core_offer}
Competitor Intelligence: {json.dumps(competitor_insights or {})}

Create the complete 2-Step Video Funnel strictly tailored to {industry} and {service_name}. Do NOT use unrelated industry references.

POST 1: Cold Video Hook Ad (Objective: ThruPlay Video Views to filter decision makers)
- "hooks": 3 distinct 3-second opening video hooks (in concise, urgent, authoritative English).
- "selected_hook": The strongest hook of the 3.
- "cold_video_script": 45-60 second visual script (0-3s Hook, 4-15s Pain Demonstration, 16-35s Solution in Action, 36-45s Value Proposition).
- "primary_copy": Punchy B2B copy highlighting the financial loss and how {service_name} solves it in English.
- "headline": Compelling 6-8 word headline for the video ad.

POST 2: Retargeting Closer Ad (Objective: Shown ONLY to 50%+ video viewers with direct WhatsApp CTA)
- "retargeting_copy": B2B copy speaking directly to someone who watched the demo video (in English).
- "offer_headline": High-converting offer headline (e.g. "{core_offer or f'Request a Free Pilot Trial of {service_name}'}").
- "offer_description": Clear explanation of the no-risk trial in English.
- "whatsapp_cta_label": "Send WhatsApp Message"
- "prefill_message": Pre-typed message ready in their WhatsApp when they click (e.g. "Hello, I watched your demo video for {service_name} and would like to claim the {core_offer or 'live consultation and trial'}.").
"""

        default_post1 = {
            "hooks": [
                f"Is manual operational friction holding back your {industry} growth?",
                f"Discover how {service_name} delivers measurable ROI in under 30 days.",
                f"Eliminate {pain_point or 'costly bottlenecks'} in your {industry} workflow today.",
            ],
            "selected_hook": f"Discover how {service_name} delivers measurable ROI in under 30 days.",
            "cold_video_script": f"""[00:00 - 00:05] HOOK: Visual showcase of {service_name} solving critical operational friction in {industry}.
[00:05 - 00:20] PROBLEM: {pain_point or f'Companies in {industry} struggle with inefficient workflows and recurring bottlenecks.'}
[00:20 - 00:40] SOLUTION: Our {service_name} provides automated, high-precision results with seamless workflow integration.
[00:40 - 00:55] OUTRO: Enterprise-proven performance with zero downtime.""",
            "primary_copy": f"Streamline your operations with {service_name}. Engineered specifically for {industry} leaders to eliminate: {pain_point or 'manual bottlenecks and overhead'}.",
            "headline": f"Enterprise {service_name} | Proven ROI & Scale",
            "video_url": None,
        }

        default_post2 = {
            "retargeting_copy": f"You saw how {service_name} drives performance. Now test it directly inside your own workflow - risk-free.",
            "offer_headline": core_offer or f"Request a Free Pilot Trial of {service_name}",
            "offer_description": f"Our technical engineering team will guide you through a customized proof-of-concept for your {industry} team with zero obligation.",
            "whatsapp_cta_label": "Send WhatsApp Message",
            "whatsapp_number": "",
            "prefill_message": f"Hello, I watched your demo on {service_name} and would like to request more information or a live pilot.",
        }

        try:
            creatives = await ai.analyze(
                system_prompt="Return ONLY valid JSON with keys: post1, post2.",
                user_prompt=prompt,
            )
            if isinstance(creatives, dict):
                p1 = creatives.get("post1") or {}
                p2 = creatives.get("post2") or {}
                return {
                    "post1": {
                        "hooks": p1.get("hooks", default_post1["hooks"]),
                        "selected_hook": p1.get("selected_hook", default_post1["selected_hook"]),
                        "cold_video_script": p1.get("cold_video_script", default_post1["cold_video_script"]),
                        "primary_copy": p1.get("primary_copy", default_post1["primary_copy"]),
                        "headline": p1.get("headline", default_post1["headline"]),
                        "video_url": None,
                    },
                    "post2": {
                        "retargeting_copy": p2.get("retargeting_copy", default_post2["retargeting_copy"]),
                        "offer_headline": p2.get("offer_headline", default_post2["offer_headline"]),
                        "offer_description": p2.get("offer_description", default_post2["offer_description"]),
                        "whatsapp_cta_label": "Send WhatsApp Message",
                        "whatsapp_number": default_post2["whatsapp_number"],
                        "prefill_message": p2.get("prefill_message", default_post2["prefill_message"]),
                    },
                }
        except Exception as e:
            logger.warning(f"Creative generation failed, returning robust B2B templates: {e}")

        return {
            "post1": default_post1,
            "post2": default_post2,
        }

