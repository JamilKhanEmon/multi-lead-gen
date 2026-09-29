"""
Qualified Lead Pipeline & Dossier Endpoints
"""
import uuid
import urllib.parse
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
from app.api.deps import get_db, get_current_user
from app.models.lead import Lead, LeadScore, LeadFeedback
from app.models.business import Business
from app.models.evidence import Evidence
from app.models.research import ResearchJob
from app.models.audit import User
from app.engine.discovery_optimizer import DiscoveryOptimizer
from app.engine.deduplication import DeduplicationEngine, GENERIC_PLATFORM_DOMAINS
from app.schemas.lead import (
    LeadResponse,
    LeadDetailResponse,
    LeadFeedbackCreate,
    LeadFeedbackResponse,
    EvidenceItemResponse,
    ResearchJobSummaryResponse,
)

router = APIRouter(prefix="/leads", tags=["Leads"])


@router.get("", response_model=List[LeadResponse])
async def list_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=10000),
    tier: Optional[str] = None,  # Strong Potential, Review Needed, Rejected
    run_id: Optional[uuid.UUID] = None,
    is_qualified: Optional[bool] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Filter and list potential leads."""
    stmt = (
        select(Lead)
        .options(
            selectinload(Lead.business).selectinload(Business.locations)
        )
    )

    if tier:
        stmt = stmt.where(Lead.tier == tier)
    if run_id:
        stmt = stmt.where(Lead.run_id == run_id)
    if is_qualified is not None:
        stmt = stmt.where(Lead.is_qualified == is_qualified)
    if min_score is not None:
        stmt = stmt.where(Lead.final_score >= min_score)

    stmt = stmt.order_by(desc(Lead.final_score)).offset(skip).limit(limit)
    res = await db.execute(stmt)
    leads = res.scalars().all()

    # Auto-clean legacy generic platform records & dummy/test records from DB
    try:
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
            (Business.canonical_name == "google")
        )
        c_res = await db.execute(cleanup_stmt)
        bad_leads = c_res.scalars().all()
        if bad_leads:
            for bl in bad_leads:
                await db.delete(bl)
            await db.commit()
    except Exception:
        pass

    lead_items = []
    for l in leads:
        biz = l.business
        if not biz:
            continue
        biz_name_l = (biz.canonical_name or "").lower().strip()
        biz_dom_l = (biz.domain or "").lower().strip()

        # Reject generic social platform entities (e.g. facebook.com)
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

        if not biz.email and resolved_email:
            biz.email = resolved_email

        has_contact = bool(biz.phone or resolved_email)
        # If lead has neither phone nor email, it cannot be qualified for outreach
        if l.is_qualified and not has_contact:
            l.is_qualified = False
            if l.tier != "Rejected":
                l.tier = "Rejected"

        if is_qualified is True and not has_contact:
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
                email_status=email_status,
                contact_person=biz.contact_person if biz else None,
                contact_title=biz.contact_title if biz else None,
                address=address,
                business_type=btype,
                google_maps_url=gmaps_url,
                google_search_url=gsearch_url,
                latitude=lat,
                longitude=lon,
            )
        )

    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return lead_items


@router.get("/{lead_id}", response_model=LeadDetailResponse)
async def get_lead_detail(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve complete lead dossier with evidence, scores, research jobs, and feedback."""
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

    # Fetch associated research jobs for raw scraping details
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

    # Fetch complete catalog of all 135 parameters for A-to-Z profile matrix
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
        created_at=lead.created_at,
    )


@router.post("/{lead_id}/feedback", response_model=LeadFeedbackResponse)
async def submit_lead_feedback(
    lead_id: uuid.UUID,
    data: LeadFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit reviewer feedback (approve, reject, flag incorrect weakness/service)."""
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
    await db.commit()
    await db.refresh(feedback)
    return feedback


@router.delete("/{lead_id}")
async def delete_single_lead(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a specific lead from the pipeline."""
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
    """Clear all leads or leads matching a specific tier."""
    from sqlalchemy import delete
    stmt = delete(Lead)
    if tier and tier.upper() != "ALL":
        stmt = stmt.where(Lead.tier == tier)

    result = await db.execute(stmt)
    await db.commit()
    return {"status": "SUCCESS", "deleted_count": result.rowcount}
