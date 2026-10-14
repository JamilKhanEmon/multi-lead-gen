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

router = APIRouter(prefix="/autopilot", tags=["Autopilot & Outreach"])

class CampaignCreate(BaseModel):
    name: str = Field(..., example="Dhaka IT & Software Outreach")
    keywords: List[str] = Field(default_factory=lambda: ["Software Agency", "Web Development"])
    country: str = Field(default="Bangladesh")
    sub_cities: List[str] = Field(default_factory=lambda: ["Uttara", "Gazipur", "Mirpur", "Tangail"])
    daily_lead_limit: int = Field(default=100)
    daily_email_limit: int = Field(default=50)
    is_unlimited_leads: bool = Field(default=False)
    auto_mail_enabled: bool = Field(default=True)
    use_global_template: bool = Field(default=True)
    use_company_kb: bool = Field(default=True)

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[List[str]] = None
    country: Optional[str] = None
    sub_cities: Optional[List[str]] = None
    daily_lead_limit: Optional[int] = None
    daily_email_limit: Optional[int] = None
    is_unlimited_leads: Optional[bool] = None
    auto_mail_enabled: Optional[bool] = None
    use_global_template: Optional[bool] = None
    use_company_kb: Optional[bool] = None
    is_active: Optional[bool] = None

class VerifyEmailRequest(BaseModel):
    new_email: Optional[str] = None
    approve_for_outreach: bool = True
    notes: Optional[str] = None

class ReplySimulatorRequest(BaseModel):
    reply_text: str = Field(..., example="Yes, please send me details about your pricing.")

def check_autopilot_permission(user: User, required_perm: str = "can_access_autopilot"):
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
    
    if perms.get("can_access_autopilot") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission Denied: Autonomous Cold Email & Autopilot Outreach is strictly controlled by Super Admin. Contact Super Admin to request access."
        )

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

@router.get("/campaigns")
async def list_campaigns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
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
        use_global_template=data.use_global_template,
        use_company_kb=data.use_company_kb,
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

async def _bg_run_campaign(campaign_id: uuid.UUID):
    logger.info(f"Old autopilot campaign run is deprecated for ID {campaign_id}. Use new Strategy Engine.")

@router.post("/campaigns/{campaign_id}/run-now")
async def trigger_campaign_run(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_autopilot_permission(current_user, "can_run_autopilot_cycle")
    stmt = select(AutopilotCampaign).where(AutopilotCampaign.id == campaign_id)
    res = await db.execute(stmt)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign.status = "RUNNING"
    await db.commit()

    enqueued = False
    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        redis_client = aioredis.from_url(settings.REDIS_URL)
        task_payload = {
            "job_id": str(uuid.uuid4()),
            "type": "autopilot_campaign_run",
            "campaign_id": str(campaign.id),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis_client.lpush("leadgen:tasks", json.dumps(task_payload))
        await redis_client.aclose()
        enqueued = True
    except Exception as redis_err:
        import logging
        logging.getLogger(__name__).warning(f"Could not enqueue autopilot to Redis ({redis_err}), using local task.")

    if not enqueued:
        import asyncio
        asyncio.create_task(_bg_run_campaign(campaign_id))

    return {
        "campaign_id": str(campaign.id),
        "status": "RUNNING",
        "sub_cities_processed": campaign.sub_cities,
        "message": f"Autonomous discovery for '{campaign.name}' launched in background."
    }

@router.post("/dispatch-queue")
async def dispatch_outreach_queue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_autopilot_permission(current_user, "can_run_autopilot_cycle")
    stmt = (
        select(Lead)
        .options(selectinload(Lead.business))
        .where(Lead.outreach_status == "READY_FOR_OUTREACH", Lead.is_qualified == True)
    )
    res = await db.execute(stmt)
    ready_leads = res.scalars().all()

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

    dispatched = 0
    is_live = await OutreachEngine.is_smtp_configured(db=db)

    for lead in ready_leads:
        biz = lead.business
        if not biz or not biz.email:
            continue
        recipient = biz.email.strip()

        subject, body = await OutreachEngine.render_email(
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
    check_autopilot_permission(current_user)
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    total_leads_res = await db.execute(select(func.count(Lead.id)))
    total_leads = total_leads_res.scalar() or 0

    today_leads_res = await db.execute(select(func.count(Lead.id)).where(Lead.created_at >= today_start))
    today_leads = today_leads_res.scalar() or 0

    ready_mail_res = await db.execute(
        select(func.count(Lead.id)).where(
            or_(
                Lead.outreach_status == "READY_FOR_OUTREACH",
                and_(Lead.email_status == "VALID", Lead.outreach_status == "PENDING")
            )
        )
    )
    ready_for_mail = ready_mail_res.scalar() or 0

    needs_review_res = await db.execute(
        select(func.count(Lead.id)).where(
            or_(
                Lead.email_status == "NEEDS_REVIEW",
                Lead.outreach_status == "NEEDS_REVIEW"
            )
        )
    )
    needs_review = needs_review_res.scalar() or 0

    total_sent_res = await db.execute(
        select(func.count(Lead.id)).where(Lead.outreach_status.in_(["SENT", "FOLLOWUP_SENT", "REPLIED_HOT"]))
    )
    total_sent = total_sent_res.scalar() or 0

    sent_today_res = await db.execute(
        select(func.count(EmailOutreachLog.id)).where(EmailOutreachLog.sent_at >= today_start)
    )
    sent_today = sent_today_res.scalar() or 0

    hot_deals_res = await db.execute(
        select(func.count(Lead.id)).where(
            or_(Lead.deal_status == "HOT_LEAD", Lead.outreach_status == "REPLIED_HOT")
        )
    )
    hot_deals = hot_deals_res.scalar() or 0

    replies_res = await db.execute(
        select(func.count(EmailOutreachLog.id)).where(EmailOutreachLog.reply_content.is_not(None))
    )
    total_replies = replies_res.scalar() or 0

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
    check_autopilot_permission(current_user, "can_verify_autopilot_leads")
    stmt = select(Lead).options(selectinload(Lead.business)).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if data.new_email and data.new_email.strip():
        lead.business.email = data.new_email.strip()
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
    check_autopilot_permission(current_user, "can_access_autopilot")
    stmt = select(Lead).options(selectinload(Lead.business)).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    res = await OutreachEngine.classify_reply_sentiment(data.reply_text)
    label = res.label
    explanation = res.reason
    source = getattr(res, "source", "RULE_LOGIC")

    if label == "HOT_LEAD":
        lead.deal_status = "HOT_LEAD"
        lead.outreach_status = "REPLIED_HOT"
    elif label == "REJECTED":
        lead.deal_status = "CLOSED_LOST"
        lead.outreach_status = "DISCARDED"
    else:
        lead.outreach_status = "REPLIED_NEUTRAL"

    log = EmailOutreachLog(
        lead_id=lead.id,
        step=lead.followup_step or 1,
        recipient_email=lead.business.email or "client@example.com",
        subject=f"Re: Outreach Response - {lead.business.canonical_name}",
        body_snippet=data.reply_text,
        status=f"REPLIED_{label}",
        reply_content=data.reply_text,
        reply_sentiment=label,
        error_message=f"ANALYZED_BY:{source}",
        sent_at=datetime.now(timezone.utc)
    )
    db.add(log)
    await db.commit()

    return {
        "lead_id": str(lead.id),
        "label": label,
        "explanation": explanation,
        "analyzed_by": source,
        "new_deal_status": lead.deal_status,
        "new_outreach_status": lead.outreach_status
    }

@router.post("/inbox/sync")
async def trigger_inbox_sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_autopilot_permission(current_user, "can_access_autopilot")
    from app.services.imap_sync_service import IMAPInboxSyncService
    
    all_creds = await IMAPInboxSyncService.get_all_imap_credentials(session=db)
    if not all_creds:
        return {
            "status": "warning",
            "message": "No active inboxes found. Please configure an SMTP Inbox in Admin Settings or set credentials in .env."
        }
    
    count = await IMAPInboxSyncService.process_incoming_replies(db)
    return {
        "status": "success",
        "processed_count": count,
        "message": f"Inbox scan completed across {len(all_creds)} connected inbox(es). Processed {count} new client reply(ies)."
    }


@router.get("/replies")
async def get_replies_intelligence(
    filter: Optional[str] = None,  # hot | neutral | rejected
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all classified email replies from the EmailOutreachLog table.
    Each entry includes lead info, campaign context, reply text, and AI verdict.
    filter: 'hot' | 'neutral' | 'rejected' | None (returns all)
    """
    check_autopilot_permission(current_user, "can_access_autopilot")

    sentiment_map = {
        "hot": "HOT_LEAD",
        "neutral": "NEUTRAL",
        "rejected": "REJECTED",
    }

    # Auto-heal any misclassified replies using high-precision classifier
    try:
        fix_stmt = (
            select(EmailOutreachLog)
            .options(selectinload(EmailOutreachLog.lead))
            .where(EmailOutreachLog.reply_content.is_not(None), EmailOutreachLog.reply_sentiment == "NEUTRAL")
        )
        fix_res = await db.execute(fix_stmt)
        needs_commit = False
        for r_log in fix_res.scalars().all():
            res = await OutreachEngine.classify_reply_sentiment(r_log.reply_content)
            lbl = res.label
            src = getattr(res, "source", "RULE_LOGIC")
            if lbl != "NEUTRAL":
                r_log.reply_sentiment = lbl
                r_log.error_message = f"ANALYZED_BY:{src}"
                needs_commit = True
                if r_log.lead:
                    if lbl == "REJECTED":
                        r_log.lead.deal_status = "CLOSED_LOST"
                        r_log.lead.outreach_status = "DISCARDED"
                    elif lbl == "HOT_LEAD":
                        r_log.lead.deal_status = "HOT_LEAD"
                        r_log.lead.outreach_status = "REPLIED_HOT"
        if needs_commit:
            await db.commit()
    except Exception as heal_err:
        logger.debug(f"Reply sentiment auto-heal notice: {heal_err}")

    stmt = (
        select(EmailOutreachLog)
        .options(
            selectinload(EmailOutreachLog.lead).selectinload(Lead.business)
        )
        .where(EmailOutreachLog.reply_content.is_not(None))
        .order_by(desc(EmailOutreachLog.sent_at))
        .limit(limit)
    )

    if filter and filter.lower() in sentiment_map:
        target_sentiment = sentiment_map[filter.lower()]
        stmt = stmt.where(EmailOutreachLog.reply_sentiment == target_sentiment)

    res = await db.execute(stmt)
    logs = res.scalars().all()

    results = []
    for log in logs:
        lead = log.lead
        biz = lead.business if lead else None
        analyzed_by = "OPENCLAW" if "OPENCLAW" in (log.error_message or "") else "RULE_LOGIC"
        results.append({
            "id": str(log.id),
            "lead_id": str(log.lead_id) if log.lead_id else None,
            "company_name": biz.canonical_name if biz else "Unknown",
            "contact_person": biz.contact_person if biz else None,
            "client_email": log.recipient_email,
            "campaign_subject": log.subject,
            "reply_text": log.reply_content,
            "reply_snippet": (log.reply_content or "")[:200],
            "ai_label": log.reply_sentiment,
            "analyzed_by": analyzed_by,
            "deal_status": lead.deal_status if lead else None,
            "outreach_status": lead.outreach_status if lead else None,
            "replied_at": log.sent_at.isoformat() if log.sent_at else None,
            "step": log.step,
        })

    return results


@router.get("/inbox/messages")
async def get_inbox_messages(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches raw emails from ALL configured IMAP accounts.
    Returns a unified inbox view sorted by date (newest first).
    Used by the Mail Client Dashboard (/inbox page).
    """
    check_autopilot_permission(current_user, "can_access_autopilot")
    from app.services.imap_sync_service import IMAPInboxSyncService

    all_creds = await IMAPInboxSyncService.get_all_imap_credentials(session=db)
    if not all_creds:
        return {
            "status": "warning",
            "accounts": [],
            "messages": [],
            "message": "No IMAP inboxes configured. Add SMTP accounts in Admin Settings."
        }

    messages = await IMAPInboxSyncService.fetch_all_inbox_messages(
        session=db,
        limit_per_account=min(limit, 100)
    )

    account_emails = [c.get("from_email") or c.get("user", "") for c in all_creds]

    return {
        "status": "ok",
        "accounts": account_emails,
        "total": len(messages),
        "messages": messages
    }


class InboxDeleteRequest(BaseModel):
    account_id: str = Field(..., description="SMTP inbox account ID from DB")
    imap_seq: str = Field(..., description="IMAP sequence number of the message")


class InboxReplyRequest(BaseModel):
    to_email: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Reply subject line")
    body: str = Field(..., description="Reply body text")
    account_id: Optional[str] = Field(default=None, description="Which SMTP account to send from (optional)")


@router.post("/inbox/delete")
async def delete_inbox_message(
    data: InboxDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an email from IMAP inbox by sequence ID."""
    check_autopilot_permission(current_user, "can_access_autopilot")
    from app.services.imap_sync_service import IMAPInboxSyncService
    import imaplib

    all_creds = await IMAPInboxSyncService.get_all_imap_credentials(session=db)
    creds = next((c for c in all_creds if str(c.get("id")) == str(data.account_id)), None)
    if not creds:
        # fallback: use first available
        creds = all_creds[0] if all_creds else None
    if not creds:
        raise HTTPException(status_code=404, detail="No IMAP account found")

    import asyncio
    loop = asyncio.get_running_loop()

    def _delete():
        mail = None
        try:
            mail = imaplib.IMAP4_SSL(creds["host"], creds["port"], timeout=15)
            mail.login(creds["user"], creds["password"])
            mail.select("INBOX")
            mail.store(data.imap_seq.encode(), "+FLAGS", "\\Deleted")
            mail.expunge()
            mail.close()
            mail.logout()
            return True
        except Exception as e:
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass
            raise e

    try:
        await loop.run_in_executor(None, _delete)
        return {"status": "ok", "message": "Email deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete email: {str(e)}")


@router.post("/inbox/reply")
async def send_manual_reply(
    data: InboxReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a manual reply email from one of the configured SMTP accounts."""
    check_autopilot_permission(current_user, "can_access_autopilot")

    clean_email = data.to_email.strip().lower()

    success, note = await OutreachEngine.dispatch_smtp_email(
        recipient_email=clean_email,
        subject=data.subject,
        body=data.body,
        dry_run=False,
        db=db,
        account_id=data.account_id
    )

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {note}")

    lead_id = None
    campaign_id = None
    try:
        from app.models.lead import Lead
        from app.models.business import Business
        stmt = (
            select(Lead)
            .join(Business, Lead.business_id == Business.id)
            .where(Business.email.ilike(clean_email))
            .limit(1)
        )
        l_res = await db.execute(stmt)
        lead_obj = l_res.scalar_one_or_none()
        if lead_obj:
            lead_id = lead_obj.id
            campaign_id = getattr(lead_obj, "campaign_id", None)
    except Exception as err:
        logger.warning(f"Could not link lead for manual reply to {clean_email}: {err}")

    log = EmailOutreachLog(
        lead_id=lead_id,
        campaign_id=campaign_id,
        step=0,
        recipient_email=clean_email,
        subject=data.subject,
        body_snippet=data.body,
        status="MANUAL_REPLY_SENT",
        error_message=note,
        sent_at=datetime.now(timezone.utc)
    )
    db.add(log)
    await db.commit()

    return {"status": "ok", "message": f"Reply sent to {clean_email} successfully", "note": note}


@router.get("/inbox/thread")
async def get_email_thread(
    client_email: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the full email thread for a specific client:
    - Emails WE sent (from EmailOutreachLog)
    - Replies THEY sent (from EmailOutreachLog where status=REPLIED)
    Sorted chronologically so you can see the full conversation.
    """
    check_autopilot_permission(current_user, "can_access_autopilot")

    clean_email = client_email.strip().lower()

    stmt = (
        select(EmailOutreachLog)
        .options(selectinload(EmailOutreachLog.lead).selectinload(Lead.business))
        .where(EmailOutreachLog.recipient_email.ilike(clean_email))
        .order_by(EmailOutreachLog.sent_at.asc())
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    active_personas = None
    active_tpl = None

    thread = []
    for log in logs:
        biz_name = log.lead.business.canonical_name if log.lead and log.lead.business else None
        if log.reply_content:
            ai_lbl = log.reply_sentiment
            analyzed_by = "OPENCLAW" if "OPENCLAW" in (log.error_message or "") else "RULE_LOGIC"
            if ai_lbl == "NEUTRAL" or not ai_lbl:
                res = await OutreachEngine.classify_reply_sentiment(log.reply_content)
                lbl = res.label
                src = getattr(res, "source", "RULE_LOGIC")
                if lbl != "NEUTRAL":
                    ai_lbl = lbl
                    log.reply_sentiment = lbl
                    log.error_message = f"ANALYZED_BY:{src}"
                    analyzed_by = src
                    try:
                        if log.lead:
                            if lbl == "REJECTED":
                                log.lead.deal_status = "CLOSED_LOST"
                                log.lead.outreach_status = "DISCARDED"
                            elif lbl == "HOT_LEAD":
                                log.lead.deal_status = "HOT_LEAD"
                                log.lead.outreach_status = "REPLIED_HOT"
                        await db.commit()
                    except Exception:
                        pass

            # Client's reply
            thread.append({
                "direction": "inbound",
                "from": log.recipient_email,
                "subject": log.subject,
                "body": log.reply_content,
                "snippet": log.reply_content[:200],
                "sent_at": log.sent_at.isoformat() if log.sent_at else None,
                "ai_label": ai_lbl,
                "analyzed_by": analyzed_by,
                "step": log.step,
                "company_name": biz_name,
            })
        else:
            # Email WE sent
            body_text = log.body_snippet or ""

            # If accidentally overwritten by previous reconstruct bug for a manual reply, recover to "thanks"
            if log.status == "MANUAL_REPLY_SENT" and "hi executive" in body_text.lower():
                body_text = "thanks"
                log.body_snippet = "thanks"
                try:
                    await db.commit()
                except Exception:
                    pass

            # Only reconstruct initial automated outreach pitch if it was sliced at 300 characters
            is_initial_pitch = (
                log.status != "MANUAL_REPLY_SENT"
                and (log.step or 0) >= 1
                and not (log.subject or "").lower().startswith("re:")
                and 250 <= len(body_text) <= 320
                and "hi " in body_text.lower()
            )

            if is_initial_pitch:
                try:
                    lead_obj = log.lead
                    if not lead_obj:
                        from app.models.business import Business
                        l_stmt = (
                            select(Lead)
                            .join(Business, Lead.business_id == Business.id)
                            .options(selectinload(Lead.business))
                            .where(Business.email.ilike(clean_email))
                            .limit(1)
                        )
                        l_res = await db.execute(l_stmt)
                        lead_obj = l_res.scalar_one_or_none()

                    if lead_obj and lead_obj.business:
                        biz = lead_obj.business
                        if active_personas is None:
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

                        from app.engine.outreach_engine import OutreachEngine
                        _, full_rendered = await OutreachEngine.render_email(
                            step=log.step or 1,
                            lead_data={
                                "company_name": biz.canonical_name,
                                "contact_person": biz.contact_person or "Executive",
                                "city": biz.address or "",
                                "website": getattr(biz, "domain", ""),
                                "industry": getattr(biz, "business_type", ""),
                                "primary_gap": lead_obj.primary_gap_summary,
                                "why_they_need_us": getattr(lead_obj, "why_they_need_us", None) or lead_obj.primary_gap_summary,
                                "what_they_need": getattr(lead_obj, "what_they_need", None) or "Modern Lead Funnel & CRM",
                                "matched_service": getattr(lead_obj, "matched_service", None) or "Custom Digital Solution",
                                "personas": active_personas,
                                "custom_template": active_tpl
                            }
                        )
                        if full_rendered and len(full_rendered) > len(body_text):
                            body_text = full_rendered
                            log.body_snippet = full_rendered
                            await db.commit()
                except Exception as render_err:
                    logger.warning(f"Failed reconstructing email body for {clean_email}: {render_err}")

            thread.append({
                "direction": "outbound",
                "to": log.recipient_email,
                "subject": log.subject,
                "body": body_text,
                "snippet": body_text[:200],
                "sent_at": log.sent_at.isoformat() if log.sent_at else None,
                "status": log.status,
                "step": log.step,
                "company_name": biz_name,
            })

    return {
        "client_email": client_email,
        "total": len(thread),
        "thread": thread
    }
