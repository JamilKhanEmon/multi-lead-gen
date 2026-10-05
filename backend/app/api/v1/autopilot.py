"""
Autopilot & Cold Email Outreach API Endpoints
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, desc, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.autopilot import AutopilotCampaign, EmailOutreachLog
from app.models.lead import Lead
from app.models.business import Business, BusinessLocation
from app.models.audit import User
from app.api.deps import get_current_user
from app.engine.email_verifier import EmailVerifier
from app.engine.outreach_engine import OutreachEngine
from app.engine.autopilot_runner import AutopilotRunner

router = APIRouter(prefix="/autopilot", tags=["Autopilot & Outreach"])


# --- Pydantic Schemas ---
class CampaignCreate(BaseModel):
    name: str = Field(..., example="Dhaka IT & Software Outreach")
    keywords: List[str] = Field(default_factory=lambda: ["Software Agency", "Web Development"])
    country: str = Field(default="Bangladesh")
    sub_cities: List[str] = Field(default_factory=lambda: ["Uttara", "Gazipur", "Mirpur", "Tangail"])
    daily_lead_limit: int = Field(default=100)
    daily_email_limit: int = Field(default=50)
    is_unlimited_leads: bool = Field(default=False)
    auto_mail_enabled: bool = Field(default=True)


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[List[str]] = None
    country: Optional[str] = None
    sub_cities: Optional[List[str]] = None
    daily_lead_limit: Optional[int] = None
    daily_email_limit: Optional[int] = None
    is_unlimited_leads: Optional[bool] = None
    auto_mail_enabled: Optional[bool] = None
    is_active: Optional[bool] = None


class VerifyEmailRequest(BaseModel):
    new_email: Optional[str] = None
    approve_for_outreach: bool = True
    notes: Optional[str] = None


class ReplySimulatorRequest(BaseModel):
    reply_text: str = Field(..., example="Yes, please send me details about your pricing.")


def check_autopilot_permission(user: User, required_perm: str = "can_access_autopilot"):
    """
    Enforces Super Admin privilege by default.
    Only allows non-super_admin users if Super Admin specifically granted the specific permission.
    """
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required to access Autopilot.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.role == "super_admin":
        return
    perms = user.permissions_json or {}
    if perms.get("all") is True:
        return
    
    # 1. Base access check
    if perms.get("can_access_autopilot") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Autonomous Cold Email & Autopilot Outreach is strictly controlled by Super Admin. Contact Super Admin to request access."
        )

    # 2. Granular sub-permission check (e.g. search input/campaign creation)
    if required_perm != "can_access_autopilot" and perms.get(required_perm) is not True:
        perm_labels = {
            "can_create_autopilot_campaigns": "configure search inputs, keywords, and new campaigns",
            "can_run_autopilot_cycle": "manually trigger search and outreach batches",
            "can_verify_autopilot_leads": "verify and approve leads into outreach queue"
        }
        label = perm_labels.get(required_perm, required_perm)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission Denied: You do not have permission to {label}. This action is controlled by Super Admin."
        )


# --- Endpoints ---

@router.get("/campaigns")
async def list_campaigns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all Autopilot campaigns ordered by creation date."""
    check_autopilot_permission(current_user, "can_access_autopilot")
    stmt = select(AutopilotCampaign).order_by(desc(AutopilotCampaign.created_at))
    res = await db.execute(stmt)
    campaigns = res.scalars().all()
    return campaigns


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
async def create_campaign(
    data: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new Autopilot discovery and cold outreach campaign."""
    check_autopilot_permission(current_user, "can_create_autopilot_campaigns")
    campaign = AutopilotCampaign(
        name=data.name,
        keywords=data.keywords,
        country=data.country,
        sub_cities=data.sub_cities,
        daily_lead_limit=data.daily_lead_limit,
        daily_email_limit=data.daily_email_limit,
        is_unlimited_leads=data.is_unlimited_leads,
        auto_mail_enabled=data.auto_mail_enabled,
        is_active=True,
        status="IDLE",
        created_by_user_id=current_user.id if current_user else None
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: uuid.UUID,
    data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update campaign parameters or pause/activate."""
    check_autopilot_permission(current_user, "can_create_autopilot_campaigns")
    stmt = select(AutopilotCampaign).where(AutopilotCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(campaign, field, val)

    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/run-now")
async def trigger_campaign_run(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Trigger an immediate batch discovery and verification run for this campaign."""
    check_autopilot_permission(current_user, "can_run_autopilot_cycle")
    stmt = select(AutopilotCampaign).where(AutopilotCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    result = await AutopilotRunner.run_campaign_batch(
        db=db,
        campaign=campaign,
        batch_size=15
    )
    return result


@router.post("/dispatch-queue")
async def dispatch_outreach_queue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Dispatches cold email outreach sequence for all leads in READY_FOR_OUTREACH queue."""
    check_autopilot_permission(current_user, "can_run_autopilot_cycle")
    stmt = (
        select(Lead)
        .options(selectinload(Lead.business))
        .where(Lead.outreach_status == "READY_FOR_OUTREACH", Lead.is_qualified == True)
    )
    res = await db.execute(stmt)
    ready_leads = res.scalars().all()

    dispatched = 0
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    is_live = bool(smtp_host and smtp_user)

    for lead in ready_leads:
        biz = lead.business
        recipient = biz.email or "softvence.jamil@gmail.com"

        subject, body = OutreachEngine.render_email(
            step=1,
            lead_data={
                "company_name": biz.canonical_name,
                "contact_person": biz.contact_person or "Executive",
                "city": biz.address or "Dhaka",
                "primary_gap": lead.primary_gap_summary
            }
        )

        success, note = await OutreachEngine.dispatch_smtp_email(
            recipient_email=recipient,
            subject=subject,
            body=body,
            dry_run=not is_live
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
                body_snippet=body[:300],
                status="SENT",
                sent_at=datetime.now(timezone.utc)
            )
            db.add(log)
            dispatched += 1

    await db.commit()
    return {
        "status": "COMPLETED",
        "mode": "LIVE SMTP" if is_live else "SIMULATED (DRY-RUN)",
        "dispatched_count": dispatched,
        "message": f"Successfully sent {dispatched} outreach emails to {recipient}"
    }


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an Autopilot campaign."""
    check_autopilot_permission(current_user, "can_create_autopilot_campaigns")
    stmt = select(AutopilotCampaign).where(AutopilotCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    await db.delete(campaign)
    await db.commit()
    return {"message": "Campaign deleted successfully"}


@router.get("/analytics")
async def get_executive_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Super Admin Executive KPI Analytics:
    Total Leads, Emails Sent, Replies, Hot Deals, Today's metrics, and Stage breakdowns.
    """
    check_autopilot_permission(current_user)
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    # 1. Total Leads
    total_leads_res = await db.execute(select(func.count(Lead.id)))
    total_leads = total_leads_res.scalar() or 0

    # 2. Leads today
    today_leads_res = await db.execute(select(func.count(Lead.id)).where(Lead.created_at >= today_start))
    today_leads = today_leads_res.scalar() or 0

    # 3. Ready for Mail count
    ready_mail_res = await db.execute(
        select(func.count(Lead.id)).where(
            or_(
                Lead.outreach_status == "READY_FOR_OUTREACH",
                and_(Lead.email_status == "VALID", Lead.outreach_status == "PENDING")
            )
        )
    )
    ready_for_mail = ready_mail_res.scalar() or 0

    # 4. Needs Review count
    needs_review_res = await db.execute(
        select(func.count(Lead.id)).where(
            or_(
                Lead.email_status == "NEEDS_REVIEW",
                Lead.outreach_status == "NEEDS_REVIEW"
            )
        )
    )
    needs_review = needs_review_res.scalar() or 0

    # 5. Total Sent
    total_sent_res = await db.execute(
        select(func.count(Lead.id)).where(Lead.outreach_status.in_(["SENT", "FOLLOWUP_SENT", "REPLIED_HOT"]))
    )
    total_sent = total_sent_res.scalar() or 0

    # 6. Emails sent today
    sent_today_res = await db.execute(
        select(func.count(EmailOutreachLog.id)).where(EmailOutreachLog.sent_at >= today_start)
    )
    sent_today = sent_today_res.scalar() or 0

    # 7. Hot Deals
    hot_deals_res = await db.execute(
        select(func.count(Lead.id)).where(
            or_(Lead.deal_status == "HOT_LEAD", Lead.outreach_status == "REPLIED_HOT")
        )
    )
    hot_deals = hot_deals_res.scalar() or 0

    # 8. Total Replies
    replies_res = await db.execute(
        select(func.count(EmailOutreachLog.id)).where(EmailOutreachLog.reply_content.is_not(None))
    )
    total_replies = replies_res.scalar() or 0

    # Calculate Response Rate
    response_rate = round((total_replies / total_sent * 100), 1) if total_sent > 0 else 0.0

    return {
        "total_leads": total_leads,
        "today_leads": today_leads,
        "ready_for_mail": ready_for_mail,
        "needs_review": needs_review,
        "total_sent": total_sent,
        "sent_today": sent_today,
        "hot_deals": hot_deals,
        "total_replies": total_replies,
        "response_rate": response_rate,
        "anti_spam_delay_seconds": "120-240s (Simulated Human Jitter)"
    }


@router.get("/activity")
async def get_live_activity_stream(
    db: AsyncSession = Depends(get_db),
    limit: int = 20
):
    """Live activity ticker of recent outreach logs and discovery events."""
    stmt = (
        select(EmailOutreachLog)
        .options(selectinload(EmailOutreachLog.lead).selectinload(Lead.business))
        .order_by(desc(EmailOutreachLog.created_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    feed = []
    for log in logs:
        biz_name = log.lead.business.canonical_name if log.lead and log.lead.business else "Target Lead"
        feed.append({
            "id": str(log.id),
            "step": log.step,
            "business_name": biz_name,
            "recipient_email": log.recipient_email,
            "subject": log.subject,
            "status": log.status,
            "sent_at": log.sent_at or log.created_at,
            "reply_sentiment": log.reply_sentiment
        })

    return feed


@router.post("/leads/{lead_id}/verify-email")
async def human_verify_lead_email(
    lead_id: uuid.UUID,
    data: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Human Review Action:
    Reviewer enters correct email or approves current email.
    Moves lead from 'NEEDS_REVIEW' to 'READY_FOR_OUTREACH'.
    """
    check_autopilot_permission(current_user, "can_verify_autopilot_leads")
    stmt = select(Lead).options(selectinload(Lead.business)).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if data.new_email and data.new_email.strip():
        lead.business.email = data.new_email.strip()
        # Re-verify
        v_status, v_note = await EmailVerifier.verify(data.new_email.strip())
        lead.email_status = v_status
        lead.verification_notes = f"Updated by reviewer: {v_note}"
    else:
        lead.email_status = "VALID"
        lead.verification_notes = "Manually approved by human reviewer"

    if data.approve_for_outreach:
        lead.outreach_status = "READY_FOR_OUTREACH"
        lead.tier = "Strong Potential"
        lead.is_qualified = True
        if lead.email_status == "NEEDS_REVIEW" or not lead.email_status:
            lead.email_status = "VALID"

    if data.notes:
        lead.outreach_notes = data.notes

    await db.commit()
    return {"message": "Lead verified and moved to Outreach Queue", "email_status": lead.email_status}


@router.post("/leads/{lead_id}/mark-hot")
async def mark_lead_as_hot_deal(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move lead to Hot Deals CRM board for manual sales closing."""
    check_autopilot_permission(current_user, "can_access_autopilot")
    stmt = select(Lead).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead.deal_status = "HOT_LEAD"
    lead.outreach_status = "REPLIED_HOT"
    await db.commit()
    return {"message": "Lead flagged as Hot Deal"}


@router.post("/leads/{lead_id}/simulate-reply")
async def simulate_incoming_reply(
    lead_id: uuid.UUID,
    data: ReplySimulatorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulates receiving an inbound reply email.
    Analyzes sentiment: if positive, flags lead as HOT_DEAL and stops outreach!
    """
    check_autopilot_permission(current_user, "can_access_autopilot")
    stmt = select(Lead).options(selectinload(Lead.business)).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    sentiment, explanation = OutreachEngine.classify_reply_sentiment(data.reply_text)

    if sentiment == "POSITIVE":
        lead.deal_status = "HOT_LEAD"
        lead.outreach_status = "REPLIED_HOT"
    elif sentiment == "NEGATIVE":
        lead.deal_status = "CLOSED_LOST"
        lead.outreach_status = "DISCARDED"
    else:
        lead.outreach_status = "REPLIED_NEUTRAL"

    # Log reply
    log = EmailOutreachLog(
        lead_id=lead.id,
        step=lead.followup_step or 1,
        recipient_email=lead.business.email or "client@example.com",
        subject=f"Re: Outreach Response - {lead.business.canonical_name}",
        body_snippet=data.reply_text[:300],
        status=f"REPLIED_{sentiment}",
        reply_content=data.reply_text,
        reply_sentiment=sentiment,
        sent_at=datetime.now(timezone.utc)
    )
    db.add(log)
    await db.commit()

    return {
        "lead_id": str(lead.id),
        "sentiment": sentiment,
        "explanation": explanation,
        "new_deal_status": lead.deal_status,
        "new_outreach_status": lead.outreach_status
    }
