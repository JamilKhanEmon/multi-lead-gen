import uuid
import urllib.parse
import csv
import io
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc, text
from app.api.deps import get_db, get_current_user
from app.models.lead import Lead, LeadScore, LeadFeedback
from app.models.service import ServiceMatch, Service
from app.models.business import Business
from app.models.evidence import Evidence
from app.models.research import ResearchJob
from app.models.audit import User
from app.engine.discovery_optimizer import DiscoveryOptimizer
from app.engine.deduplication import DeduplicationEngine, GENERIC_PLATFORM_DOMAINS
from app.engine.fit_gate import FitGateEngine
from app.schemas.lead import (
    LeadResponse,
    LeadDetailResponse,
    LeadUpdate,
    LeadFeedbackCreate,
    LeadFeedbackResponse,
    EvidenceItemResponse,
    ResearchJobSummaryResponse,
    StaggeredDispatchCreate,
)

router = APIRouter(prefix="/leads", tags=["Leads"])

@router.get("", response_model=List[LeadResponse])
async def list_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=10000),
    tier: Optional[str] = None,
    fit_tier: Optional[str] = None,
    run_id: Optional[uuid.UUID] = None,
    is_qualified: Optional[bool] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    outreach_status: Optional[str] = None,
    deal_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "super_admin":
        perms = current_user.permissions_json or {}
        if perms.get("can_view_leads") is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: You do not have permission to view leads.",
            )

    stmt = (
        select(Lead)
        .options(
            selectinload(Lead.business).selectinload(Business.locations)
        )
    )

    if tier and tier != "ALL":
        stmt = stmt.where(Lead.tier == tier)
    if fit_tier and fit_tier != "ALL":
        stmt = stmt.where(Lead.fit_tier == fit_tier)
    if run_id:
        stmt = stmt.where(Lead.run_id == run_id)
    if is_qualified is not None:
        stmt = stmt.where(Lead.is_qualified == is_qualified)
    if min_score is not None:
        stmt = stmt.where(Lead.final_score >= min_score)
    if outreach_status:
        stmt = stmt.where(Lead.outreach_status == outreach_status)
    if deal_status:
        stmt = stmt.where(Lead.deal_status == deal_status)

    try:
        from sqlalchemy import or_
        cleanup_stmt = select(Lead).join(Business).where(
            (Business.canonical_name.ilike("%facebook.com%")) |
            (Business.canonical_name.ilike("%instagram.com%")) |
            (Business.canonical_name.ilike("%google.com%")) |
            (Business.canonical_name.ilike("%sample%")) |
            (Business.canonical_name.ilike("%demo business%")) |
            (Business.canonical_name.ilike("%dummy%")) |
            (Business.canonical_name.ilike("%test company%")) |
            (Business.canonical_name == "Facebook") |
            (Business.canonical_name == "facebook") |
            (Business.canonical_name == "Google") |
            (Business.canonical_name == "google") |
            (Lead.tier == "Rejected") |
            (Lead.outreach_status == "NO_EMAIL") |
            (Business.email.is_(None)) |
            (Business.email == "")
        )
        c_res = await db.execute(cleanup_stmt)
        bad_leads = c_res.scalars().all()
        if bad_leads:
            for bl in bad_leads:
                await db.delete(bl)
            await db.commit()
    except Exception:
        pass

    stmt = stmt.order_by(desc(Lead.final_score)).offset(skip).limit(limit)
    res = await db.execute(stmt)
    leads = res.scalars().all()

    lead_items = []
    for l in leads:
        biz = l.business
        if not biz or not biz.email or not biz.email.strip() or l.tier == "Rejected" or l.outreach_status == "NO_EMAIL":
            continue
        biz_name_l = (biz.canonical_name or "").lower().strip()
        biz_dom_l = (biz.domain or "").lower().strip()

        if any(bad in biz_name_l for bad in ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "twitter.com"]) or biz_name_l in ["facebook", "instagram", "google", "meta"]:
            continue

        clean_dom = biz.domain
        if DeduplicationEngine.is_generic_platform(clean_dom):
            clean_dom = None

        meta = (biz.metadata_json or {}) if biz else {}
        has_scraped_email = bool(meta.get("extracted_email") or (biz.email and not biz.email.startswith("contact@")))
        resolved_email = biz.email.strip()
        email_status = "VERIFIED" if has_scraped_email else "SUGGESTED"

        has_contact = bool(biz.phone or resolved_email)
        if not resolved_email:
            continue

        loc = biz.locations[0] if (biz and biz.locations) else None
        lat = (loc.latitude if loc and loc.latitude is not None else None) or meta.get("latitude")
        lon = (loc.longitude if loc and loc.longitude is not None else None) or meta.get("longitude")
        address = (biz.address if biz and biz.address else None) or (loc.address if loc else None) or meta.get("address")

        if lat is not None and lon is not None:
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
        elif meta.get("google_maps_url"):
            gmaps_url = meta.get("google_maps_url")
        else:
            name_addr = f"{biz.canonical_name if biz else ''} {address or ''}".strip()
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(name_addr)}" if name_addr else None

        gsearch_url = meta.get("google_search_url") or (
            f"https://www.google.com/search?q={urllib.parse.quote(biz.canonical_name)}" if biz else None
        )

        btype = (
            DiscoveryOptimizer.classify_entity(biz.canonical_name, clean_dom, biz.business_type)
            if (biz and biz.canonical_name)
            else (biz.business_type if biz else "Commercial Entity")
        )

        lead_items.append(
            LeadResponse(
                id=l.id,
                business_id=l.business_id,
                run_id=l.run_id,
                tier=l.tier,
                final_score=l.final_score,
                is_qualified=l.is_qualified,
                primary_gap_summary=l.primary_gap_summary,
                created_at=l.created_at,
                business_name=biz.canonical_name if biz else "Candidate Business",
                domain=clean_dom,
                phone=biz.phone if biz else None,
                email=resolved_email,
                email_status=getattr(l, "email_status", None) or email_status,
                verification_notes=getattr(l, "verification_notes", None),
                outreach_status=getattr(l, "outreach_status", "PENDING") or "PENDING",
                deal_status=getattr(l, "deal_status", "COLD") or "COLD",
                followup_step=getattr(l, "followup_step", 0) or 0,
                last_contacted_at=getattr(l, "last_contacted_at", None),
                contact_person=biz.contact_person if biz else None,
                contact_title=biz.contact_title if biz else None,
                address=address,
                business_type=btype,
                google_maps_url=gmaps_url,
                google_search_url=gsearch_url,
                latitude=lat,
                longitude=lon,
                fit_tier=getattr(l, "fit_tier", None) or "HOT",
                why_they_need_us=getattr(l, "why_they_need_us", None),
                what_they_need=getattr(l, "what_they_need", None),
                discovery_call_script=getattr(l, "discovery_call_script", None),
                matched_service=getattr(l, "matched_service", None),
            )
        )

    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return lead_items

@router.get("/export/csv")
async def export_leads_csv(
    tier: Optional[str] = None,
    run_id: Optional[uuid.UUID] = None,
    is_qualified: Optional[bool] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "super_admin":
        perms = current_user.permissions_json or {}
        if perms.get("can_export_leads") is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: You do not have permission to export leads.",
            )

    stmt = (
        select(Lead)
        .options(
            selectinload(Lead.scores),
            selectinload(Lead.service_matches).selectinload(ServiceMatch.service),
            selectinload(Lead.business).selectinload(Business.locations),
            selectinload(Lead.business).selectinload(Business.evidence).selectinload(Evidence.parameter),
            selectinload(Lead.business).selectinload(Business.evidence).selectinload(Evidence.source),
        )
    )
    if tier and tier != "ALL":
        stmt = stmt.where(Lead.tier == tier)
    if run_id:
        stmt = stmt.where(Lead.run_id == run_id)
    if is_qualified is not None:
        stmt = stmt.where(Lead.is_qualified == is_qualified)
    if min_score is not None:
        stmt = stmt.where(Lead.final_score >= min_score)

    stmt = stmt.order_by(desc(Lead.final_score))
    res = await db.execute(stmt)
    leads = res.scalars().all()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    headers = [
        "Company Name",
        "Domain",
        "Website URL",
        "Phone Number",
        "Email Address",
        "Email Status",
        "AI Identified Problems & Weaknesses (A to Z Details)",
        "Primary Gap Summary",
        "Overall Lead Score",
        "Qualification Tier",
        "Is Qualified",
        "Business Type",
        "Contact Person",
        "Contact Title",
        "Full Address",
        "City",
        "State",
        "Country",
        "Latitude",
        "Longitude",
        "Google Maps URL",
        "Google Search URL",
        "Facebook URL",
        "Instagram URL",
        "LinkedIn URL",
        "Website CMS Platform",
        "Meta Pixel Active",
        "Google Analytics Active",
        "Mobile Responsive",
        "SSL Active (HTTPS)",
        "AI Suggested Services",
        "AI Service Match Rationale",
        "AI Pitch Recommendation",
        "AI Outreach Email Subject",
        "AI Outreach Email Body",
        "AI Detected Strengths",
        "AI Detected Weaknesses",
        "AI Evidence Quality Score",
        "AI Problem Relevance Score",
        "AI Problem Repetition Score",
        "AI Recency Score",
        "AI Business Impact Score",
        "AI Service Fit Score",
        "Total Parameters Evaluated",
        "Parameters Passed Count",
        "Parameters Failed / Gaps Count",
        "Parameters Passed List",
        "Parameters Failed / Gaps List",
        "All Parameters & Evidence Details (A to Z)",
        "Discovered / Created At",
        "Lead ID",
        "Batch Run ID",
    ]
    writer.writerow(headers)

    for l in leads:
        biz = l.business
        if not biz:
            continue
        biz_name_l = (biz.canonical_name or "").lower().strip()
        if any(bad in biz_name_l for bad in ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "twitter.com"]) or biz_name_l in ["facebook", "instagram", "google", "meta"]:
            continue

        clean_dom = biz.domain
        if DeduplicationEngine.is_generic_platform(clean_dom):
            clean_dom = None

        meta = (biz.metadata_json or {}) if biz else {}
        has_scraped_email = bool(meta.get("extracted_email") or (biz.email and not biz.email.startswith("contact@")))
        if biz.email:
            resolved_email = biz.email
            email_status = "VERIFIED" if has_scraped_email else "SUGGESTED"
        elif clean_dom and not DeduplicationEngine.is_generic_platform(clean_dom):
            resolved_email = f"contact@{clean_dom}"
            email_status = "SUGGESTED"
        else:
            resolved_email = None
            email_status = "NOT_FOUND"

        loc = biz.locations[0] if (biz and biz.locations) else None
        lat = (loc.latitude if loc and loc.latitude is not None else None) or meta.get("latitude")
        lon = (loc.longitude if loc and loc.longitude is not None else None) or meta.get("longitude")
        address = (biz.address if biz and biz.address else None) or (loc.address if loc else None) or meta.get("address")

        if lat is not None and lon is not None:
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
        elif meta.get("google_maps_url"):
            gmaps_url = meta.get("google_maps_url")
        else:
            name_addr = f"{biz.canonical_name if biz else ''} {address or ''}".strip()
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(name_addr)}" if name_addr else ""

        gsearch_url = meta.get("google_search_url") or (
            f"https://www.google.com/search?q={urllib.parse.quote(biz.canonical_name)}" if biz else ""
        )

        fb_url = meta.get("facebook_url") or (
            f"https://www.facebook.com/search/top?q={urllib.parse.quote(biz.canonical_name)}" if biz else ""
        )
        insta_url = meta.get("instagram_url") or (
            f"https://www.instagram.com/explore/tags/{urllib.parse.quote(clean_dom.split('.')[0])}" if clean_dom else ""
        )

        btype = (
            DiscoveryOptimizer.classify_entity(biz.canonical_name, clean_dom, biz.business_type)
            if (biz and biz.canonical_name)
            else (biz.business_type if biz else "Commercial Entity")
        )

        website_url = f"https://{clean_dom}" if clean_dom else ""

        cms_platform = meta.get("cms_platform") or ("WordPress" if meta.get("is_wordpress") else ("Custom Web App" if clean_dom else "No Website"))
        has_pixel = "YES" if meta.get("has_meta_pixel") else "NO"
        has_analytics = "YES" if meta.get("has_google_analytics") else "NO"
        has_mobile = "YES" if meta.get("has_viewport") else ("YES" if clean_dom else "NO")
        has_ssl = "YES" if meta.get("has_ssl") else ("YES" if clean_dom else "NO")

        sc = l.scores[0] if (l.scores and len(l.scores) > 0) else None
        eq_score = f"{sc.evidence_quality:.1f}" if sc else ""
        pr_score = f"{sc.problem_relevance:.1f}" if sc else ""
        prep_score = f"{sc.problem_repetition:.1f}" if sc else ""
        rec_score = f"{sc.recency:.1f}" if sc else ""
        bi_score = f"{sc.business_impact:.1f}" if sc else ""
        sf_score = f"{sc.service_fit:.1f}" if sc else ""

        suggested_services = []
        services_why = []
        if l.service_matches:
            for sm in l.service_matches:
                s_name = sm.service.name if sm.service else "Service"
                fit_pct = f"{int(sm.hybrid_fit_score * 100)}%" if sm.hybrid_fit_score is not None else ""
                suggested_services.append(f"{s_name} ({fit_pct})")
                if sm.why_selected:
                    services_why.append(f"{s_name}: {sm.why_selected}")

        suggested_services_str = ", ".join(suggested_services)
        services_why_str = " | ".join(services_why)

        exp = l.explanation_json or {}
        ai_pitch = exp.get("recommended_pitch") or exp.get("pitch") or ""
        ai_strengths = ", ".join(exp.get("strengths", [])) if isinstance(exp.get("strengths"), list) else str(exp.get("strengths") or "")
        ai_weaknesses = ", ".join(exp.get("weaknesses", [])) if isinstance(exp.get("weaknesses"), list) else str(exp.get("weaknesses") or "")

        email_subj = f"Quick inquiry regarding {biz.canonical_name if biz else 'your office'} in {address or 'your area'}"
        tailored_sol = f" ({suggested_services_str})" if suggested_services_str else ""
        email_body = (
            f"Hello {biz.contact_person or 'Team'},\n\n"
            f"I recently reviewed {biz.canonical_name if biz else 'your business'} in {address or 'your city'}. "
            f"We noticed that {l.primary_gap_summary or 'there are major growth opportunities in your online presence'}. "
            f"We have prepared tailored solutions{tailored_sol} that could help resolve this.\n\n"
            f"Would you be open to a quick 3-minute discussion this week?\n\n"
            f"Best regards"
        )

        passed_params = []
        failed_params = []
        all_evidence_details = []

        if biz and biz.evidence:
            for ev in biz.evidence:
                p_name = ev.parameter.name if ev.parameter else f"Parameter #{ev.parameter_id}"
                p_cat = ev.parameter.category if ev.parameter else "Audit"
                p_status = ev.status or "UNKNOWN"
                clean_text = (ev.evidence_text or "").replace("\r", " ").replace("\n", " ").strip()

                if p_status in ["PASS", "STRONG"]:
                    passed_params.append(f"{p_name} ({p_status})")
                elif p_status in ["FAIL", "WEAK", "MISSING"]:
                    failed_params.append(f"{p_name} ({p_status})")

                all_evidence_details.append(f"[{p_cat}] {p_name} -> {p_status}: {clean_text}")

        total_eval = len(biz.evidence) if (biz and biz.evidence) else 0

        problems_list = []
        if l.primary_gap_summary:
            problems_list.append(f"[Core Primary Issue]: {l.primary_gap_summary}")

        if not clean_dom:
            problems_list.append("[Missing Website]: No official corporate website found; operating solely via third-party directory listings or maps.")
        else:
            if not meta.get("has_ssl"):
                problems_list.append("[Security Flaw]: Missing active SSL Certificate (HTTPS); browser flags the site as 'Not Secure' to visitors.")
            if not meta.get("has_meta_pixel"):
                problems_list.append("[Marketing Gap]: Missing Meta/Facebook Advertising Pixel; losing retargeting traffic and ad attribution.")
            if not meta.get("has_google_analytics"):
                problems_list.append("[Analytics Gap]: Missing Google Analytics tag; zero visibility into website visitor traffic or conversion funnel.")
            if not meta.get("has_viewport"):
                problems_list.append("[Mobile UX Failure]: Missing mobile-responsive viewport; page layout breaks on mobile smartphones.")

        if not biz.email and email_status == "NOT_FOUND":
            problems_list.append("[Contact Gap]: No direct public email address detected on website or listings.")
        if not biz.phone:
            problems_list.append("[Contact Gap]: No telephone or direct call number listed.")

        if isinstance(exp.get("weaknesses"), list):
            for w in exp.get("weaknesses"):
                if w and str(w).strip():
                    problems_list.append(f"[AI Audit Weakness]: {str(w).strip()}")
        elif exp.get("weaknesses"):
            problems_list.append(f"[AI Audit Weakness]: {str(exp.get('weaknesses')).strip()}")

        if biz and biz.evidence:
            for ev in biz.evidence:
                p_status = ev.status or "UNKNOWN"
                if p_status in ["FAIL", "WEAK", "MISSING", "GAP"]:
                    p_name = ev.parameter.name if ev.parameter else f"Parameter #{ev.parameter_id}"
                    p_cat = ev.parameter.category if ev.parameter else "Audit"
                    clean_text = (ev.evidence_text or "").replace("\r", " ").replace("\n", " ").strip()
                    problems_list.append(f"[{p_cat} - {p_name}]: {clean_text}")

        if problems_list:
            all_problems_one_column = "\n".join([f"{i+1}. {item}" for i, item in enumerate(problems_list)])
        else:
            all_problems_one_column = f"1. [Core Primary Issue]: {l.primary_gap_summary or 'No critical public defects detected.'}"

        writer.writerow([
            biz.canonical_name if biz else "",
            clean_dom or "",
            website_url,
            biz.phone or "",
            resolved_email or "",
            email_status,
            all_problems_one_column,
            l.primary_gap_summary or "",
            f"{l.final_score:.1f}",
            l.tier,
            "YES" if l.is_qualified else "NO",
            btype,
            biz.contact_person or "",
            biz.contact_title or "",
            address or "",
            (loc.city if loc else "") or "",
            (loc.state if loc else "") or "",
            (loc.country if loc else "") or "",
            str(lat) if lat is not None else "",
            str(lon) if lon is not None else "",
            gmaps_url,
            gsearch_url,
            fb_url,
            insta_url,
            biz.linkedin_url or "",
            cms_platform,
            has_pixel,
            has_analytics,
            has_mobile,
            has_ssl,
            suggested_services_str,
            services_why_str,
            ai_pitch,
            email_subj,
            email_body,
            ai_strengths,
            ai_weaknesses,
            eq_score,
            pr_score,
            prep_score,
            rec_score,
            bi_score,
            sf_score,
            total_eval,
            len(passed_params),
            len(failed_params),
            "; ".join(passed_params),
            "; ".join(failed_params),
            " | ".join(all_evidence_details),
            l.created_at.strftime("%Y-%m-%d %H:%M:%S") if l.created_at else "",
            str(l.id),
            str(l.run_id) if l.run_id else "",
        ])

    csv_data = output.getvalue()
    filename = f"leads_sheet_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )

@router.get("/export/json")
async def export_leads_json(
    tier: Optional[str] = None,
    run_id: Optional[uuid.UUID] = None,
    is_qualified: Optional[bool] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "super_admin":
        perms = current_user.permissions_json or {}
        if perms.get("can_export_leads") is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: You do not have permission to export leads.",
            )

    stmt = (
        select(Lead)
        .options(
            selectinload(Lead.scores),
            selectinload(Lead.service_matches).selectinload(ServiceMatch.service),
            selectinload(Lead.business).selectinload(Business.locations),
            selectinload(Lead.business).selectinload(Business.evidence).selectinload(Evidence.parameter),
            selectinload(Lead.business).selectinload(Business.evidence).selectinload(Evidence.source),
        )
    )
    if tier and tier != "ALL":
        stmt = stmt.where(Lead.tier == tier)
    if run_id:
        stmt = stmt.where(Lead.run_id == run_id)
    if is_qualified is not None:
        stmt = stmt.where(Lead.is_qualified == is_qualified)
    if min_score is not None:
        stmt = stmt.where(Lead.final_score >= min_score)

    stmt = stmt.order_by(desc(Lead.final_score))
    res = await db.execute(stmt)
    leads = res.scalars().all()

    items = []
    for l in leads:
        biz = l.business
        if not biz:
            continue
        biz_name_l = (biz.canonical_name or "").lower().strip()
        if any(bad in biz_name_l for bad in ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "twitter.com"]) or biz_name_l in ["facebook", "instagram", "google", "meta"]:
            continue

        clean_dom = biz.domain
        if DeduplicationEngine.is_generic_platform(clean_dom):
            clean_dom = None

        meta = (biz.metadata_json or {}) if biz else {}
        has_scraped_email = bool(meta.get("extracted_email") or (biz.email and not biz.email.startswith("contact@")))
        if biz.email:
            resolved_email = biz.email
            email_status = "VERIFIED" if has_scraped_email else "SUGGESTED"
        elif clean_dom and not DeduplicationEngine.is_generic_platform(clean_dom):
            resolved_email = f"contact@{clean_dom}"
            email_status = "SUGGESTED"
        else:
            resolved_email = None
            email_status = "NOT_FOUND"

        loc = biz.locations[0] if (biz and biz.locations) else None
        lat = (loc.latitude if loc and loc.latitude is not None else None) or meta.get("latitude")
        lon = (loc.longitude if loc and loc.longitude is not None else None) or meta.get("longitude")
        address = (biz.address if biz and biz.address else None) or (loc.address if loc else None) or meta.get("address")

        if lat is not None and lon is not None:
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
        elif meta.get("google_maps_url"):
            gmaps_url = meta.get("google_maps_url")
        else:
            name_addr = f"{biz.canonical_name if biz else ''} {address or ''}".strip()
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(name_addr)}" if name_addr else None

        gsearch_url = meta.get("google_search_url") or (
            f"https://www.google.com/search?q={urllib.parse.quote(biz.canonical_name)}" if biz else None
        )

        btype = (
            DiscoveryOptimizer.classify_entity(biz.canonical_name, clean_dom, biz.business_type)
            if (biz and biz.canonical_name)
            else (biz.business_type if biz else "Commercial Entity")
        )

        sc = l.scores[0] if (l.scores and len(l.scores) > 0) else None
        score_breakdown = {
            "evidence_quality": sc.evidence_quality if sc else None,
            "problem_relevance": sc.problem_relevance if sc else None,
            "problem_repetition": sc.problem_repetition if sc else None,
            "recency": sc.recency if sc else None,
            "business_impact": sc.business_impact if sc else None,
            "service_fit": sc.service_fit if sc else None,
            "final_score": l.final_score,
        }

        service_matches_list = []
        if l.service_matches:
            for sm in l.service_matches:
                service_matches_list.append({
                    "service_name": sm.service.name if sm.service else None,
                    "category": sm.service.category if sm.service else None,
                    "hybrid_fit_score": sm.hybrid_fit_score,
                    "why_selected": sm.why_selected,
                })

        evidence_items_list = []
        if biz and biz.evidence:
            for ev in biz.evidence:
                evidence_items_list.append({
                    "parameter_id": ev.parameter_id,
                    "parameter_name": ev.parameter.name if ev.parameter else f"Parameter #{ev.parameter_id}",
                    "parameter_category": ev.parameter.category if ev.parameter else "General",
                    "status": ev.status,
                    "confidence": ev.confidence,
                    "evidence_text": ev.evidence_text,
                    "source_url": ev.source.url if ev.source else None,
                    "screenshot_path": ev.screenshot_path,
                })

        problems_list = []
        if l.primary_gap_summary:
            problems_list.append(f"[Core Primary Issue]: {l.primary_gap_summary}")

        if not clean_dom:
            problems_list.append("[Missing Website]: No official corporate website found; operating solely via third-party directory listings or maps.")
        else:
            if not meta.get("has_ssl"):
                problems_list.append("[Security Flaw]: Missing active SSL Certificate (HTTPS); browser flags the site as 'Not Secure' to visitors.")
            if not meta.get("has_meta_pixel"):
                problems_list.append("[Marketing Gap]: Missing Meta/Facebook Advertising Pixel; losing retargeting traffic and ad attribution.")
            if not meta.get("has_google_analytics"):
                problems_list.append("[Analytics Gap]: Missing Google Analytics tag; zero visibility into website visitor traffic or conversion funnel.")
            if not meta.get("has_viewport"):
                problems_list.append("[Mobile UX Failure]: Missing mobile-responsive viewport; page layout breaks on mobile smartphones.")

        if not biz.email and email_status == "NOT_FOUND":
            problems_list.append("[Contact Gap]: No direct public email address detected on website or listings.")
        if not biz.phone:
            problems_list.append("[Contact Gap]: No telephone or direct call number listed.")

        exp_json = l.explanation_json or {}
        if isinstance(exp_json.get("weaknesses"), list):
            for w in exp_json.get("weaknesses"):
                if w and str(w).strip():
                    problems_list.append(f"[AI Audit Weakness]: {str(w).strip()}")
        elif exp_json.get("weaknesses"):
            problems_list.append(f"[AI Audit Weakness]: {str(exp_json.get('weaknesses')).strip()}")

        if biz and biz.evidence:
            for ev in biz.evidence:
                p_status = ev.status or "UNKNOWN"
                if p_status in ["FAIL", "WEAK", "MISSING", "GAP"]:
                    p_name = ev.parameter.name if ev.parameter else f"Parameter #{ev.parameter_id}"
                    p_cat = ev.parameter.category if ev.parameter else "Audit"
                    clean_text = (ev.evidence_text or "").replace("\r", " ").replace("\n", " ").strip()
                    problems_list.append(f"[{p_cat} - {p_name}]: {clean_text}")

        all_problems_one_column = "\n".join([f"{i+1}. {item}" for i, item in enumerate(problems_list)]) if problems_list else f"1. [Core Primary Issue]: {l.primary_gap_summary or 'No critical public defects detected.'}"

        missing_checklist = {
            "missing_website": not bool(clean_dom),
            "missing_ssl_certificate": not bool(meta.get("has_ssl")),
            "missing_meta_pixel": not bool(meta.get("has_meta_pixel")),
            "missing_google_analytics": not bool(meta.get("has_google_analytics")),
            "missing_mobile_viewport": not bool(meta.get("has_viewport")),
            "missing_public_email": not bool(resolved_email),
            "missing_phone_number": not bool(biz.phone),
            "missing_social_presence": not bool(meta.get("facebook_url") or meta.get("instagram_url") or biz.linkedin_url),
        }
        missing_count = sum(1 for v in missing_checklist.values() if v)

        human_review_dossier = {
            "audit_mode": "HUMAN_VS_AI_COMPARISON",
            "ai_analysis": {
                "score": l.final_score,
                "qualification_tier": l.tier,
                "verdict": "QUALIFIED" if l.is_qualified else "DISQUALIFIED",
                "primary_gap_summary": l.primary_gap_summary,
                "ai_reasoning_summary": exp_json.get("summary") or exp_json.get("reasoning") or "Evaluated across deterministic 135-parameter engine.",
                "ai_identified_weaknesses": exp_json.get("weaknesses") or [],
                "ai_identified_strengths": exp_json.get("strengths") or [],
            },
            "missing_elements_checklist": {
                **missing_checklist,
                "total_missing_critical_elements": missing_count,
            },
            "human_reviewer_workbench": {
                "status": "READY_FOR_HUMAN_INSPECTION",
                "human_approval_decision": None,
                "human_notes": "",
                "human_verified_gaps": [],
                "ai_discrepancy_noted": False,
            }
        }

        items.append({
            "id": str(l.id),
            "business_id": str(l.business_id),
            "run_id": str(l.run_id) if l.run_id else None,
            "company_name": biz.canonical_name if biz else "",
            "domain": clean_dom,
            "website_url": f"https://{clean_dom}" if clean_dom else None,
            "business_type": btype,
            "phone": biz.phone,
            "email": resolved_email,
            "email_status": email_status,
            "mail_ready_status": mail_ready_status,
            "is_mail_ready": is_mail_ready,
            "outreach_status": getattr(l, "outreach_status", "READY_FOR_OUTREACH"),
            "deal_status": getattr(l, "deal_status", "COLD"),
            "followup_step": getattr(l, "followup_step", 1),
            "human_review_dossier": human_review_dossier,
            "ai_identified_problems_details": all_problems_one_column,
            "ai_identified_problems_list": problems_list,
            "ai_missed_or_failed_items": problems_list,
            "contact_person": biz.contact_person,
            "contact_title": biz.contact_title,
            "address": address,
            "city": loc.city if loc else None,
            "state": loc.state if loc else None,
            "country": loc.country if loc else None,
            "latitude": lat,
            "longitude": lon,
            "google_maps_url": gmaps_url,
            "google_search_url": gsearch_url,
            "facebook_url": meta.get("facebook_url"),
            "instagram_url": meta.get("instagram_url"),
            "linkedin_url": biz.linkedin_url,
            "tech_stack": {
                "cms_platform": meta.get("cms_platform") or ("WordPress" if meta.get("is_wordpress") else ("Custom Web App" if clean_dom else "No Website")),
                "has_meta_pixel": bool(meta.get("has_meta_pixel")),
                "has_google_analytics": bool(meta.get("has_google_analytics")),
                "has_viewport": bool(meta.get("has_viewport")),
                "has_ssl": bool(meta.get("has_ssl")),
            },
            "final_score": l.final_score,
            "tier": l.tier,
            "is_qualified": l.is_qualified,
            "primary_gap_summary": l.primary_gap_summary,
            "score_breakdown": score_breakdown,
            "ai_explanation": l.explanation_json,
            "suggested_services": service_matches_list,
            "evidence_parameters": evidence_items_list,
            "email_outreach_draft": {
                "is_ready": is_mail_ready,
                "subject": f"Quick inquiry regarding {biz.canonical_name if biz else 'your office'} in {address or 'your area'}",
                "body": (
                    f"Hello {biz.contact_person or 'Team'},\n\n"
                    f"I recently reviewed {biz.canonical_name if biz else 'your business'} in {address or 'your city'}. "
                    f"We noticed that {l.primary_gap_summary or 'there are major growth opportunities in your online presence'}. "
                    f"We have prepared tailored solutions that could help resolve this.\n\n"
                    f"Would you be open to a quick 3-minute discussion this week?\n\n"
                    f"Best regards"
                ),
            },
            "metadata": meta,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        })

    json_data = json.dumps(items, indent=2, ensure_ascii=False)
    filename = f"leads_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=json_data,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )

@router.get("/{lead_id}", response_model=LeadDetailResponse)
async def get_lead_detail(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Lead)
        .options(
            selectinload(Lead.scores),
            selectinload(Lead.feedback_entries),
            selectinload(Lead.business).selectinload(Business.locations),
            selectinload(Lead.business)
            .selectinload(Business.evidence)
            .selectinload(Evidence.parameter),
            selectinload(Lead.business)
            .selectinload(Business.evidence)
            .selectinload(Evidence.source),
        )
        .where((Lead.id == lead_id) | (Lead.business_id == lead_id))
    )
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    stmt_jobs = (
        select(ResearchJob)
        .where(
            (ResearchJob.business_id == lead.business_id) |
            ((ResearchJob.run_id == lead.run_id) & (ResearchJob.task_type == "discover_businesses"))
        )
        .order_by(ResearchJob.created_at.asc())
    )
    res_jobs = await db.execute(stmt_jobs)
    research_jobs = res_jobs.scalars().all()

    from app.models.autopilot import EmailOutreachLog
    stmt_logs = (
        select(EmailOutreachLog)
        .where(EmailOutreachLog.lead_id == lead.id)
        .order_by(EmailOutreachLog.sent_at.desc(), EmailOutreachLog.created_at.desc())
    )
    res_logs = await db.execute(stmt_logs)
    raw_logs = res_logs.scalars().all()
    outreach_logs_list = [
        {
            "id": str(log.id),
            "step": log.step,
            "recipient_email": log.recipient_email,
            "subject": log.subject,
            "body_snippet": log.body_snippet,
            "status": log.status,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "reply_content": log.reply_content,
            "reply_sentiment": log.reply_sentiment,
        }
        for log in raw_logs
    ]

    evidence_list = []
    if lead.business and lead.business.evidence:
        for ev in lead.business.evidence:
            source_url = ev.source.url if ev.source else None
            source_type = ev.source.source_type if ev.source else None
            evidence_list.append(
                EvidenceItemResponse(
                    parameter_id=ev.parameter_id,
                    parameter_name=ev.parameter.name if ev.parameter else f"Parameter #{ev.parameter_id}",
                    parameter_category=ev.parameter.category if ev.parameter else "General",
                    parameter_description=ev.parameter.description if ev.parameter else None,
                    evidence_text=ev.evidence_text,
                    source_url=source_url,
                    source_type=source_type,
                    status=ev.status,
                    confidence=ev.confidence,
                    recency_weight=ev.recency_weight,
                    classification=ev.classification,
                )
            )

    from app.models.parameter import Parameter
    params_stmt = select(Parameter).order_by(Parameter.id.asc())
    all_catalog_params = (await db.execute(params_stmt)).scalars().all()

    evidence_by_param = {ev.parameter_id: ev for ev in (lead.business.evidence or [])} if lead.business else {}

    all_parameters_matrix = []
    for p in all_catalog_params:
        ev = evidence_by_param.get(p.id)
        if ev:
            all_parameters_matrix.append({
                "parameter_id": p.id,
                "name": p.name,
                "category": p.category,
                "detection_type": p.detection_type,
                "default_weight": p.default_weight,
                "description": p.description,
                "status": ev.status,
                "confidence": ev.confidence,
                "evidence_text": ev.evidence_text,
                "classification": ev.classification,
                "source_url": ev.source.url if ev.source else None,
                "is_active_gap": ev.status in ("STRONG", "WEAK"),
            })
        else:
            if p.detection_type == "INTERNAL":
                status_val = "INTERNAL_CONFIDENTIAL"
                finding = "Non-public internal system; requires direct stakeholder consultation."
                conf = 0.5
            elif p.detection_type == "OBSERVABLE":
                status_val = "NOT_DETECTED"
                finding = "No public friction or defect detected during crawl."
                conf = 0.8
            else:
                status_val = "INSUFFICIENT_DATA"
                finding = "Insufficient secondary signals to verify operational status."
                conf = 0.6

            all_parameters_matrix.append({
                "parameter_id": p.id,
                "name": p.name,
                "category": p.category,
                "detection_type": p.detection_type,
                "default_weight": p.default_weight,
                "description": p.description,
                "status": status_val,
                "confidence": conf,
                "evidence_text": finding,
                "classification": p.detection_type,
                "source_url": None,
                "is_active_gap": False,
            })

    biz = lead.business
    meta = (biz.metadata_json or {}) if biz else {}
    loc = biz.locations[0] if (biz and biz.locations) else None
    lat = (loc.latitude if loc and loc.latitude is not None else None) or meta.get("latitude")
    lon = (loc.longitude if loc and loc.longitude is not None else None) or meta.get("longitude")
    address = (biz.address if biz and biz.address else None) or (loc.address if loc else None) or meta.get("address")

    if lat is not None and lon is not None:
        gmaps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
    elif meta.get("google_maps_url"):
        gmaps_url = meta.get("google_maps_url")
    else:
        name_addr = f"{biz.canonical_name if biz else ''} {address or ''}".strip()
        gmaps_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(name_addr)}" if name_addr else None

    gsearch_url = meta.get("google_search_url") or (
        f"https://www.google.com/search?q={urllib.parse.quote(biz.canonical_name)}" if biz else None
    )

    btype = (
        DiscoveryOptimizer.classify_entity(biz.canonical_name, biz.domain, biz.business_type)
        if (biz and biz.canonical_name)
        else (biz.business_type if biz else "Commercial Entity")
    )

    clean_biz_dom = lead.business.domain if lead.business else None
    if DeduplicationEngine.is_generic_platform(clean_biz_dom):
        clean_biz_dom = None

    has_scraped_email = bool(meta.get("extracted_email") or (lead.business and lead.business.email and not lead.business.email.startswith("contact@")))
    if lead.business and lead.business.email:
        resolved_email = lead.business.email
        email_status = "VERIFIED" if has_scraped_email else "SUGGESTED"
    elif clean_biz_dom:
        resolved_email = f"contact@{clean_biz_dom}"
        email_status = "SUGGESTED"
    else:
        resolved_email = None
        email_status = "NOT_FOUND"

    if lead.business and not lead.business.email and resolved_email:
        lead.business.email = resolved_email

    fit_t = getattr(lead, "fit_tier", None)
    why_us = getattr(lead, "why_they_need_us", None)
    what_need = getattr(lead, "what_they_need", None)
    call_script = getattr(lead, "discovery_call_script", None)
    matched_svc = getattr(lead, "matched_service", None)

    if not why_us or not call_script:
        loc_city = (loc.city if loc else None) or meta.get("city") or "Dhaka"
        use_kb = True
        if lead.run and hasattr(lead.run, "use_company_kb"):
            use_kb = bool(lead.run.use_company_kb)

        analyze_web = bool(getattr(lead.run, "analyze_website", False)) if lead.run else bool(meta.get("analyze_website", False))
        kb_dict = await FitGateEngine.fetch_active_kb_dict(db) if use_kb else None

        gate_res = FitGateEngine.evaluate_candidate(
            business_name=lead.business.canonical_name if lead.business else "Business",
            domain=clean_biz_dom,
            phone=lead.business.phone if lead.business else None,
            email=resolved_email,
            business_type=btype,
            city=loc_city,
            audit_res=meta.get("audit_summary") or {},
            detected_weaknesses=meta.get("detected_weaknesses") or [],
            metadata_json=meta,
            company_kb=kb_dict,
            use_company_kb=use_kb,
            analyze_website=analyze_web,
        )
        fit_t = gate_res["fit_tier"]
        why_us = gate_res["why_they_need_us"]
        what_need = gate_res["what_they_need"]
        call_script = gate_res["discovery_call_script"]
        matched_svc = gate_res["matched_service"]
        lead.fit_tier = fit_t
        lead.why_they_need_us = why_us
        lead.what_they_need = what_need
        lead.discovery_call_script = call_script
        lead.matched_service = matched_svc

    try:
        await db.commit()
    except Exception:
        pass

    return LeadDetailResponse(
        id=lead.id,
        business_id=lead.business_id,
        business_name=lead.business.canonical_name if lead.business else "Business",
        domain=clean_biz_dom,
        business_type=btype,
        phone=lead.business.phone if lead.business else None,
        email=resolved_email,
        email_status=email_status,
        contact_person=lead.business.contact_person if lead.business else None,
        contact_title=lead.business.contact_title if lead.business else None,
        address=address,
        linkedin_url=lead.business.linkedin_url if lead.business else None,
        google_maps_url=gmaps_url,
        google_search_url=gsearch_url,
        latitude=lat,
        longitude=lon,
        tier=lead.tier,
        final_score=lead.final_score,
        is_qualified=lead.is_qualified,
        primary_gap_summary=lead.primary_gap_summary,
        explanation_json=lead.explanation_json,
        fit_tier=fit_t or "HOT",
        why_they_need_us=why_us,
        what_they_need=what_need,
        discovery_call_script=call_script,
        matched_service=matched_svc,
        scores=lead.scores,
        feedback_entries=lead.feedback_entries,
        evidence=evidence_list,
        research_jobs=[
            ResearchJobSummaryResponse(
                id=j.id,
                task_type=j.task_type,
                status=j.status,
                attempt=j.attempt,
                payload_json=j.payload_json or {},
                result_json=j.result_json,
                error_message=j.error_message,
            )
            for j in research_jobs
        ],
        all_parameters_matrix=all_parameters_matrix,
        metadata_json=lead.business.metadata_json or {} if lead.business else {},
        outreach_logs=outreach_logs_list,
        outreach_status=lead.outreach_status,
        deal_status=lead.deal_status,
        created_at=lead.created_at,
    )

@router.post("/{lead_id}/feedback", response_model=LeadFeedbackResponse)
async def submit_lead_feedback(
    lead_id: uuid.UUID,
    data: LeadFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Lead).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    feedback = LeadFeedback(
        lead_id=lead.id,
        user_id=current_user.id,
        action=data.action.upper(),
        notes=data.notes,
    )
    db.add(feedback)

    act = data.action.upper()
    if act == "APPROVED":
        lead.outreach_status = "READY_FOR_OUTREACH"
        lead.tier = "Strong Potential"
        lead.is_qualified = True
        if lead.email_status == "NEEDS_REVIEW" or not lead.email_status:
            lead.email_status = "VALID"
    elif act in ["REJECTED", "DISCARDED"]:
        lead.outreach_status = "DISCARDED"
        lead.tier = "Rejected"
        lead.is_qualified = False

    await db.commit()
    await db.refresh(feedback)
    return feedback

@router.delete("/{lead_id}")
async def delete_single_lead(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ["super_admin", "admin"]:
        perms = current_user.permissions_json or {}
        if perms.get("can_delete_leads") is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission Denied: You do not have permission to delete leads.",
            )
    stmt = select(Lead).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    await db.delete(lead)
    await db.commit()
    return {"status": "SUCCESS", "message": f"Lead {lead_id} deleted"}

@router.delete("")
async def clear_all_leads(
    tier: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Only Super Admin can purge all leads and database records.",
        )

    from sqlalchemy import delete
    from app.models.research import ResearchRun, ResearchJob
    from app.models.autopilot import EmailOutreachLog, AutopilotCampaign
    from app.models.business import Business, BusinessLocation
    from app.models.evidence import Evidence
    from app.models.service import ServiceMatch

    if tier and tier.upper() != "ALL":
        stmt = delete(Lead).where(Lead.tier == tier)
        result = await db.execute(stmt)
        await db.commit()
        return {"status": "SUCCESS", "deleted_count": result.rowcount}

    await db.execute(delete(EmailOutreachLog))
    await db.execute(delete(LeadFeedback))
    await db.execute(delete(LeadScore))
    await db.execute(delete(ServiceMatch))
    await db.execute(delete(Lead))
    await db.execute(delete(ResearchJob))
    await db.execute(delete(ResearchRun))
    await db.execute(delete(AutopilotCampaign))
    await db.execute(delete(Evidence))
    await db.execute(delete(BusinessLocation))
    await db.execute(delete(Business))

    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.delete("leadgen:tasks")
        await r.aclose()
    except Exception:
        pass

    await db.commit()
    return {"status": "SUCCESS", "message": "All demo/test data, leads, research runs, campaigns, and history purged successfully."}

@router.patch("/{lead_id}", response_model=LeadDetailResponse)
async def update_lead_details(
    lead_id: uuid.UUID,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Lead).options(selectinload(Lead.business)).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    biz = lead.business
    if biz:
        if data.email is not None:
            biz.email = data.email.strip() if data.email.strip() else None
            if biz.email:
                lead.email_status = "VALID"
                lead.verification_notes = "Manually updated by reviewer"
            else:
                lead.email_status = "NOT_FOUND"

        if data.phone is not None:
            biz.phone = data.phone.strip() if data.phone.strip() else None
        if data.contact_person is not None:
            biz.contact_person = data.contact_person.strip() if data.contact_person.strip() else None
        if data.contact_title is not None:
            biz.contact_title = data.contact_title.strip() if data.contact_title.strip() else None
        if data.address is not None:
            biz.address = data.address.strip() if data.address.strip() else None

    if data.primary_gap_summary is not None:
        lead.primary_gap_summary = data.primary_gap_summary.strip()
    if data.tier is not None:
        lead.tier = data.tier
    if data.outreach_status is not None:
        lead.outreach_status = data.outreach_status
    if data.fit_tier is not None:
        lead.fit_tier = data.fit_tier
    if data.why_they_need_us is not None:
        lead.why_they_need_us = data.why_they_need_us.strip()
    if data.what_they_need is not None:
        lead.what_they_need = data.what_they_need.strip()
    if data.discovery_call_script is not None:
        lead.discovery_call_script = data.discovery_call_script.strip()
    if data.matched_service is not None:
        lead.matched_service = data.matched_service.strip()

    if data.approve_for_outreach is True:
        has_already_sent = bool(lead.followup_step and lead.followup_step > 0) or bool(lead.last_contacted_at)
        has_replied = lead.outreach_status in ("REPLIED_HOT", "REPLIED_NEUTRAL", "DISCARDED")
        if not has_already_sent and not has_replied:
            lead.outreach_status = "READY_FOR_OUTREACH"
        elif has_already_sent and not has_replied:
            lead.outreach_status = "SENT"

        lead.tier = "Strong Potential"
        lead.is_qualified = True
        if lead.email_status == "NEEDS_REVIEW" or not lead.email_status:
            lead.email_status = "VALID"

    await db.commit()
    return await get_lead_detail(lead_id=lead.id, db=db, current_user=current_user)

@router.post("/{lead_id}/evaluate-fit", response_model=LeadDetailResponse)
async def evaluate_lead_fit_gate(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Lead)
        .options(
            selectinload(Lead.business).selectinload(Business.locations),
        )
        .where((Lead.id == lead_id) | (Lead.business_id == lead_id))
    )
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    biz = lead.business
    meta = (biz.metadata_json or {}) if biz else {}
    loc = biz.locations[0] if (biz and biz.locations) else None
    loc_city = (loc.city if loc else None) or meta.get("city") or "Dhaka"
    clean_dom = biz.domain if biz else None
    if DeduplicationEngine.is_generic_platform(clean_dom):
        clean_dom = None

    use_kb = True
    if lead.run and hasattr(lead.run, "use_company_kb"):
        use_kb = bool(lead.run.use_company_kb)

    analyze_web = bool(getattr(lead.run, "analyze_website", False)) if lead.run else bool(meta.get("analyze_website", False))
    kb_dict = await FitGateEngine.fetch_active_kb_dict(db) if use_kb else None

    gate_res = FitGateEngine.evaluate_candidate(
        business_name=biz.canonical_name if biz else "Business",
        domain=clean_dom,
        phone=biz.phone if biz else None,
        email=biz.email if biz else None,
        business_type=biz.business_type if biz else "commercial",
        city=loc_city,
        audit_res=meta.get("audit_summary") or {},
        detected_weaknesses=meta.get("detected_weaknesses") or [],
        metadata_json=meta,
        company_kb=kb_dict,
        use_company_kb=use_kb,
        analyze_website=analyze_web,
    )
    lead.fit_tier = gate_res["fit_tier"]
    lead.why_they_need_us = gate_res["why_they_need_us"]
    lead.what_they_need = gate_res["what_they_need"]
    lead.discovery_call_script = gate_res["discovery_call_script"]
    lead.matched_service = gate_res["matched_service"]
    await db.commit()
    return await get_lead_detail(lead_id=lead.id, db=db, current_user=current_user)

@router.post("/dispatch-staggered")
async def dispatch_staggered_outreach(
    data: StaggeredDispatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import os
    import random
    import asyncio
    from datetime import timezone
    from app.engine.outreach_engine import OutreachEngine
    from app.models.autopilot import EmailOutreachLog

    stmt = select(Lead).options(selectinload(Lead.business))
    if data.lead_ids and len(data.lead_ids) > 0:
        stmt = stmt.where(Lead.id.in_(data.lead_ids))
    else:
        stmt = stmt.where(
            Lead.outreach_status.in_(["READY_FOR_OUTREACH", "HOLD", "PENDING"]),
            Lead.is_qualified == True,
            Lead.followup_step == 0,
            Lead.last_contacted_at.is_(None)
        )

    res = await db.execute(stmt)
    leads_to_send = res.scalars().all()

    if not leads_to_send:
        return {
            "status": "COMPLETED",
            "dispatched_count": 0,
            "results": [],
            "message": "No valid uncontacted leads found to dispatch."
        }

    from app.models.email_template import PersonaSignature, EmailTemplate
    p_stmt = select(PersonaSignature).where(PersonaSignature.is_active == True)
    p_res = await db.execute(p_stmt)
    active_personas = [
        {"name": p.name, "title": p.title, "company": p.company, "raw_content": p.render_signature()}
        for p in p_res.scalars().all()
    ]

    t_stmt = select(EmailTemplate).where(EmailTemplate.name == "default", EmailTemplate.is_active == True)
    t_res = await db.execute(t_stmt)
    active_tpl = t_res.scalar_one_or_none()

    is_live = await OutreachEngine.is_smtp_configured(db=db)

    dispatched = 0
    results = []

    for idx, lead in enumerate(leads_to_send):
        biz = lead.business
        if not biz or not biz.email:
            continue

        # Strict Safety Guard: Never re-dispatch to leads already sent or replied
        if (lead.followup_step and lead.followup_step > 0) or lead.last_contacted_at:
            logger.info(f"[Outreach Guard] Skipping '{biz.canonical_name}' - already contacted.")
            continue
        if lead.outreach_status in ("SENT", "FOLLOWUP_SENT", "REPLIED_HOT", "REPLIED_NEUTRAL", "DISCARDED"):
            logger.info(f"[Outreach Guard] Skipping '{biz.canonical_name}' - status is '{lead.outreach_status}'.")
            continue

        recipient = biz.email.strip()
        subject, body = OutreachEngine.render_email(
            step=1,
            lead_data={
                "company_name": biz.canonical_name,
                "contact_person": biz.contact_person or "Executive",
                "city": biz.address or "",
                "website": getattr(biz, "domain", ""),
                "industry": getattr(biz, "business_type", ""),
                "primary_gap": lead.primary_gap_summary,
                "why_they_need_us": getattr(lead, "why_they_need_us", None) or lead.primary_gap_summary,
                "what_they_need": getattr(lead, "what_they_need", None) or "",
                "matched_service": getattr(lead, "matched_service", None) or "",
                "personas": active_personas,
                "custom_template": active_tpl
            }
        )

        success, note = await OutreachEngine.dispatch_smtp_email(
            recipient_email=recipient,
            subject=subject,
            body=body,
            dry_run=not is_live,
            db=db
        )

        if success:
            lead.outreach_status = "SENT"
            lead.followup_step = 1
            lead.last_contacted_at = datetime.now(timezone.utc)

            log = EmailOutreachLog(
                lead_id=lead.id,
                step=1,
                recipient_email=recipient,
                subject=subject,
                body_snippet=body,
                status="SENT",
                error_message=note,
                sent_at=datetime.now(timezone.utc)
            )
            db.add(log)
            dispatched += 1
            results.append({"lead_id": str(lead.id), "company": biz.canonical_name, "email": recipient, "status": "SENT", "note": note})
        else:
            results.append({"lead_id": str(lead.id), "company": biz.canonical_name, "email": recipient, "status": "FAILED", "note": note})

        await db.commit()

        if idx < len(leads_to_send) - 1:
            delay = random.uniform(data.min_delay_sec, data.max_delay_sec)
            await asyncio.sleep(delay)

    return {
        "status": "COMPLETED",
        "mode": "LIVE SMTP" if is_live else "SIMULATED (DRY-RUN)",
        "dispatched_count": dispatched,
        "results": results,
        "message": f"Successfully dispatched {dispatched} emails with human-paced anti-spam timing."
    }

