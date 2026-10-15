import json
import uuid
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.config import settings
from app.core.logging import logger
from app.db.session import AsyncSessionLocal
from app.models import (
    Business, BusinessLocation, Evidence, Lead, LeadScore,
    ParameterResult, ResearchRun, ResearchJob,
)
from app.services.openclaw_client import OpenClawClient
from app.services.ai_client import AIClient
from app.engine.deduplication import DeduplicationEngine
from app.engine.parameter_engine import ParameterEngine
from app.engine.evidence_engine import EvidenceEngine
from app.engine.service_matcher import ServiceMatcher
from app.engine.qualification_engine import QualificationEngine
from app.engine.discovery_optimizer import DiscoveryOptimizer
from app.engine.fit_gate import FitGateEngine, is_appointment_niche
import redis.asyncio as aioredis

async def publish_progress_event(event_type: str, data: Dict[str, Any]):
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        payload = {
            "event": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await r.publish("leadgen:events", json.dumps(payload))
        await r.aclose()
    except Exception as e:
        logger.warning(f"Could not publish event to Redis: {e}")

async def handle_discover_businesses(
    task_payload: Dict[str, Any],
    openclaw_client: OpenClawClient,
) -> Dict[str, Any]:
    payload = task_payload.get("payload", {})
    try:
        run_id = uuid.UUID(task_payload["run_id"])
    except Exception:
        logger.error(f"TaskDiscover: Invalid run_id '{task_payload.get('run_id')}'. Aborting.")
        return {"discovered": 0, "enqueued": 0}

    async with AsyncSessionLocal() as session:
        r_chk = await session.execute(select(ResearchRun.status).where(ResearchRun.id == run_id))
        cur_status = r_chk.scalar_one_or_none()
        if cur_status == "CANCELLED":
            logger.info(f"TaskDiscover: Run {run_id} was CANCELLED by admin. Aborting discovery.")
            return {"discovered": 0, "enqueued": 0, "status": "CANCELLED"}

    industry = payload.get("industry", "Business").strip()
    location = payload.get("location", "").strip()
    company_limit = payload.get("company_limit", 0)

    logger.info(f"Running business discovery for {industry} in {location}")

    country = payload.get("country", "").strip()
    city = payload.get("city", "").strip()
    sub_city = payload.get("sub_city", "").strip()

    try:
        discovery_result = await openclaw_client.run_skill(
            skill_name="business-discovery",
            parameters={
                "industry": industry,
                "country": country,
                "city": city,
                "sub_city": sub_city,
                "location": location,
                "company_limit": company_limit,
                "business_type_override": payload.get("business_type_override"),
                "sub_areas": payload.get("sub_areas"),
            },
        )
    except Exception as e:
        logger.warning(f"OpenClaw discovery error on initial query ({e}). Retrying with clean live search...")
        try:
            discovery_result = await openclaw_client.run_skill(
                "business-discovery",
                parameters={
                    "industry": industry,
                    "location": location,
                    "company_limit": company_limit,
                },
            )
        except Exception as retry_e:
            logger.error(f"Live discovery failed after retry: {retry_e}")
            discovery_result = {"discovered_companies": []}

    companies = discovery_result.get("discovered_companies", [])
    logger.info(f"Discovered {len(companies)} candidate companies")

    val_plan = await DiscoveryOptimizer.optimize_search_plan(
        industry=industry,
        location=location,
        country=country,
        city=city,
        sub_city=sub_city,
    )

    candidate_businesses = []
    seen_biz_ids = set()
    async with AsyncSessionLocal() as session:
        for comp in companies:
            raw_name = comp.get("canonical_name", "").strip()
            raw_domain = comp.get("domain") or comp.get("website")
            raw_phone = comp.get("phone")
            raw_fb = comp.get("facebook_url")

            if not raw_name:
                continue

            # Clean and sanitize raw_name against SEO keyword stuffing & runaway titles
            if raw_name.count(",") >= 2 or len(raw_name) > 80:
                if raw_domain and "facebook.com" not in raw_domain:
                    dom_clean = raw_domain.replace("https://", "").replace("http://", "").split("/")[0].replace("www.", "")
                    raw_name = dom_clean.split(".")[0].replace("-", " ").title()
                else:
                    raw_name = raw_name.split(",")[0].split("|")[0].split("-")[0].strip()[:80]
            raw_name = raw_name[:150].strip()

            # Check if this candidate is a social-only business (e.g. found via Facebook page)
            if raw_domain and "facebook.com" in raw_domain.lower():
                if not raw_fb:
                    raw_fb = raw_domain
                raw_domain = None
                comp["website"] = None
                comp["domain"] = None
                comp["facebook_url"] = raw_fb
                comp["is_social_only"] = True

            raw_name_l = raw_name.lower().strip()
            if any(bad in raw_name_l for bad in ["facebook.com", "instagram.com", "google.com", "youtube.com", "linkedin.com", "twitter.com"]) or raw_name_l in ["facebook", "instagram", "google", "meta"]:
                logger.info(f"TaskDiscover: Discarding generic platform candidate '{raw_name}'")
                continue

            if raw_domain and (DeduplicationEngine.is_generic_platform(raw_domain) or DeduplicationEngine.is_directory_or_aggregator(raw_domain, raw_name)):
                logger.info(f"TaskDiscover: Discarding directory/aggregator platform candidate '{raw_name}' ({raw_domain})")
                continue

            is_valid, reason = DiscoveryOptimizer.validate_candidate(comp, val_plan)
            if not is_valid:
                logger.info(f"TaskDiscover: Rejecting candidate '{raw_name}': {reason}")
                continue

            if not raw_domain and not raw_phone and not comp.get("email") and not comp.get("address"):
                logger.info(f"TaskDiscover: Discarding ghost candidate '{raw_name}' due to zero contact channels and no address.")
                continue

            norm_domain = DeduplicationEngine.normalize_domain(raw_domain)
            norm_phone = DeduplicationEngine.normalize_phone(raw_phone)
            clean_email = (comp.get("email") or "").strip()[:200] or None
            clean_address = (comp.get("address") or "").strip() or None
            clean_btype = (comp.get("business_type") or payload.get("business_type_override") or "other")[:90]
            clean_city = (comp.get("city") or city or location or "")[:90] or None
            clean_country = (comp.get("country") or country or "")[:90] or None

            existing_biz = None
            if norm_domain:
                stmt = select(Business).where(Business.domain == norm_domain)
                res = await session.execute(stmt)
                existing_biz = res.scalar_one_or_none()

            if not existing_biz and norm_phone:
                stmt = select(Business).where(Business.phone == norm_phone)
                res = await session.execute(stmt)
                existing_biz = res.scalar_one_or_none()

            if not existing_biz and raw_name:
                stmt = select(Business).where(Business.canonical_name.ilike(raw_name))
                res = await session.execute(stmt)
                existing_biz = res.scalar_one_or_none()

            if not existing_biz:
                biz = Business(
                    canonical_name=raw_name[:200],
                    domain=norm_domain[:200] if norm_domain else None,
                    phone=norm_phone[:45] if norm_phone else None,
                    email=clean_email,
                    address=clean_address,
                    business_type=clean_btype,
                    metadata_json=comp,
                )
                session.add(biz)
                await session.flush()

                if clean_address or location or city or comp.get("latitude") is not None:
                    loc = BusinessLocation(
                        business_id=biz.id,
                        address=clean_address,
                        city=clean_city,
                        country=clean_country,
                        latitude=comp.get("latitude"),
                        longitude=comp.get("longitude"),
                    )
                    session.add(loc)

                target_biz = biz
            else:
                target_biz = existing_biz
                if comp.get("address") and not target_biz.address:
                    target_biz.address = comp.get("address")
                if comp.get("phone") and not target_biz.phone:
                    target_biz.phone = norm_phone
                if comp.get("email") and not target_biz.email:
                    target_biz.email = comp.get("email")
                if isinstance(target_biz.metadata_json, dict):
                    updated_meta = dict(target_biz.metadata_json)
                    for k, v in comp.items():
                        if v and not updated_meta.get(k):
                            updated_meta[k] = v
                    target_biz.metadata_json = updated_meta

            if target_biz.id not in seen_biz_ids:
                seen_biz_ids.add(target_biz.id)
                candidate_businesses.append(target_biz)

        stmt = select(ResearchRun).where(ResearchRun.id == run_id)
        run_res = await session.execute(stmt)
        run = run_res.scalar_one_or_none()
        if run:
            run.discovered_count = len(candidate_businesses)
            run.researched_count = len(candidate_businesses)
            if len(candidate_businesses) == 0:
                run.status = "COMPLETED"
                run.completed_at = datetime.now(timezone.utc)

        await session.commit()

    r = aioredis.from_url(settings.REDIS_URL)
    for biz in candidate_businesses:
        research_job = {
            "job_id": str(uuid.uuid4()),
            "run_id": str(run_id),
            "business_id": str(biz.id),
            "type": "research_and_qualify",
            "depth": task_payload.get("depth", "STANDARD"),
            "attempt": 1,
            "max_attempts": 5,
            "payload": {
                "business_id": str(biz.id),
                "business_name": biz.canonical_name,
                "domain": biz.domain,
                "phone": biz.phone,
                "business_type": biz.business_type,
                "industry": industry,
                "location": location,
                "auto_mail_enabled": payload.get("auto_mail_enabled", True),
                "analyze_website": payload.get("analyze_website", False),
                "use_company_kb": payload.get("use_company_kb", True),
                "positive_keywords": val_plan.get("positive_keywords", []),
                "negative_keywords": val_plan.get("negative_keywords", []),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await r.lpush("leadgen:tasks", json.dumps(research_job))

    await r.aclose()

    await publish_progress_event("discovery_completed", {
        "run_id": str(run_id),
        "discovered": len(companies),
        "enqueued": len(candidate_businesses),
    })

    return {"discovered": len(companies), "enqueued": len(candidate_businesses)}

async def handle_research_and_qualify(
    task_payload: Dict[str, Any],
    openclaw_client: OpenClawClient,
    ollama_client: AIClient,
) -> Dict[str, Any]:
    payload = task_payload.get("payload", {})
    try:
        business_id = uuid.UUID(payload["business_id"])
        run_id = uuid.UUID(task_payload["run_id"])
    except Exception as e:
        logger.warning(f"TaskResearch: Invalid UUID in payload: {e}. Skipping safely.")
        return {"status": "SKIPPED", "reason": "INVALID_UUID"}

    business_name = payload.get("business_name", "Unknown Business")

    async with AsyncSessionLocal() as session:
        r_chk = await session.execute(select(ResearchRun.status).where(ResearchRun.id == run_id))
        cur_status = r_chk.scalar_one_or_none()
        if cur_status == "CANCELLED":
            logger.info(f"TaskResearch: Run {run_id} is CANCELLED by admin. Skipping company '{business_name}'.")
            return {"status": "CANCELLED", "reason": "RUN_CANCELLED"}

    try:
        return await _execute_research_and_qualify(
            task_payload, openclaw_client, ollama_client, business_id, run_id
        )
    except Exception as unhandled_err:
        logger.error(
            f"TaskResearch: Non-fatal error evaluating '{business_name}': {unhandled_err}. "
            "Skipping cleanly to prevent worker crash.",
            exc_info=True,
        )
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(ResearchRun).where(ResearchRun.id == run_id)
                res = await session.execute(stmt)
                run = res.scalar_one_or_none()
                if run and run.status != "CANCELLED":
                    run.failed_count += 1
                    processed = run.qualified_count + run.rejected_count + run.failed_count
                    if processed >= run.discovered_count and run.discovered_count > 0:
                        run.status = "COMPLETED"
                    await session.commit()
        except Exception:
            pass
        return {"status": "SKIPPED", "reason": str(unhandled_err)}

async def _execute_research_and_qualify(
    task_payload: Dict[str, Any],
    openclaw_client: OpenClawClient,
    ollama_client: AIClient,
    business_id: uuid.UUID,
    run_id: uuid.UUID,
) -> Dict[str, Any]:
    payload = task_payload.get("payload", {})
    business_name = payload.get("business_name", "Unknown Business")
    domain = payload.get("domain")
    business_type = payload.get("business_type", "other")
    location = payload.get("location", "Target Market")
    depth = payload.get("depth", "STANDARD").upper()

    logger.info(f"Researching & Qualifying: {business_name} ({business_type}) [Depth: {depth}]")

    analyze_website = payload.get("analyze_website", False)
    current_phone = payload.get("phone")
    current_email = payload.get("email")

    target_url = f"https://{domain}" if domain else None
    website_data = {
        "url": target_url,
        "is_accessible": True if domain else False,
        "title": business_name,
        "extracted_phone": current_phone,
        "extracted_email": current_email,
        "facebook_url": None,
        "instagram_url": None,
        "linkedin_url": None,
        "cms_platform": "Unknown",
        "has_meta_pixel": False,
        "has_google_analytics": False,
        "contact_person": None,
        "contact_title": None,
        "rendered_by": "direct" if domain else "none",
    }

    if analyze_website:
        # Full deep technical website audit mode (when user explicitly checked the box)
        if not domain and business_name:
            try:
                from app.services.openclaw_client import LiveResearchEngine
                resolved_dom = await LiveResearchEngine.resolve_domain_for_business(business_name, location)
                if resolved_dom:
                    domain = resolved_dom
                    logger.info(f"Resolved live domain for {business_name}: {domain}")
            except Exception as e:
                logger.debug(f"Domain resolution error for {business_name}: {e}")

        if domain:
            target_url = f"https://{domain}"
            try:
                website_data = await openclaw_client.run_skill(
                    "website-research",
                    {"url": target_url, "canonical_name": business_name, "location": location}
                )
            except Exception as e:
                logger.warning(f"OpenClaw website research fallback for {domain}: {e}")
    else:
        # Social & Software Demo Mode: Skip heavy technical audit, but ALWAYS fetch lightweight contact info for cross-verification!
        if domain:
            logger.info(f"TaskResearch: Fetching official website contact info for multi-source cross-verification ('{business_name}')...")
            try:
                light_data = await openclaw_client.run_skill(
                    "website-research",
                    {"url": f"https://{domain}", "canonical_name": business_name, "location": location, "lightweight": True}
                )
                if light_data.get("extracted_phone"):
                    website_data["extracted_phone"] = light_data["extracted_phone"]
                if light_data.get("extracted_email"):
                    website_data["extracted_email"] = light_data["extracted_email"]
                if light_data.get("extracted_address"):
                    website_data["extracted_address"] = light_data["extracted_address"]
                for k in ["facebook_url", "instagram_url", "linkedin_url", "has_whatsapp"]:
                    if light_data.get(k) is not None:
                        website_data[k] = light_data[k]
            except Exception as e:
                logger.debug(f"Lightweight contact check notice for {domain}: {e}")


    current_phone = website_data.get("extracted_phone") or payload.get("phone")
    current_email = website_data.get("extracted_email") or payload.get("email")

    if not domain and (not current_phone or not current_email):
        logger.info(f"TaskResearch: Missing direct contacts for '{business_name}'. Initiating live contact hunt...")
        from app.services.openclaw_client import LiveResearchEngine
        deep_hunt = await LiveResearchEngine.deep_contact_hunt(
            canonical_name=business_name,
            domain=domain,
            location=location,
            existing_phone=current_phone,
            existing_email=current_email,
            facebook_url=website_data.get("facebook_url"),
        )
        if deep_hunt.get("phone") and not current_phone:
            website_data["extracted_phone"] = deep_hunt["phone"]
            logger.info(f"TaskResearch: Discovered phone on deep retry for '{business_name}': {deep_hunt['phone']}")
        if deep_hunt.get("email") and not current_email:
            website_data["extracted_email"] = deep_hunt["email"]
            logger.info(f"TaskResearch: Discovered email on deep retry for '{business_name}': {deep_hunt['email']}")

    maps_query = urllib.parse.quote(f"{business_name} {location}")
    gmaps_url = f"https://www.google.com/maps/search/{maps_query}"
    gsearch_url = f"https://www.google.com/search?q={maps_query}"

    social_res: Dict[str, Any] = {}
    ads_res: Dict[str, Any] = {}
    reviews_res: Dict[str, Any] = {}

    # 1. LIVE SOCIAL RESEARCH (Facebook page, post recency & dormancy)
    try:
        social_res = await openclaw_client.run_skill(
            "social-research",
            {
                "canonical_name": business_name,
                "domain": domain,
                "facebook_url": website_data.get("facebook_url"),
                "location": location,
            }
        )
        if social_res.get("facebook_url") and not website_data.get("facebook_url"):
            website_data["facebook_url"] = social_res["facebook_url"]
        website_data["social_is_dormant"] = social_res.get("is_dormant", False)
        website_data["social_post_recency"] = social_res.get("post_recency_text")
        if social_res.get("evidence_text"):
            website_data["social_evidence"] = social_res["evidence_text"]
    except Exception as e:
        logger.debug(f"Live social research notice for {business_name}: {e}")

    # 2. LIVE ADS RESEARCH (Meta Ad Library Proof)
    try:
        ads_res = await openclaw_client.run_skill(
            "ads-research",
            {
                "canonical_name": business_name,
                "domain": domain,
                "has_meta_pixel": website_data.get("has_meta_pixel", False),
            }
        )
        if ads_res.get("meta_ads_url"):
            website_data["meta_ads_url"] = ads_res["meta_ads_url"]
    except Exception as e:
        logger.debug(f"Live ads research notice for {business_name}: {e}")

    # 3. LIVE REVIEWS & MAPS RESEARCH
    raw_rating = payload.get("rating") or payload.get("rating_score")
    raw_reviews = payload.get("review_count") or payload.get("reviews_count")
    try:
        reviews_res = await openclaw_client.run_skill(
            "review-research",
            {
                "business_name": business_name,
                "location": location,
                "rating": float(raw_rating) if raw_rating else None,
                "review_count": int(raw_reviews) if raw_reviews else None,
            }
        )
        if reviews_res.get("google_maps_url"):
            website_data["google_maps_url"] = reviews_res["google_maps_url"]
    except Exception as e:
        logger.debug(f"Live review research notice for {business_name}: {e}")

    # 4-Way Multi-Source Cross-Verification Consensus
    discovery_contact = {
        "phone": payload.get("phone"),
        "email": payload.get("email"),
        "address": payload.get("address"),
        "source_url": website_data.get("google_maps_url") or gmaps_url,
    }
    website_contact = {
        "extracted_phone": website_data.get("extracted_phone"),
        "extracted_email": website_data.get("extracted_email"),
        "extracted_address": website_data.get("extracted_address"),
        "has_whatsapp": website_data.get("has_whatsapp", False),
        "source_url": target_url if target_url else (f"https://{domain}" if domain else None),
    }
    social_contact = {
        "phone": social_res.get("phone") if isinstance(social_res, dict) else None,
        "whatsapp_phone": social_res.get("whatsapp_phone") if isinstance(social_res, dict) else None,
        "email": social_res.get("email") if isinstance(social_res, dict) else None,
        "address": social_res.get("address") if isinstance(social_res, dict) else None,
        "source_url": website_data.get("facebook_url"),
    }
    contact_consensus = EvidenceEngine.resolve_contact_consensus(
        discovery_contact=discovery_contact,
        website_contact=website_contact,
        social_contact=social_contact,
        target_domain=domain,
    )
    if contact_consensus.get("primary_phone"):
        current_phone = contact_consensus["primary_phone"]
        website_data["extracted_phone"] = current_phone
    if contact_consensus.get("primary_email"):
        current_email = contact_consensus["primary_email"]
        website_data["extracted_email"] = current_email

    evidence_records = [
        {
            "parameter_id": 1,
            "source_url": website_data.get("google_maps_url") or gmaps_url,
            "source_type": "google_maps",
            "evidence_text": f"Verified public commercial listing indexed in Google Maps & Business Profile for target market ({location}). Proof: {website_data.get('google_maps_url') or gmaps_url}",
            "status": "PASS",
            "classification": "OBSERVABLE",
            "confidence": 0.95,
            "recency_weight": 100,
        }
    ]

    if contact_consensus.get("phone_verified"):
        sources_label = " + ".join(contact_consensus.get("phone_sources", []))
        evidence_records.append({
            "parameter_id": 1,
            "source_url": website_data.get("facebook_url") or website_data.get("google_maps_url") or gmaps_url,
            "source_type": "consensus",
            "evidence_text": f"Multi-source verified telephone ({contact_consensus['primary_phone']}) cross-confirmed on {sources_label}. High reachability.",
            "status": "STRONG",
            "classification": "OBSERVABLE",
            "confidence": 1.0,
            "recency_weight": 100,
        })

    fb_target = website_data.get("facebook_url")
    if fb_target:
        if website_data.get("social_is_dormant"):
            evidence_records.append({
                "parameter_id": 1,
                "source_url": fb_target,
                "source_type": "social",
                "evidence_text": f"Public Facebook page verified at {fb_target}. Profile is dormant with zero recent posts detected ({website_data.get('social_post_recency') or 'no recent activity'}). Proof: {fb_target}",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "recency_weight": 100,
            })
        else:
            evidence_records.append({
                "parameter_id": 1,
                "source_url": fb_target,
                "source_type": "social",
                "evidence_text": f"Verified active Facebook page at {fb_target} ({website_data.get('social_post_recency') or 'active posts'}). Inbound inquiries require automated CRM tracking. Proof: {fb_target}",
                "status": "PASS",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "recency_weight": 100,
            })

    if website_data.get("meta_ads_url"):
        evidence_records.append({
            "parameter_id": 2,
            "source_url": website_data["meta_ads_url"],
            "source_type": "ad_registry",
            "evidence_text": f"Meta Ad Library transparency check: {website_data['meta_ads_url']}",
            "status": "PASS" if website_data.get("has_meta_pixel") else "STRONG",
            "classification": "OBSERVABLE",
            "confidence": 0.90,
            "recency_weight": 100,
        })

    detected_pids = []

    if analyze_website:
        if website_data.get("mobile_responsive") is False:
            detected_pids.append(37)
            evidence_records.append({
                "parameter_id": 37,
                "source_url": f"https://{domain}",
                "source_type": "website",
                "evidence_text": "Public website layout breaks on mobile viewports; horizontal scrolling observed.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "recency_weight": 100,
            })

        if website_data.get("has_whatsapp") is False:
            detected_pids.append(43)
            evidence_records.append({
                "parameter_id": 43,
                "source_url": f"https://{domain}/contact",
                "source_type": "website",
                "evidence_text": "No click-to-WhatsApp link or widget found on public website.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.90,
                "recency_weight": 100,
            })

        if website_data.get("has_online_booking") is False and is_appointment_niche(business_type, business_name):
            detected_pids.append(44)
            evidence_records.append({
                "parameter_id": 44,
                "source_url": f"https://{domain}",
                "source_type": "website",
                "evidence_text": "No automated appointment scheduling system found on public portal.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.88,
                "recency_weight": 100,
            })

        if website_data.get("broken_links_count", 0) > 1:
            detected_pids.append(36)
            evidence_records.append({
                "parameter_id": 36,
                "source_url": f"https://{domain}",
                "source_type": "website",
                "evidence_text": f"Outdated web assets detected with {website_data.get('broken_links_count')} broken link references.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.92,
                "recency_weight": 100,
            })
    else:
        # Social & Software Demo Mode: If no website, highlight opportunity to launch branded web portal
        if not domain:
            detected_pids.append(34)
            evidence_records.append({
                "parameter_id": 34,
                "source_url": gmaps_url,
                "source_type": "social_directory",
                "evidence_text": f"No official standalone website detected: {business_name} relies on social media and local listings.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "recency_weight": 100,
            })


    if not website_data.get("extracted_phone") and not payload.get("phone"):
        detected_pids.append(41)
        evidence_records.append({
            "parameter_id": 41,
            "source_url": f"https://{domain}/contact" if domain else gsearch_url,
            "source_type": "website",
            "evidence_text": f"No clickable phone number or direct telephone line found on public portal for {business_name}.",
            "status": "STRONG",
            "classification": "OBSERVABLE",
            "confidence": 0.92,
            "recency_weight": 100,
        })

    if not website_data.get("extracted_email") and not website_data.get("has_contact_form"):
        detected_pids.append(42)
        evidence_records.append({
            "parameter_id": 42,
            "source_url": f"https://{domain}/contact" if domain else gsearch_url,
            "source_type": "website",
            "evidence_text": "No direct public contact email or web inquiry form detected on corporate website.",
            "status": "STRONG",
            "classification": "OBSERVABLE",
            "confidence": 0.90,
            "recency_weight": 100,
        })

    fb_url = website_data.get("facebook_url")
    li_url = website_data.get("linkedin_url")
    ig_url = website_data.get("instagram_url")

    if not fb_url and not li_url and not ig_url and domain:
        detected_pids.append(11)
        evidence_records.append({
            "parameter_id": 11,
            "source_url": f"https://{domain}",
            "source_type": "website",
            "evidence_text": "No linked official social media presence (Facebook, LinkedIn, Instagram) detected across public website.",
            "status": "STRONG",
            "classification": "OBSERVABLE",
            "confidence": 0.91,
            "recency_weight": 100,
        })
    elif fb_url or li_url:
        detected_pids.append(1)
        evidence_records.append({
            "parameter_id": 1,
            "source_url": fb_url or li_url,
            "source_type": "social",
            "evidence_text": f"Verified official social presence discovered at {fb_url or li_url}.",
            "status": "PASS",
            "classification": "OBSERVABLE",
            "confidence": 0.95,
            "recency_weight": 100,
        })

    if analyze_website:
        if website_data.get("has_meta_pixel") is False and website_data.get("is_accessible"):
            detected_pids.append(5)
            evidence_records.append({
                "parameter_id": 5,
                "source_url": f"https://{domain}" if domain else gsearch_url,
                "source_type": "website",
                "evidence_text": "No Meta (Facebook/Instagram) retargeting pixel detected in public website source code.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.93,
                "recency_weight": 100,
            })

        if website_data.get("has_google_analytics") is False and website_data.get("is_accessible"):
            detected_pids.append(47)
            evidence_records.append({
                "parameter_id": 47,
                "source_url": f"https://{domain}" if domain else gsearch_url,
                "source_type": "website",
                "evidence_text": "No Google Analytics (GA4) visitor tracking detected in public website source code.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.90,
                "recency_weight": 100,
            })

        if not domain or website_data.get("is_accessible") is False:
            detected_pids.append(34)
            evidence_records.append({
                "parameter_id": 34,
                "source_url": f"https://{domain}" if domain else gsearch_url,
                "source_type": "website",
                "evidence_text": f"No active public website or web portal detected for {business_name} in target market ({location})." if not domain else f"Public website domain for {business_name} timed out or failed to resolve HTTP requests.",
                "status": "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "recency_weight": 100,
            })
    else:
        # Social Presence & Google Maps Mode: Check Maps rating score and social communication
        raw_r = payload.get("rating") or payload.get("rating_score")
        if raw_r is not None:
            detected_pids.append(2)
            evidence_records.append({
                "parameter_id": 2,
                "source_url": gmaps_url,
                "source_type": "google_maps",
                "evidence_text": f"Google Maps rating recorded at {raw_r}★ for {business_name}.",
                "status": "PASS" if float(raw_r) >= 4.0 else "STRONG",
                "classification": "OBSERVABLE",
                "confidence": 0.95,
                "recency_weight": 100,
            })

    try:
        ollama_analysis = await ollama_client.analyze(
            system_prompt="You are a B2B business gap analyst. Evaluate public evidence and suggest service matches.",
            user_prompt=f"Company: {business_name}, Type: {business_type}. Signals: {json.dumps(website_data)}",
        )
    except Exception as e:
        logger.warning(f"AI inference notice: {e}")
        ollama_analysis = {"service_matches": []}

    llm_suggestions = ollama_analysis.get("service_matches", [])

    active_params = ParameterEngine.get_active_parameters(business_type)
    relevant_detected = [p for p in detected_pids if p in active_params]

    ev_eval = EvidenceEngine.evaluate_parameter_evidence(evidence_records)
    evidence_level = ev_eval["evidence_level"]
    avg_confidence = ev_eval["average_confidence"]
    max_recency = ev_eval["max_recency"] if ev_eval["max_recency"] > 0 else (100 if evidence_records else 0)
    has_conflict = ev_eval["conflict"]
    sources_cnt = ev_eval["independent_sources_count"]

    service_matches = ServiceMatcher.match_services(
        detected_parameter_ids=relevant_detected,
        llm_service_suggestions=llm_suggestions,
    )
    if service_matches:
        best_service = service_matches[0]
        best_service_fit = round(best_service["hybrid_score"] * 100.0, 2)
        best_service_name = best_service.get("service_slug", "website-modernization")
        gap_summary = (
            best_service["rationales"][0]
            if best_service.get("rationales")
            else f"Detected solvable friction across {len(relevant_detected)} operational parameters."
        )
    else:
        best_service = None
        best_service_fit = 0.0
        best_service_name = "none"
        gap_summary = (
            f"No solvable operational gaps identified for {business_name}."
            if not relevant_detected
            else f"Identified issues do not align with agency service capabilities."
        )

    target_ind = business_type or payload.get("industry") or "Commercial"
    is_industry_fit, fit_reason = await DiscoveryOptimizer.verify_industry_fit(
        target_industry=target_ind,
        business_name=business_name,
        domain=domain or "",
        page_title=website_data.get("page_title") or website_data.get("title") or "",
        meta_description=website_data.get("meta_description") or "",
        heading=website_data.get("heading") or "",
        positive_keywords=payload.get("positive_keywords"),
        negative_keywords=payload.get("negative_keywords"),
        ollama_client=ollama_client,
    )
    if not is_industry_fit:
        logger.warning(f"Industry Gate: Entity '{business_name}' failed relevance check for '{target_ind}': {fit_reason}")

    is_relevant = len(relevant_detected) > 0 and is_industry_fit
    has_inferable = any(e.get("classification") == "INFERABLE" for e in evidence_records)
    has_contact = bool(
        (website_data.get("extracted_phone") or payload.get("phone"))
        or (website_data.get("extracted_email") or payload.get("email"))
    )
    has_email = bool(website_data.get("extracted_email") or payload.get("email"))

    effective_ev_level = evidence_level if analyze_website else max(evidence_level, 2)
    effective_sf_score = best_service_fit if (analyze_website and service_matches) else 75.0
    effective_is_relevant = is_industry_fit if not analyze_website else is_relevant

    passed_gates, gate_failures = QualificationEngine.evaluate_gates(
        max_evidence_level=effective_ev_level,
        max_recency=max(max_recency, 80),
        is_relevant_to_business_type=effective_is_relevant,
        best_service_fit_score=effective_sf_score,
        inferable_sources_count=max(sources_cnt, 2),
        has_primary_conflict=has_conflict,
        has_inferable_gaps=has_inferable,
        has_direct_contact=has_contact,
        is_industry_verified=is_industry_fit,
        industry_mismatch_reason=fit_reason if not is_industry_fit else "",
    )

    eq_score = avg_confidence * 100.0 if analyze_website else 85.0
    pr_score = 85.0 if effective_is_relevant else 0.0
    rep_score = min(100.0, len(evidence_records) * 25.0) if analyze_website else 75.0
    rec_score = float(max(max_recency, 85))
    bi_score = 70.0 if is_industry_fit else 0.0
    sf_score = effective_sf_score if is_industry_fit else 0.0

    raw_calc_score = QualificationEngine.calculate_score(
        evidence_quality=eq_score,
        problem_relevance=pr_score,
        problem_repetition=rep_score,
        recency=rec_score,
        business_impact=bi_score,
        service_fit=sf_score,
    )

    # Calibrated score: without verified email, cap at 74.0 and cannot reach Strong Potential
    if not has_email:
        final_score = min(74.0, raw_calc_score)
    else:
        final_score = raw_calc_score

    tier = QualificationEngine.assign_tier(final_score, passed_gates, has_direct_contact=has_email)
    if tier == "Rejected" and is_industry_fit and has_contact:
        tier = "Review Needed"
    is_qualified = tier in ("Strong Potential", "Review Needed")
    logger.info(f"Qualified {business_name}: score={final_score}, tier={tier}, passed_gates={passed_gates}, failures={gate_failures}")

    explanation = QualificationEngine.generate_explanation(
        company_name=business_name,
        gap_summary=gap_summary,
        evidence_level=evidence_level,
        sources_count=sources_cnt,
        recency=max_recency,
        best_service_name=best_service_name,
        tier=tier,
        gate_failures=gate_failures,
    )

    async with AsyncSessionLocal() as session:
        stmt = select(Business).where(Business.id == business_id)
        biz_res = await session.execute(stmt)
        biz_obj = biz_res.scalar_one_or_none()
        if biz_obj:
            if domain and not biz_obj.domain:
                biz_obj.domain = domain

            # Apply 4-Way Cross-Verification Contact Consensus
            if contact_consensus.get("primary_phone"):
                biz_obj.phone = contact_consensus["primary_phone"]
            elif website_data.get("extracted_phone"):
                biz_obj.phone = website_data.get("extracted_phone")
            elif not biz_obj.phone and payload.get("phone"):
                biz_obj.phone = payload.get("phone")

            if contact_consensus.get("primary_email"):
                biz_obj.email = contact_consensus["primary_email"]
            elif website_data.get("extracted_email"):
                biz_obj.email = website_data.get("extracted_email")
            elif not biz_obj.email and payload.get("email"):
                biz_obj.email = payload.get("email")

            if contact_consensus.get("verified_address") and not biz_obj.address:
                biz_obj.address = contact_consensus["verified_address"]

            if website_data.get("contact_person"):
                biz_obj.contact_person = website_data.get("contact_person")
            if website_data.get("contact_title"):
                biz_obj.contact_title = website_data.get("contact_title")
            if website_data.get("linkedin_url"):
                biz_obj.linkedin_url = website_data.get("linkedin_url")

            current_meta = dict(biz_obj.metadata_json or {})
            for key in ["cms_platform", "has_meta_pixel", "has_google_analytics", "meta_ads_url", "rendered_by"]:
                if website_data.get(key) is not None:
                    current_meta[key] = website_data[key]

            # Save multi-source contact consensus metadata
            current_meta["contact_consensus"] = {
                "phone_verified": contact_consensus.get("phone_verified", False),
                "phone_sources": contact_consensus.get("phone_sources", []),
                "secondary_phone": contact_consensus.get("secondary_phone"),
                "whatsapp_phone": contact_consensus.get("whatsapp_phone"),
                "email_verified": contact_consensus.get("email_verified", False),
                "email_sources": contact_consensus.get("email_sources", []),
                "secondary_email": contact_consensus.get("secondary_email"),
                "confidence_score": contact_consensus.get("confidence_score", 0.5),
            }
            if contact_consensus.get("secondary_phone"):
                current_meta["secondary_phone"] = contact_consensus["secondary_phone"]
            if contact_consensus.get("whatsapp_phone"):
                current_meta["whatsapp_phone"] = contact_consensus["whatsapp_phone"]

            biz_obj.metadata_json = current_meta

        param_ids_in_evidence = {ev["parameter_id"] for ev in evidence_records if ev.get("parameter_id")}
        valid_param_ids = set()
        if param_ids_in_evidence:
            from app.models.parameter import Parameter
            p_stmt = select(Parameter.id).where(Parameter.id.in_(param_ids_in_evidence))
            p_res = await session.execute(p_stmt)
            valid_param_ids = set(p_res.scalars().all())

        for ev in evidence_records:
            pid = ev.get("parameter_id")
            if pid not in valid_param_ids:
                logger.warning(f"TaskResearch: Skipping evidence item: parameter_id {pid} not present in 'parameters' table.")
                continue
            ev_model = Evidence(
                business_id=business_id,
                parameter_id=pid,
                evidence_text=ev["evidence_text"],
                status=ev["status"],
                classification=ev["classification"],
                confidence=ev["confidence"],
                recency_weight=ev["recency_weight"],
                conflict=False,
            )
            session.add(ev_model)

        valid_run_id = None
        if run_id:
            stmt_check_run = select(ResearchRun.id).where(ResearchRun.id == run_id)
            run_check_res = await session.execute(stmt_check_run)
            if run_check_res.scalar_one_or_none():
                valid_run_id = run_id

        stmt_lead = select(Lead).where(Lead.business_id == business_id)
        lead_res = await session.execute(stmt_lead)
        lead = lead_res.scalar_one_or_none()
        auto_mail = payload.get("auto_mail_enabled", True)
        has_email = bool(biz_obj and biz_obj.email)
        target_outreach_status = "READY_FOR_OUTREACH" if auto_mail else "HOLD"

        if not is_industry_fit or tier == "Rejected":
            logger.info(
                f"TaskResearch: Discarding unqualified business '{business_name}' "
                f"(Industry fit: {is_industry_fit}, Tier: {tier}, Reason: {fit_reason}). Not adding to leads."
            )
            if valid_run_id:
                stmt_run = select(ResearchRun).where(ResearchRun.id == valid_run_id)
                r_res = await session.execute(stmt_run)
                run = r_res.scalar_one_or_none()
                if run:
                    run.rejected_count += 1
                    processed = run.qualified_count + run.rejected_count + run.failed_count
                    if processed >= run.discovered_count and run.discovered_count > 0:
                        run.status = "COMPLETED"
            await session.commit()
            return {"status": "REJECTED", "business_id": str(business_id), "reason": fit_reason}

        use_kb = payload.get("use_company_kb", True)
        kb_dict = await FitGateEngine.fetch_active_kb_dict(session) if use_kb else None

        gate_res = FitGateEngine.evaluate_candidate(
            business_name=business_name,
            domain=domain,
            phone=payload.get("phone") or (website_data.get("extracted_phone") if website_data else None),
            email=payload.get("email") or (website_data.get("extracted_email") if website_data else None),
            business_type=business_type,
            city=payload.get("city") or "Dhaka",
            audit_res=website_data,
            detected_weaknesses=[e["evidence_text"] for e in evidence_records if e.get("evidence_text")],
            metadata_json=payload,
            company_kb=kb_dict,
            use_company_kb=use_kb,
            analyze_website=analyze_website,
        )

        if gate_res.get("fit_tier") == "DROPPED":
            logger.info(f"TaskResearch: Fit gate DROPPED '{business_name}'. Not adding to leads.")
            if valid_run_id:
                stmt_run = select(ResearchRun).where(ResearchRun.id == valid_run_id)
                r_res = await session.execute(stmt_run)
                run = r_res.scalar_one_or_none()
                if run:
                    run.rejected_count += 1
            await session.commit()
            return {"status": "REJECTED", "business_id": str(business_id), "reason": "DROPPED by fit gate"}

        import re
        raw_gaps = gate_res.get("verified_gaps", [])
        clean_gaps = [re.sub(r"\s*\[Proof Link:[^\]]*\]", "", str(g)).strip() for g in raw_gaps]

        if isinstance(explanation, dict):
            explanation["verified_gaps"] = clean_gaps
            explanation["inferred_opportunities"] = gate_res.get("inferred_opportunities", [])
            explanation["recommended_services"] = gate_res.get("recommended_services", [])
            explanation["matched_service_url"] = gate_res.get("matched_service_url", "")

        lead_primary_gap = " • ".join(clean_gaps[:2]) if clean_gaps else gap_summary
        lead_primary_gap = re.sub(r"\s*\[Proof Link:[^\]]*\]", "", str(lead_primary_gap)).strip()

        if is_qualified and has_email and isinstance(explanation, dict):
            try:
                from app.engine.outreach_engine import OutreachEngine
                draft_subj, draft_body = await OutreachEngine.render_email(
                    step=1,
                    lead_data={
                        "company_name": biz.canonical_name if biz else "Your Team",
                        "contact_person": biz.contact_person if biz else None,
                        "city": biz.address if biz else "",
                        "website": getattr(biz, "domain", "") if biz else "",
                        "industry": biz.business_type if biz else "Commercial Entity",
                        "primary_gap": lead_primary_gap,
                        "why_they_need_us": gate_res.get("why_they_need_us") or lead_primary_gap,
                        "what_they_need": gate_res.get("what_they_need") or "",
                        "matched_service": gate_res.get("matched_service") or "",
                    }
                )
                explanation["outreach_draft"] = {
                    "subject": draft_subj,
                    "body": draft_body,
                    "full_email": f"Subject: {draft_subj}\n\n{draft_body}",
                    "is_llm_generated": True,
                }
            except Exception as e:
                logger.warning(f"Worker outreach draft generation: {e}")

        if lead:
            lead.run_id = valid_run_id
            lead.tier = tier
            lead.final_score = final_score
            lead.is_qualified = is_qualified
            lead.primary_gap_summary = lead_primary_gap
            lead.explanation_json = explanation
            lead.fit_tier = gate_res["fit_tier"]
            lead.why_they_need_us = gate_res["why_they_need_us"]
            lead.what_they_need = gate_res["what_they_need"]
            lead.matched_service = gate_res["matched_service"]
            lead.discovery_call_script = gate_res["discovery_call_script"]
            if is_qualified and has_email and lead.outreach_status in ("PENDING", "HOLD"):
                lead.outreach_status = target_outreach_status
        else:
            initial_outreach = target_outreach_status if (is_qualified and has_email) else "PENDING"
            lead = Lead(
                business_id=business_id,
                run_id=valid_run_id,
                tier=tier,
                final_score=final_score,
                is_qualified=is_qualified,
                primary_gap_summary=lead_primary_gap,
                explanation_json=explanation,
                outreach_status=initial_outreach,
                fit_tier=gate_res["fit_tier"],
                why_they_need_us=gate_res["why_they_need_us"],
                what_they_need=gate_res["what_they_need"],
                matched_service=gate_res["matched_service"],
                discovery_call_script=gate_res["discovery_call_script"],
            )
            session.add(lead)
            await session.flush()

        stmt = select(LeadScore).where(LeadScore.lead_id == lead.id)
        score_res = await session.execute(stmt)
        score_record = score_res.scalar_one_or_none()
        if score_record:
            score_record.evidence_quality = eq_score
            score_record.problem_relevance = pr_score
            score_record.problem_repetition = rep_score
            score_record.recency = rec_score
            score_record.business_impact = bi_score
            score_record.service_fit = sf_score
            score_record.final_score = final_score
        else:
            score_record = LeadScore(
                lead_id=lead.id,
                evidence_quality=eq_score,
                problem_relevance=pr_score,
                problem_repetition=rep_score,
                recency=rec_score,
                business_impact=bi_score,
                service_fit=sf_score,
                final_score=final_score,
            )
            session.add(score_record)

        if valid_run_id:
            stmt = select(ResearchRun).where(ResearchRun.id == valid_run_id)
            r_res = await session.execute(stmt)
            run = r_res.scalar_one_or_none()
            if run:
                if is_qualified:
                    run.qualified_count += 1
                else:
                    run.rejected_count += 1

                processed = run.qualified_count + run.rejected_count + run.failed_count
                if processed >= run.discovered_count and run.discovered_count > 0:
                    run.status = "COMPLETED"

        await session.commit()

    await publish_progress_event("lead_evaluated", {
        "run_id": str(run_id),
        "business_id": str(business_id),
        "business_name": business_name,
        "score": final_score,
        "tier": tier,
        "is_qualified": is_qualified,
    })

    return {"status": "SUCCESS", "tier": tier, "score": final_score, "is_qualified": is_qualified}

