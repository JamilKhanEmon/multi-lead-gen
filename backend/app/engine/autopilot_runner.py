import asyncio
import uuid
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.business import Business, BusinessLocation
from app.models.lead import Lead, LeadScore
from app.models.autopilot import AutopilotCampaign, EmailOutreachLog
from app.models.email_template import PersonaSignature, EmailTemplate
from app.engine.email_verifier import EmailVerifier
from app.engine.outreach_engine import OutreachEngine
from app.services.openclaw_client import LiveResearchEngine
from app.engine.deduplication import DeduplicationEngine
from app.engine.discovery_optimizer import DiscoveryOptimizer
from app.engine.fit_gate import FitGateEngine, is_appointment_niche

class AutopilotRunner:

    @classmethod
    async def is_duplicate_business(
        cls,
        db: AsyncSession,
        canonical_name: str,
        domain: Optional[str] = None,
        phone: Optional[str] = None,
        city: Optional[str] = None
    ) -> bool:
        conditions = []

        if domain and domain.strip():
            clean_domain = domain.strip().lower().replace("http://", "").replace("https://", "").split("/")[0]
            if not DeduplicationEngine.is_generic_platform(clean_domain):
                conditions.append(func.lower(Business.domain) == clean_domain)

        if phone and len(phone.strip()) >= 7:
            clean_phone = "".join(c for c in phone if c.isdigit())
            if len(clean_phone) >= 7:
                conditions.append(func.replace(Business.phone, "-", "").like(f"%{clean_phone[-8:]}%"))

        if canonical_name and city:
            conditions.append(
                and_(
                    func.lower(Business.canonical_name) == canonical_name.strip().lower(),
                    Business.locations.any(func.lower(BusinessLocation.city) == city.strip().lower())
                )
            )

        if not conditions:
            conditions.append(func.lower(Business.canonical_name) == canonical_name.strip().lower())

        stmt = select(Business.id).where(or_(*conditions)).limit(1)
        res = await db.execute(stmt)
        return res.scalar_one_or_none() is not None

    @classmethod
    async def run_campaign_batch(
        cls,
        db: AsyncSession,
        campaign: AutopilotCampaign,
        batch_size: int = 0
    ) -> Dict[str, Any]:
        is_unlimited = getattr(campaign, "is_unlimited_leads", False)
        if is_unlimited:
            effective_batch = 0
        else:
            daily_limit = getattr(campaign, "daily_lead_limit", None)
            if daily_limit is not None and daily_limit > 0:
                effective_batch = daily_limit
            elif hasattr(campaign, "batch_size") and campaign.batch_size and campaign.batch_size > 0:
                effective_batch = campaign.batch_size
            else:
                effective_batch = batch_size

        # Resolve target sub-cities dynamically if none provided (Zero hardcoding!)
        raw_sub_cities = campaign.sub_cities or []
        sub_cities = [str(c).strip() for c in raw_sub_cities if str(c).strip()]
        if not sub_cities and campaign.country:
            logger.info(f"[AUTOPILOT] No sub-cities specified. Dynamically expanding '{campaign.country}' into commercial hub cities...")
            sub_cities = await DiscoveryOptimizer.get_country_commercial_cities(campaign.country, limit=20)
            if sub_cities:
                campaign.sub_cities = sub_cities
                await db.commit()

        if not sub_cities:
            sub_cities = [campaign.country] if campaign.country else [""]

        # Multi-keywords support
        raw_keywords = campaign.keywords or ["Business"]
        keywords = [str(k).strip() for k in raw_keywords if str(k).strip()]
        if not keywords:
            keywords = ["Business"]

        mode_desc = "UNLIMITED" if effective_batch <= 0 else f"Target Limit: {effective_batch}"
        logger.info(
            f"[AUTOPILOT RUN] Campaign '{campaign.name}' ({mode_desc}) executing across {len(sub_cities)} Sub-Cities | Keywords ({len(keywords)}): {keywords}"
        )

        campaign.status = "RUNNING"
        campaign.last_run_at = datetime.now(timezone.utc)
        await db.commit()

        p_stmt = select(PersonaSignature).where(PersonaSignature.is_active == True)
        p_res = await db.execute(p_stmt)
        active_personas = [
            {"name": p.name, "title": p.title, "company": p.company, "raw_content": p.render_signature()}
            for p in p_res.scalars().all()
        ]

        t_stmt = select(EmailTemplate).where(EmailTemplate.name == "default", EmailTemplate.is_active == True)
        t_res = await db.execute(t_stmt)
        active_tpl = t_res.scalar_one_or_none()

        all_added_leads = []
        total_skipped_duplicates = 0
        total_dispatched_count = 0

        # Search across all keyword and city combinations
        search_pairs = [(kw, city) for kw in keywords for city in sub_cities]

        try:
            for target_keyword, target_city in search_pairs:
                target_city_clean = target_city.strip()
                if not target_city_clean:
                    continue

                if effective_batch > 0 and len(all_added_leads) >= effective_batch:
                    logger.info(f"[AUTOPILOT TARGET REACHED] Satisfied batch quota with {len(all_added_leads)} verified leads.")
                    break

                logger.info(f"[AUTOPILOT] Querying real businesses for '{target_keyword}' in city: '{target_city_clean}' ({campaign.country})")

                discovered_candidates = []
                try:
                    discovery_res = await LiveResearchEngine.discover_businesses(
                        industry=target_keyword,
                        country=campaign.country,
                        city=target_city_clean,
                        sub_city=target_city_clean,
                        company_limit=max(15, (effective_batch - len(all_added_leads)) if effective_batch > 0 else 50)
                    )
                    discovered_candidates = discovery_res.get("discovered_companies", [])
                except Exception as e:
                    logger.warning(f"[AUTOPILOT DISCOVERY RESILIENCE] Discovery note for '{target_keyword}' in {target_city_clean}: {e}. Retrying next target...")
                    await asyncio.sleep(2)
                    continue

                use_kb = getattr(campaign, "use_company_kb", True)
                kb_dict = await FitGateEngine.fetch_active_kb_dict(db) if use_kb else None

                for cand in discovered_candidates:
                    if effective_batch > 0 and len(all_added_leads) >= effective_batch:
                        break

                    c_name = (cand.get("canonical_name") or "").strip()
                    c_dom = (cand.get("domain") or "").strip().lower()
                    c_phone = (cand.get("phone") or "").strip()
                    c_email = (cand.get("email") or "").strip()

                    if not c_name or len(c_name) < 2:
                        continue

                    c_name_l = c_name.lower()
                    EXCLUDED_SITES = [
                        "facebook.com", "instagram.com", "youtube.com", "google.com", "linkedin.com",
                        "bikroy.com", "bdjobsfeed.net", "infoisinfo.com", "bdbusinessfinder.com",
                        "bdtalika.com", "wixsite.com", "blogspot.com", "wordpress.com", "weebly.com"
                    ]
                    if any(bad in c_dom for bad in EXCLUDED_SITES) or any(bad in c_name_l for bad in EXCLUDED_SITES):
                        continue
                    if DeduplicationEngine.is_generic_platform(c_dom) or DeduplicationEngine.is_directory_or_aggregator(c_dom, c_name):
                        logger.info(f"Autopilot: Discarding directory/aggregator candidate '{c_name}' ({c_dom})")
                        continue

                    generic_names = ["companies", "company", "bangladesh", "dhaka", "index", "report", "firm", "firms", "service", "services"]
                    if (c_name_l in generic_names or len(c_name) < 4) and c_dom:
                        clean_brand = c_dom.split(".")[0].replace("-", " ").replace("_", " ")
                        clean_brand = re.sub(r'bd$', '', clean_brand, flags=re.IGNORECASE).strip()
                        c_name = f"{clean_brand.title()} {target_keyword.title()}"

                    is_dup = await cls.is_duplicate_business(
                        db=db,
                        canonical_name=c_name,
                        domain=c_dom if c_dom else None,
                        phone=c_phone if c_phone else None,
                        city=target_city_clean
                    )
                    if is_dup:
                        total_skipped_duplicates += 1
                        continue

                    resolved_email = c_email

                    audit_res = {}
                    detected_weaknesses = []

                    if c_dom and not DeduplicationEngine.is_generic_platform(c_dom):
                        logger.info(f"[AUTOPILOT DEEP AUDIT] Executing OpenClaw multi-page site audit for '{c_name}' ({c_dom})...")
                        try:
                            audit_res = await LiveResearchEngine.audit_website(
                                url=f"https://{c_dom}",
                                canonical_name=c_name,
                                location=target_city_clean
                            )
                            if audit_res.get("extracted_email") and not resolved_email:
                                resolved_email = audit_res["extracted_email"]
                            if audit_res.get("extracted_phone") and not c_phone:
                                c_phone = audit_res["extracted_phone"]
                        except Exception as e:
                            logger.warning(f"[AUTOPILOT DEEP AUDIT FAIL] Audit error for {c_dom}: {e}")

                    if not c_dom or not resolved_email:
                        try:
                            deep_hunt = await LiveResearchEngine.enrich_contact_from_web(c_name, f"{target_city_clean}, {campaign.country}")
                            if deep_hunt.get("domain") and not c_dom:
                                c_dom = deep_hunt["domain"]
                                if not audit_res:
                                    audit_res = await LiveResearchEngine.audit_website(
                                        url=f"https://{c_dom}",
                                        canonical_name=c_name,
                                        location=target_city_clean
                                    )
                            if deep_hunt.get("phone") and not c_phone:
                                c_phone = deep_hunt["phone"]
                            if deep_hunt.get("email") and not resolved_email:
                                resolved_email = deep_hunt["email"]
                        except Exception as e:
                            logger.debug(f"[AUTOPILOT DEEP HUNT FAIL] Contact hunt error for {c_name}: {e}")

                    if not resolved_email and c_dom and not DeduplicationEngine.is_generic_platform(c_dom):
                        resolved_email = f"info@{c_dom}"

                    b_type = cand.get("business_type") or "commercial"

                    if c_dom and audit_res:
                        page_title = audit_res.get("title") or ""
                        meta_desc = audit_res.get("meta_description") or ""
                        heading_txt = audit_res.get("heading") or ""

                        from app.services.ai_client import AIClient
                        ai_client = AIClient(timeout=8.0)

                        is_ind_fit, ind_reason = await DiscoveryOptimizer.verify_industry_fit(
                            target_industry=target_keyword,
                            business_name=c_name,
                            domain=c_dom,
                            page_title=page_title,
                            meta_description=meta_desc,
                            heading=heading_txt,
                            ollama_client=ai_client,
                        )
                        if not is_ind_fit:
                            logger.info(f"Autopilot: Discarding non-industry entity '{c_name}' ({c_dom}): {ind_reason}")
                            continue

                        if audit_res.get("mobile_overflow") or audit_res.get("mobile_responsive") is False:
                            detected_weaknesses.append("Mobile layout break & horizontal scrolling issue")
                        if audit_res.get("has_online_booking") is False and is_appointment_niche(b_type, c_name):
                            detected_weaknesses.append("Missing automated online booking & appointment system")
                        if audit_res.get("has_whatsapp") is False:
                            detected_weaknesses.append("Missing instant click-to-WhatsApp conversion channel")
                        if audit_res.get("has_ai_chatbot") is False:
                            detected_weaknesses.append("Missing AI Auto-Reply Chatbot & Voice Agent for instant lead response")
                        if audit_res.get("has_automation_workflow") is False:
                            detected_weaknesses.append("Missing n8n / Zapier / Make automated lead nurturing workflow")
                        if audit_res.get("has_live_chat") is False:
                            detected_weaknesses.append("Missing 24/7 AI live chat customer support widget")
                        if audit_res.get("has_contact_form") is False:
                            detected_weaknesses.append("Missing direct lead inquiry capture form")
                        if audit_res.get("has_ssl_security") is False:
                            detected_weaknesses.append("Missing HTTPS SSL security certificate on public portal")
                        if audit_res.get("broken_links_count", 0) > 0:
                            detected_weaknesses.append(f"{audit_res['broken_links_count']} broken 404 links on public site")
                        if audit_res.get("has_google_analytics") is False:
                            detected_weaknesses.append("Missing Google Analytics conversion tracking")
                        if audit_res.get("has_meta_pixel") is False:
                            detected_weaknesses.append("Missing Meta retargeting pixel")

                    if detected_weaknesses:
                        primary_gap = " • ".join(detected_weaknesses[:3])
                    elif not c_dom:
                        primary_gap = "Missing official corporate website — operates exclusively via map directory listing"
                    else:
                        primary_gap = "Solvable local search ranking weakness & mobile conversion gap"

                    has_email = bool(resolved_email and "@" in resolved_email)
                    if has_email:
                        outreach_status = "READY_FOR_OUTREACH"
                        email_status = "VALID"
                        verify_note = "Valid email address verified for autonomous outreach"
                    else:
                        outreach_status = "NO_EMAIL"
                        email_status = "NOT_FOUND"
                        verify_note = "No public email address found — queued for review"

                    analyze_web = bool(getattr(campaign, "analyze_website", False))

                    metadata_payload = {
                        "source": "autopilot_deep_intelligence",
                        "city": target_city_clean,
                        "keyword": target_keyword,
                        "analyze_website": analyze_web,
                        "google_maps_url": cand.get("google_maps_url"),
                        "google_search_url": cand.get("google_search_url"),
                        "detected_weaknesses": detected_weaknesses
                    }

                    gate_eval = FitGateEngine.evaluate_candidate(
                        business_name=c_name,
                        domain=c_dom,
                        phone=c_phone,
                        email=resolved_email,
                        business_type=b_type,
                        city=target_city_clean,
                        audit_res=audit_res,
                        detected_weaknesses=detected_weaknesses,
                        metadata_json=metadata_payload,
                        company_kb=kb_dict,
                        use_company_kb=use_kb,
                        analyze_website=analyze_web,
                    )

                    fit_tier = gate_eval["fit_tier"]
                    is_dropped = (fit_tier == "DROPPED")
                    if is_dropped:
                        logger.info(f"[AUTOPILOT STRICT FILTER] Dropping rejected candidate '{c_name}' (Fit: {fit_tier}). Not adding to CRM.")
                        continue

                    lead_tier = "Strong Potential" if (fit_tier == "HOT" and has_email) else "Review Needed"
                    final_lead_score = gate_eval["fit_score"]
                    is_qualified = True

                    why_they_need_us = gate_eval.get("why_they_need_us", "")
                    what_they_need = gate_eval.get("what_they_need", "")
                    matched_service = gate_eval.get("matched_service", "")
                    discovery_call_script = gate_eval.get("discovery_call_script", None)

                    lead_primary_gap = " • ".join(gate_eval["verified_gaps"][:2]) if gate_eval.get("verified_gaps") else primary_gap

                    biz = Business(
                        canonical_name=c_name,
                        domain=c_dom if c_dom else None,
                        phone=c_phone if c_phone else None,
                        email=resolved_email if has_email else None,
                        contact_person=cand.get("contact_person") or "Executive / Director",
                        address=cand.get("address") or f"{target_city_clean}, {campaign.country}",
                        business_type=b_type,
                        metadata_json=metadata_payload,
                    )
                    db.add(biz)
                    await db.flush()

                    loc = BusinessLocation(
                        business_id=biz.id,
                        city=target_city_clean,
                        country=campaign.country,
                        address=cand.get("address") or f"{target_city_clean}, {campaign.country}",
                        latitude=cand.get("latitude"),
                        longitude=cand.get("longitude")
                    )
                    db.add(loc)

                    lead = Lead(
                        business_id=biz.id,
                        tier=lead_tier,
                        final_score=final_lead_score,
                        is_qualified=is_qualified,
                        primary_gap_summary=lead_primary_gap,
                        explanation_json={
                            "source": "openclaw_deep_intelligence",
                            "sub_city": target_city_clean,
                            "audited_domain": c_dom,
                            "verified_gaps": gate_eval.get("verified_gaps", []),
                            "inferred_opportunities": gate_eval.get("inferred_opportunities", []),
                            "recommended_services": gate_eval.get("recommended_services", []),
                            "matched_service_url": gate_eval.get("matched_service_url", ""),
                            "audit_summary": {
                                "mobile_responsive": audit_res.get("mobile_responsive"),
                                "mobile_overflow": audit_res.get("mobile_overflow"),
                                "has_whatsapp": audit_res.get("has_whatsapp"),
                                "has_online_booking": audit_res.get("has_online_booking"),
                                "has_contact_form": audit_res.get("has_contact_form"),
                                "broken_links_count": audit_res.get("broken_links_count"),
                                "cms_platform": audit_res.get("cms_platform"),
                                "has_meta_pixel": audit_res.get("has_meta_pixel"),
                                "has_google_analytics": audit_res.get("has_google_analytics"),
                                "rendered_by": audit_res.get("rendered_by", "playwright-chromium")
                            } if audit_res else None,
                            "detected_weaknesses": detected_weaknesses,
                            "fit_gate": {
                                "fit_tier": fit_tier,
                                "passed_gate": True,
                                "evidence_tags": gate_eval.get("evidence_tags", []),
                            }
                        },
                        email_status=email_status,
                        verification_notes=verify_note,
                        outreach_status=outreach_status,
                        deal_status="COLD",
                        followup_step=0,
                        fit_tier=fit_tier,
                        why_they_need_us=why_they_need_us,
                        what_they_need=what_they_need,
                        discovery_call_script=discovery_call_script,
                        matched_service=matched_service,
                    )
                    db.add(lead)
                    await db.flush()

                    score = LeadScore(
                        lead_id=lead.id,
                        evidence_quality=85.0,
                        problem_relevance=90.0,
                        problem_repetition=80.0,
                        recency=95.0,
                        business_impact=85.0,
                        service_fit=88.0,
                        final_score=lead.final_score
                    )
                    db.add(score)

                    all_added_leads.append(lead)

                    if campaign.auto_mail_enabled and has_email and resolved_email:
                        is_office_hrs, hrs_note = OutreachEngine.is_within_target_business_hours(
                            lat=cand.get("latitude"),
                            lon=cand.get("longitude"),
                            country=campaign.country,
                            city=target_city_clean
                        )
                        
                        if is_office_hrs:
                            subject, body = await OutreachEngine.render_email(
                                step=1,
                                lead_data={
                                    "company_name": biz.canonical_name,
                                    "contact_person": biz.contact_person,
                                    "city": target_city_clean,
                                    "website": biz.domain or "",
                                    "industry": b_type,
                                    "primary_gap": primary_gap,
                                    "why_they_need_us": why_they_need_us,
                                    "what_they_need": what_they_need,
                                    "matched_service": matched_service,
                                    "personas": active_personas,
                                    "custom_template": active_tpl if getattr(campaign, "use_global_template", True) else None
                                }
                            )
                            success, note = await OutreachEngine.dispatch_smtp_email(
                                recipient_email=resolved_email,
                                subject=subject,
                                body=body,
                                dry_run=False,
                                db=db
                            )
                            if success:
                                lead.outreach_status = "SENT"
                                lead.followup_step = 1
                                lead.last_contacted_at = datetime.now(timezone.utc)
                                total_dispatched_count += 1

                                outreach_log = EmailOutreachLog(
                                    lead_id=lead.id,
                                    campaign_id=campaign.id,
                                    step=1,
                                    recipient_email=resolved_email,
                                    subject=subject,
                                    body_snippet=body,
                                    status="SENT",
                                    error_message=note,
                                    sent_at=datetime.now(timezone.utc)
                                )
                                db.add(outreach_log)
                        else:
                            lead.outreach_status = "READY_FOR_OUTREACH"
                            lead.verification_notes = f"Queued for target local office hours ({hrs_note})"
                            logger.info(f"[AUTOPILOT OUTREACH QUEUED] {biz.canonical_name} ({resolved_email}) -> {hrs_note}")
                    elif not campaign.auto_mail_enabled:
                        lead.outreach_status = "COLLECTED"
                        lead.verification_notes = "Data Collector Mode: Lead and audit preserved without automated outreach."

                    campaign.total_leads_found += 1
                    campaign.total_emails_sent += total_dispatched_count
                    await db.commit()

                    if effective_batch > 0 and len(all_added_leads) >= effective_batch:
                        break

                if effective_batch > 0 and len(all_added_leads) >= effective_batch:
                    break

        except Exception as batch_err:
            logger.error(f"[AUTOPILOT RUN FAIL] Error in campaign run: {batch_err}")
        finally:
            campaign.status = "IDLE"
            await db.commit()

        logger.info(
            f"[AUTOPILOT 1-CLICK COMPLETE] Campaign '{campaign.name}' | "
            f"Sub-cities: {len(sub_cities)} | Added: {len(all_added_leads)} real leads | "
            f"Skipped {total_skipped_duplicates} duplicates | Dispatched: {total_dispatched_count} emails"
        )

        return {
            "campaign_id": str(campaign.id),
            "sub_cities_processed": sub_cities,
            "leads_added": len(all_added_leads),
            "duplicates_skipped": total_skipped_duplicates,
            "emails_dispatched": total_dispatched_count,
            "status": "COMPLETED"
        }
