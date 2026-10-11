import re
import json
import time
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import logger
from app.models.conversation import ChatbotConfig, Conversation, ConversationMessage, DEFAULT_QUALIFICATION_FIELDS
from app.models.company_kb import CompanyKB
from app.models.business import Business
from app.models.lead import Lead

class ChatbotService:
    @classmethod
    async def get_or_create_config(cls, db: AsyncSession) -> ChatbotConfig:
        """Fetch the current business chatbot configuration, creating dynamic defaults if not present."""
        stmt = select(ChatbotConfig).where(ChatbotConfig.is_active == True).order_by(desc(ChatbotConfig.created_at)).limit(1)
        res = await db.execute(stmt)
        config = res.scalar_one_or_none()
        if config:
            return config

        # Fallback to CompanyKB if available
        kb_stmt = select(CompanyKB).where(CompanyKB.is_active == True).order_by(desc(CompanyKB.created_at)).limit(1)
        kb_res = await db.execute(kb_stmt)
        kb = kb_res.scalar_one_or_none()

        biz_name = kb.company_name if (kb and kb.company_name) else "Global Enterprise Solutions"
        biz_tagline = kb.tagline_experience if (kb and kb.tagline_experience) else "World-class services tailored to your needs"
        biz_services = kb.services_json if (kb and kb.services_json) else [
            {"name": "Consulting & Strategy", "description": "Customized growth and operational consultation", "price": "Custom quote"},
            {"name": "Digital Transformation", "description": "End-to-end technology and process modernization", "price": "Custom quote"}
        ]

        new_config = ChatbotConfig(
            business_name=biz_name,
            tagline=biz_tagline,
            industry="Business Services",
            country="Global / Worldwide",
            currency_symbol="$",
            currency_code="USD",
            description=kb.master_kb_notes if (kb and kb.master_kb_notes) else "We deliver high-impact solutions to clients worldwide across multiple industries.",
            services_json=biz_services,
            faqs_json=[
                {"question": "How do we get started?", "answer": "Simply provide your details and requirements, and our team will schedule a tailored discovery session."},
                {"question": "Do you work with international clients?", "answer": "Yes, we proudly serve clients globally with flexible time-zone coverage."}
            ],
            qualification_fields_json=DEFAULT_QUALIFICATION_FIELDS,
            master_ai_enabled=True,
            auto_detect_language=True,
            ai_tone="Professional, consultative, and welcoming",
            custom_instructions="Be concise, warm, and attentive. Do not interrogate. Ask 1 question at a time.",
            meta_verify_token="leadgen_meta_verify_token",
        )
        db.add(new_config)
        await db.commit()
        await db.refresh(new_config)
        return new_config

    @classmethod
    async def broadcast_event(cls, event_type: str, payload: dict):
        """Broadcast live WebSocket updates via Redis pub/sub."""
        try:
            r = aioredis.from_url(settings.REDIS_URL)
            msg = json.dumps({"type": event_type, "timestamp": datetime.now(timezone.utc).isoformat(), "data": payload})
            await r.publish("leadgen:events", msg)
            await r.aclose()
        except Exception as e:
            logger.debug(f"[Chatbot] Redis broadcast notice: {e}")

    @classmethod
    def _build_system_prompt(cls, config: ChatbotConfig, current_extracted: dict) -> str:
        services_text = ""
        for s in (config.services_json or []):
            services_text += f"- {s.get('name', 'Service')}: {s.get('description', '')} (Price: {s.get('price', 'Inquire')})\n"

        faqs_text = ""
        for f in (config.faqs_json or []):
            faqs_text += f"Q: {f.get('question', '')}\nA: {f.get('answer', '')}\n"

        fields_to_gather = []
        for field in (config.qualification_fields_json or []):
            k = field.get("key")
            label = field.get("label", k)
            req = "REQUIRED" if field.get("required") else "OPTIONAL"
            status = "COLLECTED" if current_extracted.get(k) else "MISSING"
            fields_to_gather.append(f"- {label} ({k}) [{req}]: {status} (Current: {current_extracted.get(k, 'None')})")

        fields_summary = "\n".join(fields_to_gather)

        return f"""You are the official AI Lead Specialist & Representative for:
Company: {config.business_name}
Industry: {config.industry}
Market Reach: {config.country} (Worldwide)
Currency: {config.currency_symbol} ({config.currency_code})
Tagline: {config.tagline}
About Us: {config.description or 'Specialized professional service provider.'}

Services & Offerings:
{services_text if services_text else 'Custom client solutions and consulting.'}

FAQs & Key Details:
{faqs_text if faqs_text else 'Standard client engagement and onboarding available.'}

Tone of Voice:
{config.ai_tone}

Additional Guidelines:
{config.custom_instructions or 'Be friendly and helpful.'}

CRITICAL INSTRUCTIONS:
1. MULTILINGUAL & CULTURAL ADAPTABILITY:
   - Detect the language of the user's message automatically (e.g. English, Bengali, Spanish, Arabic, Hindi, Urdu, French, German, or Banglish).
   - ALWAYS reply in that EXACT same language and tone! If the user speaks Bengali, answer in warm, fluent Bengali. If they speak English, answer in polished English. If Banglish, respond appropriately in warm Banglish/Bengali.
2. NO ROBOTIC FORMS:
   - Do NOT ask for all missing information in one wall of text.
   - First warmly answer any inquiry or question they had about our services or company.
   - Then naturally ask for ONE (maximum two) missing details.
   - Acknowledge any details they already shared (e.g., if they said 'I am John from Apex Ltd', do not ask for their name again).
3. QUALIFICATION CRITERIA STATUS:
{fields_summary}

You MUST return your answer in valid JSON format ONLY with this exact JSON schema:
{{
  "reply": "Your friendly, personalized response in the user's detected language",
  "detected_language": "Language name (e.g. Bengali, English, Spanish, Arabic, Banglish)",
  "detected_sentiment": "POSITIVE / NEUTRAL / NEGATIVE",
  "extracted_data": {{
    "name": "full name if detected or null",
    "email": "email if detected or null",
    "phone": "phone or whatsapp number with country code if detected or null",
    "needs": "requirements or service interest if detected or null",
    "budget": "budget or timeline if detected or null"
  }},
  "is_qualified": true or false
}}
Do not include markdown code block backticks if possible, return pure JSON."""

    @classmethod
    async def _call_llm_reasoning(cls, system_prompt: str, conversation_history: List[Dict[str, str]], latest_user_msg: str) -> Dict[str, Any]:
        """Call OpenClaw Gateway or local LLM engine to get intelligent conversational lead response."""
        messages = [{"role": "system", "content": system_prompt}]
        for m in conversation_history[-6:]:  # last 6 messages context
            role = "assistant" if m.get("sender_type") == "AI" else "user"
            messages.append({"role": role, "content": m.get("content", "")})
        messages.append({"role": "user", "content": latest_user_msg})

        # 1. Try OpenClaw Cloud Gateway
        if settings.OPENCLAW_GATEWAY_URL and not any(loc in settings.OPENCLAW_GATEWAY_URL for loc in ["127.0.0.1", "localhost"]):
            gw_base = settings.OPENCLAW_GATEWAY_URL.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
            gw_url = f"{gw_base}/v1/chat/completions"
            gw_headers = {
                "Authorization": f"Bearer {settings.OPENCLAW_GATEWAY_TOKEN}",
                "Content-Type": "application/json",
                "x-openclaw-session": "leadgen_chatbot",
            }
            gw_payload = {
                "model": "default",
                "messages": messages,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "user": "leadgen_chatbot",
            }
            try:
                async with httpx.AsyncClient(timeout=25.0) as client:
                    resp = await client.post(gw_url, json=gw_payload, headers=gw_headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                        clean = re.sub(r"^```(?:json)?\s*", "", raw_content.strip())
                        clean = re.sub(r"\s*```$", "", clean)
                        parsed = json.loads(clean)
                        if "reply" in parsed:
                            return parsed
            except Exception as e:
                logger.debug(f"[Chatbot] OpenClaw Cloud Gateway notice, falling back: {e}")

        # 2. Try Local Ollama
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                ollama_url = f"{settings.OLLAMA_BASE_URL}/api/chat"
                ollama_payload = {
                    "model": settings.OLLAMA_MODEL or "qwen2.5:7b",
                    "messages": messages,
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.3}
                }
                resp = await client.post(ollama_url, json=ollama_payload)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("message", {}).get("content", "{}")
                    clean = re.sub(r"^```(?:json)?\s*", "", content.strip())
                    clean = re.sub(r"\s*```$", "", clean)
                    parsed = json.loads(clean)
                    if "reply" in parsed:
                        return parsed
        except Exception as e:
            logger.debug(f"[Chatbot] Ollama fallback notice: {e}")

        # 3. Deterministic Smart Multilingual Fallback
        return cls._smart_deterministic_fallback(latest_user_msg)

    @classmethod
    def _smart_deterministic_fallback(cls, message: str) -> Dict[str, Any]:
        """Provides a natural fallback if all external LLM connections are temporarily unreachable."""
        text = message.strip()
        lower = text.lower()

        # Simple language heuristics
        has_bengali = any('\u0980' <= c <= '\u09FF' for c in text)
        has_banglish = any(w in lower for w in ["kemon", "valo", "ki", "koro", "dam", "apnar", "janan", "ami", "tumi"])

        # Regex for email
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        detected_email = email_match.group(0) if email_match else None

        # Regex for phone
        phone_match = re.search(r'(\+?[0-9]{1,4}[\s-]?)?(\(?[0-9]{2,5}\)?[\s-]?)?[0-9]{3,4}[\s-]?[0-9]{3,4}', text)
        detected_phone = phone_match.group(0).strip() if (phone_match and len(re.sub(r'\D', '', phone_match.group(0))) >= 7) else None

        detected_name = None
        for intro in ["my name is ", "i am ", "this is ", "amar naam ", "naam "]:
            if intro in lower:
                detected_name = text[lower.find(intro) + len(intro):].split()[0].capitalize()

        if has_bengali or has_banglish:
            lang = "Bengali"
            if detected_email or detected_phone:
                reply = "ধন্যবাদ! আপনার যোগাযোগের তথ্য পেয়েছি। আপনার নির্দিষ্ট কি কি প্রয়োজন বা প্রশ্ন আছে আমাদের জানান, যাতে আমরা উপযুক্ত পরামর্শ দিতে পারি।"
            else:
                reply = "হ্যালো! আপনাকে স্বাগতম। আমাদের সার্ভিস নিয়ে আপনার কি কোনো নির্দিষ্ট প্রশ্ন আছে? অনুগ্রহ করে আপনার নাম ও ফোন/ইমেইল শেয়ার করলে বিস্তারিত জানাতে পারব।"
        else:
            lang = "English"
            if detected_email or detected_phone:
                reply = "Thank you! We've received your contact details. Could you let us know what specific services or goals you're looking to achieve?"
            else:
                reply = "Hello and welcome! How can we assist your business today? May I know your name and the best email or phone number to share our service overview?"

        return {
            "reply": reply,
            "detected_language": lang,
            "detected_sentiment": "NEUTRAL",
            "extracted_data": {
                "name": detected_name,
                "email": detected_email,
                "phone": detected_phone,
                "needs": text if len(text) > 20 else None,
                "budget": None,
            },
            "is_qualified": bool(detected_email and detected_phone),
        }

    @classmethod
    async def process_incoming_message(
        cls,
        db: AsyncSession,
        platform: str,
        external_sender_id: str,
        message_text: str,
        sender_name: Optional[str] = None,
        media_url: Optional[str] = None,
        raw_payload: Optional[dict] = None
    ) -> Tuple[Conversation, Optional[ConversationMessage]]:
        """Processes an incoming chat message, updates qualification status, runs AI if enabled, and records messages."""
        config = await cls.get_or_create_config(db)

        # 1. Fetch or create Conversation
        stmt = select(Conversation).where(
            Conversation.platform == platform,
            Conversation.external_sender_id == external_sender_id
        ).limit(1)
        res = await db.execute(stmt)
        conversation = res.scalar_one_or_none()

        if not conversation:
            conversation = Conversation(
                platform=platform,
                external_sender_id=external_sender_id,
                sender_name=sender_name or f"Visitor {external_sender_id[-4:]}",
                status="ACTIVE",
                ai_enabled=True,
                extracted_data={},
            )
            db.add(conversation)
            await db.commit()
            await db.refresh(conversation)
        elif sender_name and not conversation.sender_name:
            conversation.sender_name = sender_name

        # 2. Record User Message
        user_msg = ConversationMessage(
            conversation_id=conversation.id,
            sender_type="USER",
            sender_name=conversation.sender_name or "Visitor",
            message_type="text",
            content=message_text,
            media_url=media_url,
            raw_payload=raw_payload or {},
        )
        db.add(user_msg)
        conversation.last_message_text = message_text
        conversation.last_message_at = datetime.now(timezone.utc)
        conversation.unread_count = (conversation.unread_count or 0) + 1
        await db.commit()

        await cls.broadcast_event("chat_message_received", {
            "conversation_id": str(conversation.id),
            "message_id": str(user_msg.id),
            "sender_type": "USER",
            "content": message_text,
            "sender_name": user_msg.sender_name,
            "platform": platform,
        })

        # 3. Check AI status
        # If Master AI Switch is OFF or Conversation has Human Takeover enabled (ai_enabled=False)
        if not config.master_ai_enabled or not conversation.ai_enabled:
            logger.info(f"[Chatbot] Skipping AI reply: MasterAI={config.master_ai_enabled}, ConvAI={conversation.ai_enabled}")
            return conversation, None

        # 4. Fetch recent conversation history
        history_stmt = select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation.id
        ).order_by(ConversationMessage.created_at.asc()).limit(15)
        h_res = await db.execute(history_stmt)
        history_msgs = [
            {"sender_type": m.sender_type, "content": m.content}
            for m in h_res.scalars().all()
        ]

        # 5. Build prompt and invoke LLM
        system_prompt = cls._build_system_prompt(config, conversation.extracted_data or {})
        llm_result = await cls._call_llm_reasoning(system_prompt, history_msgs, message_text)

        reply_text = llm_result.get("reply", "Thank you for reaching out! A representative will connect with you shortly.")
        detected_lang = llm_result.get("detected_language") or conversation.detected_language or "English"
        conversation.detected_language = detected_lang

        # Merge extracted lead attributes
        new_extracted = llm_result.get("extracted_data") or {}
        curr_extracted = dict(conversation.extracted_data or {})
        for k, v in new_extracted.items():
            if v and str(v).strip() and str(v).lower() != "null":
                curr_extracted[k] = v

        conversation.extracted_data = curr_extracted
        if curr_extracted.get("name") and not conversation.sender_name:
            conversation.sender_name = curr_extracted["name"]
        if curr_extracted.get("email"):
            conversation.sender_email = curr_extracted["email"]
        if curr_extracted.get("phone"):
            conversation.sender_phone = curr_extracted["phone"]

        # Check qualification completeness
        required_fields = [f.get("key") for f in (config.qualification_fields_json or []) if f.get("required")]
        collected_required = [k for k in required_fields if curr_extracted.get(k)]
        
        if required_fields:
            qual_ratio = len(collected_required) / len(required_fields)
            conversation.qualification_score = round(qual_ratio, 2)
            if qual_ratio >= 1.0:
                conversation.status = "QUALIFIED"
                # Automatically create CRM Lead if not already linked
                await cls._create_or_link_crm_lead(db, conversation, curr_extracted, config)
        elif llm_result.get("is_qualified"):
            conversation.status = "QUALIFIED"
            conversation.qualification_score = 1.0
            await cls._create_or_link_crm_lead(db, conversation, curr_extracted, config)

        # 6. Record AI Message
        ai_msg = ConversationMessage(
            conversation_id=conversation.id,
            sender_type="AI",
            sender_name=f"{config.business_name} AI",
            message_type="text",
            content=reply_text,
            detected_sentiment=llm_result.get("detected_sentiment", "NEUTRAL"),
            raw_payload=llm_result,
        )
        db.add(ai_msg)
        conversation.last_message_text = reply_text
        conversation.last_message_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(conversation)
        await db.refresh(ai_msg)

        await cls.broadcast_event("chat_message_sent", {
            "conversation_id": str(conversation.id),
            "message_id": str(ai_msg.id),
            "sender_type": "AI",
            "content": reply_text,
            "detected_language": detected_lang,
            "status": conversation.status,
            "qualification_score": conversation.qualification_score,
            "extracted_data": conversation.extracted_data,
        })

        return conversation, ai_msg

    @classmethod
    async def _create_or_link_crm_lead(cls, db: AsyncSession, conversation: Conversation, extracted: dict, config: ChatbotConfig):
        """When a conversational lead is fully qualified, automatically register/link it into CRM leads table."""
        if conversation.lead_id:
            return  # Already converted

        try:
            lead_name = extracted.get("name") or conversation.sender_name or "Conversational Lead"
            lead_phone = extracted.get("phone") or conversation.sender_phone
            lead_email = extracted.get("email") or conversation.sender_email
            lead_needs = extracted.get("needs") or f"Inquired via {conversation.platform.title()} Chatbot"

            # 1. Create or match Business
            biz = Business(
                canonical_name=lead_name,
                email=lead_email,
                phone=lead_phone,
                business_type=config.industry or "Commercial Inbound",
                address=f"Platform: {conversation.platform}",
                metadata_json={
                    "source": f"chatbot_{conversation.platform}",
                    "language": conversation.detected_language,
                    "extracted_data": extracted,
                    "currency": config.currency_code,
                }
            )
            db.add(biz)
            await db.flush()

            # 2. Create Lead
            lead = Lead(
                business_id=biz.id,
                tier="TIER_1",
                final_score=96.0,
                is_qualified=True,
                deal_status="HOT",
                fit_tier="HOT",
                primary_gap_summary=f"Inbound Qualified Prospect from {conversation.platform.title()}",
                why_they_need_us=f"Expressed immediate interest: {lead_needs}",
                what_they_need=lead_needs,
                matched_service=config.services_json[0].get("name") if config.services_json else "Custom Service",
                outreach_notes=f"Auto-qualified via {conversation.detected_language} conversational flow.",
                explanation_json={
                    "channel": conversation.platform,
                    "detected_language": conversation.detected_language,
                    "qualification_score": 1.0,
                    "extracted_data": extracted
                }
            )
            db.add(lead)
            await db.flush()

            conversation.lead_id = lead.id
            logger.info(f"[Chatbot] Successfully converted conversation {conversation.id} into HOT CRM Lead {lead.id}")
        except Exception as e:
            logger.error(f"[Chatbot] Error auto-converting conversational lead to CRM: {e}")
