import asyncio
import imaplib
import email
from email.header import decode_header
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import os
import re

from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.lead import Lead
from app.models.autopilot import EmailOutreachLog
from app.engine.outreach_engine import OutreachEngine

logger = logging.getLogger("leadgen.imap_sync")

class IMAPInboxSyncService:
    """
    Autonomous Inbound Email Sync Service.
    Connects to configured IMAP inbox (Gmail/Workspace/Outlook/SMTP server)
    to check for replies to sent cold emails.
    When a reply is detected:
      1. Associates the reply with the matched Lead and EmailOutreachLog.
      2. Analyzes sentiment (POSITIVE, NEGATIVE, NEUTRAL).
      3. Automatically promotes to HOT_LEAD if positive.
      4. Halts further automated cold sequences to protect domain reputation.
    """

    @classmethod
    async def get_all_imap_credentials(cls, session: Optional[AsyncSession] = None) -> List[Dict[str, Any]]:
        """
        Retrieves all active inboxes configured by Admin in the Database (SMTPInbox table),
        and infers their IMAP endpoints automatically.
        Falls back to .env settings if DB has no inboxes configured.
        """
        creds_list = []

        if session:
            try:
                from app.models.email_template import SMTPInbox
                stmt = select(SMTPInbox).where(SMTPInbox.is_active == True)
                res = await session.execute(stmt)
                db_inboxes = res.scalars().all()

                for ib in db_inboxes:
                    h = ib.host.lower()
                    imap_host = "imap.gmail.com" if "gmail" in h else "outlook.office365.com" if ("outlook" in h or "office365" in h) else "imap.zoho.com" if "zoho" in h else ib.host
                    imap_port = 993
                    creds_list.append({
                        "id": str(ib.id),
                        "host": imap_host,
                        "port": imap_port,
                        "user": ib.username,
                        "password": ib.password,
                        "from_email": ib.from_email
                    })
            except Exception as e:
                logger.warning(f"Failed to load SMTP inboxes from DB: {e}")

        # Fallback to .env settings if DB inboxes are not set
        if not creds_list:
            host = settings.IMAP_HOST
            if not host and settings.SMTP_HOST:
                smtp_h = settings.SMTP_HOST.lower()
                if "gmail" in smtp_h:
                    host = "imap.gmail.com"
                elif "outlook" in smtp_h or "office365" in smtp_h:
                    host = "outlook.office365.com"
                elif "zoho" in smtp_h:
                    host = "imap.zoho.com"
                else:
                    host = settings.SMTP_HOST

            user = settings.IMAP_USER or settings.SMTP_USER or settings.SMTP_FROM_EMAIL
            password = settings.IMAP_PASSWORD or settings.SMTP_PASSWORD

            if host and user and password:
                creds_list.append({
                    "id": "env_default",
                    "host": host,
                    "port": settings.IMAP_PORT or 993,
                    "user": user,
                    "password": password,
                    "from_email": settings.SMTP_FROM_EMAIL or user
                })

        return creds_list

    @classmethod
    def _clean_header(cls, header_val: Optional[str]) -> str:
        if not header_val:
            return ""
        decoded_parts = decode_header(header_val)
        result = []
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                try:
                    result.append(part.decode(encoding or "utf-8", errors="ignore"))
                except Exception:
                    result.append(part.decode("utf-8", errors="ignore"))
            else:
                result.append(str(part))
        return " ".join(result).strip()

    @classmethod
    def _extract_email_address(cls, from_header: str) -> str:
        if not from_header:
            return ""
        match = re.search(r"[\w\.-]+@[\w\.-]+", from_header)
        return match.group(0).lower() if match else from_header.lower().strip()

    @classmethod
    def _extract_body_text(cls, msg: email.message.Message) -> str:
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition"))
                if content_type == "text/plain" and "attachment" not in content_disposition:
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        body += payload.decode(charset, errors="ignore")
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                body = payload.decode(charset, errors="ignore")

        # Strip standard quoted text like "On Mon, ... wrote:"
        clean_lines = []
        for line in body.splitlines():
            line_strip = line.strip()
            if line_strip.startswith(">"):
                continue
            if re.match(r"^-+\s*Original Message\s*-+", line_strip, re.I):
                break
            if re.match(r"^On\s+.+wrote:$", line_strip, re.I):
                break
            clean_lines.append(line)

        return "\n".join(clean_lines).strip()

    @classmethod
    def _parse_date(cls, msg: email.message.Message) -> Optional[str]:
        """Parse email date header into ISO string."""
        date_str = msg.get("Date", "")
        if not date_str:
            return None
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(date_str)
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            return None

    @classmethod
    def fetch_raw_messages(cls, creds: Dict[str, Any], limit: int = 50) -> List[Dict[str, Any]]:
        """
        Fetches up to `limit` most recent messages from the IMAP inbox.
        Returns full message metadata including date, read status, and account info.
        """
        messages_out = []
        mail = None
        try:
            mail = imaplib.IMAP4_SSL(creds["host"], creds["port"], timeout=20)
            mail.login(creds["user"], creds["password"])
            mail.select("INBOX")

            status, data = mail.search(None, "ALL")
            all_ids = data[0].split() if status == "OK" and data[0] else []
            # Get most recent `limit` emails
            fetch_ids = all_ids[-limit:] if len(all_ids) > limit else all_ids
            fetch_ids = list(reversed(fetch_ids))  # newest first

            # Fetch UNSEEN ids for read/unread marking
            status2, unseen_data = mail.search(None, "UNSEEN")
            unseen_ids = set(unseen_data[0].split()) if status2 == "OK" and unseen_data[0] else set()

            for m_id in fetch_ids:
                try:
                    res, msg_data = mail.fetch(m_id, "(RFC822)")
                    if res != "OK":
                        continue
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            raw_email = response_part[1]
                            msg = email.message_from_bytes(raw_email)

                            subject = cls._clean_header(msg.get("Subject")) or "(No Subject)"
                            from_raw = cls._clean_header(msg.get("From"))
                            from_email = cls._extract_email_address(from_raw)
                            to_raw = cls._clean_header(msg.get("To", ""))
                            message_id = cls._clean_header(msg.get("Message-ID"))
                            in_reply_to = cls._clean_header(msg.get("In-Reply-To"))
                            date_iso = cls._parse_date(msg)
                            body = cls._extract_body_text(msg)
                            is_unread = m_id in unseen_ids

                            messages_out.append({
                                "id": message_id or str(m_id),
                                "imap_seq": m_id.decode() if isinstance(m_id, bytes) else str(m_id),
                                "account_email": creds.get("from_email") or creds.get("user", ""),
                                "account_id": creds.get("id", ""),
                                "from_email": from_email,
                                "from_raw": from_raw,
                                "to": to_raw,
                                "subject": subject,
                                "body": body,
                                "snippet": body[:200] if body else "",
                                "date": date_iso,
                                "is_unread": is_unread,
                                "in_reply_to": in_reply_to,
                                "message_id": message_id,
                                "is_reply": bool(in_reply_to),
                            })
                except Exception as parse_err:
                    logger.warning(f"Error parsing message {m_id}: {parse_err}")

            mail.close()
            mail.logout()
        except Exception as e:
            logger.error(f"IMAP fetch_raw_messages error for {creds.get('user')}: {e}")
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass

        return messages_out

    @classmethod
    async def fetch_all_inbox_messages(
        cls,
        session: Optional[AsyncSession] = None,
        limit_per_account: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Aggregates emails from ALL configured IMAP accounts.
        Returns combined list sorted by date (newest first).
        """
        all_creds = await cls.get_all_imap_credentials(session=session)
        if not all_creds:
            return []

        loop = asyncio.get_running_loop()
        all_messages: List[Dict[str, Any]] = []

        for creds in all_creds:
            try:
                msgs = await loop.run_in_executor(
                    None, lambda c=creds: cls.fetch_raw_messages(c, limit=limit_per_account)
                )
                all_messages.extend(msgs)
            except Exception as e:
                logger.warning(f"Failed to fetch from account {creds.get('user')}: {e}")

        # Sort all messages by date (newest first)
        def sort_key(m: Dict[str, Any]) -> str:
            return m.get("date") or "1970-01-01T00:00:00+00:00"

        all_messages.sort(key=sort_key, reverse=True)
        return all_messages

    @classmethod
    def check_inbox_sync(cls, creds: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Synchronous IMAP fetch executed inside a thread executor.
        Searches UNSEEN messages or recent inbox items.
        """
        inbound_emails = []
        mail = None
        try:
            mail = imaplib.IMAP4_SSL(creds["host"], creds["port"], timeout=20)
            mail.login(creds["user"], creds["password"])
            mail.select("INBOX")

            # Search unseen messages first; if none, check last 10 messages
            status, messages = mail.search(None, "UNSEEN")
            mail_ids = messages[0].split() if status == "OK" and messages[0] else []

            if not mail_ids:
                status, messages = mail.search(None, "ALL")
                all_ids = messages[0].split() if status == "OK" and messages[0] else []
                mail_ids = all_ids[-10:] if len(all_ids) > 10 else all_ids

            for m_id in mail_ids:
                try:
                    res, msg_data = mail.fetch(m_id, "(RFC822)")
                    if res != "OK":
                        continue
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            raw_email = response_part[1]
                            msg = email.message_from_bytes(raw_email)

                            subject = cls._clean_header(msg.get("Subject"))
                            from_raw = cls._clean_header(msg.get("From"))
                            from_email = cls._extract_email_address(from_raw)
                            message_id = cls._clean_header(msg.get("Message-ID"))
                            in_reply_to = cls._clean_header(msg.get("In-Reply-To"))
                            body = cls._extract_body_text(msg)

                            if from_email and body:
                                inbound_emails.append({
                                    "from_email": from_email,
                                    "from_raw": from_raw,
                                    "subject": subject,
                                    "message_id": message_id,
                                    "in_reply_to": in_reply_to,
                                    "body": body,
                                })
                except Exception as parse_err:
                    logger.warning(f"Error parsing message ID {m_id}: {parse_err}")

            mail.close()
            mail.logout()
        except Exception as e:
            logger.error(f"IMAP connection or sync error: {e}")
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass

        return inbound_emails

    @classmethod
    async def process_incoming_replies(cls, session: AsyncSession) -> int:
        """
        Fetches inbound messages across all configured inboxes from DB (or .env fallback),
        matches them to existing leads, and updates lead sentiment & deal_status.
        """
        all_creds = await cls.get_all_imap_credentials(session=session)
        if not all_creds:
            return 0

        loop = asyncio.get_running_loop()
        processed_count = 0

        for creds in all_creds:
            messages = await loop.run_in_executor(None, cls.check_inbox_sync, creds)
            if not messages:
                continue

            for msg in messages:
                sender_email = msg["from_email"].lower()
                reply_text = msg["body"]

                # ── Match reply with a Lead by sender email ────────────────────
                stmt = (
                    select(Lead)
                    .options(selectinload(Lead.business))
                    .join(Lead.business)
                    .where(
                        or_(
                            Lead.business.has(email=sender_email),
                            Lead.business.has(email=sender_email.strip())
                        )
                    )
                )
                res = await session.execute(stmt)
                matched_lead = res.scalar_one_or_none()

                # Also check EmailOutreachLog if not matched directly
                if not matched_lead:
                    log_stmt = (
                        select(EmailOutreachLog)
                        .options(selectinload(EmailOutreachLog.lead).selectinload(Lead.business))
                        .where(EmailOutreachLog.recipient_email.ilike(sender_email))
                        .order_by(EmailOutreachLog.created_at.desc())
                    )
                    log_res = await session.execute(log_stmt)
                    matched_log = log_res.scalars().first()
                    if matched_log and matched_log.lead:
                        matched_lead = matched_log.lead

                if not matched_lead:
                    logger.debug(f"[IMAP SYNC] No lead matched for sender: {sender_email}")
                    continue

                # Prevent duplicate processing of the same exact reply
                if matched_lead.outreach_notes and reply_text[:60] in matched_lead.outreach_notes:
                    continue

                # ── OpenClaw / Dual-Engine Reply Classification ──────────────
                res = await OutreachEngine.classify_reply_sentiment(reply_text)
                label = res.label
                explanation = res.reason
                source = getattr(res, "source", "RULE_LOGIC")

                # ── Update Lead Status based on verdict ───────────────────────
                if label == "HOT_LEAD":
                    matched_lead.deal_status = "HOT_LEAD"
                    matched_lead.outreach_status = "REPLIED_HOT"
                elif label == "REJECTED":
                    matched_lead.deal_status = "CLOSED_LOST"
                    matched_lead.outreach_status = "DISCARDED"
                else:  # NEUTRAL
                    matched_lead.outreach_status = "REPLIED_NEUTRAL"

                # Save reply snapshot to outreach notes
                now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
                note_entry = (
                    f"\n[{now_iso}] INCOMING EMAIL REPLY ({label}) [Analyzed by: {source}]:\n"
                    f"Subject: {msg['subject']}\n"
                    f"{reply_text[:500]}\n"
                    f"Classification: {explanation}\n"
                )
                matched_lead.outreach_notes = (matched_lead.outreach_notes or "") + note_entry

                # Log into EmailOutreachLog with analyzed_by tag
                reply_log = EmailOutreachLog(
                    lead_id=matched_lead.id,
                    step=matched_lead.followup_step or 1,
                    recipient_email=sender_email,
                    subject=f"Re: {msg['subject']}",
                    body_snippet=reply_text,
                    status="REPLIED",
                    reply_content=reply_text,
                    reply_sentiment=label,
                    error_message=f"ANALYZED_BY:{source}",
                    sent_at=datetime.now(timezone.utc)
                )
                session.add(reply_log)
                processed_count += 1
                logger.info(
                    f"[IMAP INBOX SYNC] Matched reply from {sender_email} -> "
                    f"{matched_lead.business.canonical_name} [{label}]: {explanation}"
                )

        if processed_count > 0:
            await session.commit()

        return processed_count
