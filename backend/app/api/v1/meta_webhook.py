import httpx
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, Request, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.logging import logger
from app.services.chatbot_service import ChatbotService
from app.models.conversation import ChatbotConfig

router = APIRouter(prefix="/meta", tags=["Meta Webhooks"])

@router.get("/webhook")
async def verify_meta_webhook(
    request: Request,
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    db: AsyncSession = Depends(get_db)
):
    """Meta Webhook Verification endpoint required by WhatsApp Cloud API & Facebook Graph API."""
    config = await ChatbotService.get_or_create_config(db)
    expected_token = config.meta_verify_token or "leadgen_meta_verify_token"

    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        logger.info("[Meta Webhook] Verification successful!")
        return Response(content=hub_challenge, media_type="text/plain", status_code=200)

    logger.warning(f"[Meta Webhook] Verification failed. Received token: '{hub_verify_token}', Expected: '{expected_token}'")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification token mismatch")

@router.post("/webhook")
async def receive_meta_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Receive live inbound events from WhatsApp Cloud API and Facebook Messenger."""
    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return {"status": "ignored_non_json"}

    logger.debug(f"[Meta Webhook] Inbound payload received: {body.get('object')}")

    # 1. WhatsApp Cloud API Payload Structure
    if body.get("object") == "whatsapp_business_account":
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                contacts = value.get("contacts", [])
                sender_name = contacts[0].get("profile", {}).get("name") if contacts else None

                for msg in messages:
                    sender_id = msg.get("from")  # phone number
                    msg_type = msg.get("type")
                    text_content = ""
                    media_url = None

                    if msg_type == "text":
                        text_content = msg.get("text", {}).get("body", "")
                    elif msg_type == "audio":
                        text_content = "[Voice Note received]"
                        media_url = msg.get("audio", {}).get("id")
                    elif msg_type == "interactive":
                        text_content = msg.get("interactive", {}).get("button_reply", {}).get("title", "")

                    if sender_id and text_content:
                        conv, ai_reply = await ChatbotService.process_incoming_message(
                            db=db,
                            platform="whatsapp",
                            external_sender_id=sender_id,
                            message_text=text_content,
                            sender_name=sender_name,
                            media_url=media_url,
                            raw_payload=msg,
                        )

                        # If AI generated a reply and Page Access Token is provided, send back via Meta API
                        if ai_reply and conv.ai_enabled:
                            config = await ChatbotService.get_or_create_config(db)
                            if config.meta_page_access_token and config.whatsapp_phone_number_id:
                                await send_whatsapp_reply(
                                    phone_number_id=config.whatsapp_phone_number_id,
                                    access_token=config.meta_page_access_token,
                                    to_phone=sender_id,
                                    message_body=ai_reply.content,
                                )

    # 2. Facebook Messenger / Instagram Direct Payload Structure
    elif body.get("object") in ["page", "instagram"]:
        platform = "messenger" if body.get("object") == "page" else "instagram"
        for entry in body.get("entry", []):
            for messaging_event in entry.get("messaging", []):
                sender_id = messaging_event.get("sender", {}).get("id")
                msg = messaging_event.get("message", {})
                text_content = msg.get("text", "")
                
                # Ignore messages sent by the page itself
                if messaging_event.get("message", {}).get("is_echo"):
                    continue

                if sender_id and text_content:
                    conv, ai_reply = await ChatbotService.process_incoming_message(
                        db=db,
                        platform=platform,
                        external_sender_id=sender_id,
                        message_text=text_content,
                        raw_payload=messaging_event,
                    )

                    if ai_reply and conv.ai_enabled:
                        config = await ChatbotService.get_or_create_config(db)
                        if config.meta_page_access_token:
                            await send_messenger_reply(
                                access_token=config.meta_page_access_token,
                                recipient_id=sender_id,
                                text=ai_reply.content,
                            )

    return {"status": "EVENT_RECEIVED"}

async def send_whatsapp_reply(phone_number_id: str, access_token: str, to_phone: str, message_body: str):
    """Deliver outbound reply via WhatsApp Cloud API."""
    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": message_body},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"[Meta WhatsApp] Send error: {resp.text}")
    except Exception as e:
        logger.error(f"[Meta WhatsApp] Dispatch exception: {e}")

async def send_messenger_reply(access_token: str, recipient_id: str, text: str):
    """Deliver outbound reply via Messenger API."""
    url = "https://graph.facebook.com/v18.0/me/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"[Meta Messenger] Send error: {resp.text}")
    except Exception as e:
        logger.error(f"[Meta Messenger] Dispatch exception: {e}")
