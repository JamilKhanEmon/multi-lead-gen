import pytest
from app.services.voice_agent_service import VoiceAgentService

def test_render_prompt_template():
    template = "Hello {{client_name}} of {{company_name}}. We noticed {{exact_problem}}."
    variables = {
        "client_name": "Rafiqul Islam",
        "company_name": "Star Textiles",
        "exact_problem": "fabric defect loss",
    }
    rendered = VoiceAgentService.render_prompt_template(template, variables)
    assert "Hello Rafiqul Islam of Star Textiles." in rendered
    assert "We noticed fabric defect loss." in rendered

def test_office_hours_validation():
    is_valid, msg = VoiceAgentService.is_within_office_hours("00:00", "23:59")
    assert is_valid is True
    assert "Active Office Hours" in msg

def test_generate_meeting_link():
    res = VoiceAgentService.generate_meeting_link("Google Meet", "Star Textiles")
    assert res is None

def test_detect_meeting_agreement():
    agreed, slot = VoiceAgentService.detect_meeting_agreement("Sure, tomorrow at 3 pm works for me")
    assert agreed is True
    assert "3:00 PM" in slot

    agreed2, slot2 = VoiceAgentService.detect_meeting_agreement("Yes, send me the meeting link")
    assert agreed2 is True

    agreed3, slot3 = VoiceAgentService.detect_meeting_agreement("কাল বিকাল ৩টায় পারব")
    assert agreed3 is True
    assert "3:00 PM" in slot3

    agreed4, slot4 = VoiceAgentService.detect_meeting_agreement("How much does it cost?")
    assert agreed4 is False

    # Conversational permissions and pleasantries must NOT trigger meeting booking
    agreed5, _ = VoiceAgentService.detect_meeting_agreement("ও আলহামদুলিল্লাহ আপনি কেমন আছেন")
    assert agreed5 is False

    agreed6, _ = VoiceAgentService.detect_meeting_agreement("হ্যাঁ বলুন কিভাবে হেল্প করতে পারি")
    assert agreed6 is False


@pytest.mark.asyncio
async def test_process_dialogue_turn_meeting_booked():
    class MockKB:
        company_name = "Acme AI"
        agent_persona_name = "Alex"
        core_offer = "Free 14-day trial"
        service_name = "Enterprise Automation"
        system_prompt = "Keep responses under 15 words."
        objections_json = []

    test_session = "test_multi_step_turn_session"

    # Turn 1: Agreement triggers Channel question
    res1 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Tomorrow at 3 PM works fine for me",
        kb=MockKB(),
        override_client_name="Rafiqul",
        override_company_name="Star Textiles",
        override_exact_problem="fabric defects",
        session_id=test_session,
    )
    assert res1["conversation_stage"] == "ASKING_DELIVERY_CHANNEL"
    assert "email or whatsapp" in res1["agent_reply_text"].lower()

    # Turn 2: User chooses WhatsApp
    res2 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Send it to WhatsApp",
        kb=MockKB(),
        session_id=test_session,
        override_phone="+8801712345678",
    )
    assert res2["conversation_stage"] == "CONFIRMING_WHATSAPP"
    assert "+8801712345678" in res2["agent_reply_text"]

    # Turn 3: User confirms WhatsApp on this number
    res3 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Yes, exactly on this number",
        kb=MockKB(),
        session_id=test_session,
    )
    assert res3["meeting_booked"] is True
    assert res3["should_hangup"] is True
    assert "+8801712345678" in res3["agent_reply_text"]

def test_user_reported_speech_agreement():
    agreed, slot = VoiceAgentService.detect_meeting_agreement("Yeah oh yeah Mom available at this time")
    assert agreed is True
    assert slot is not None

    agreed2, slot2 = VoiceAgentService.detect_meeting_agreement("Yeah I'm available at this time")
    assert agreed2 is True


def test_sanitize_exact_problem():
    cleaned = VoiceAgentService.sanitize_exact_problem(
        "Identified issues do not align with agency service capabilities.",
        company_name="A Leading Real Estate Developer Company",
    )
    assert "do not align" not in cleaned
    assert "buyer inquiries" in cleaned.lower() or "pipeline" in cleaned.lower()

@pytest.mark.asyncio
async def test_calendly_meeting_link_and_speech():
    class MockCalendlyKB:
        calendly_url = "https://calendly.com/example-company/demo"
        company_name = "Enterprise Software"
        agent_persona_name = "Alex"
        core_offer = "Risk-Free Trial"
        service_name = "Custom Software"
        system_prompt = "Consultative tone."
        objections_json = []

    test_session = "test_calendly_session"
    res = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Yes, tomorrow 3 PM works perfectly",
        kb=MockCalendlyKB(),
        override_client_name="Farhan",
        override_company_name="Apex Real Estate",
        override_exact_problem="manual lead routing",
        session_id=test_session,
    )
    assert res["conversation_stage"] == "ASKING_DELIVERY_CHANNEL"
    assert "email or whatsapp" in res["agent_reply_text"].lower()

    # Step 2: User provides email
    res2 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Send it to farhan@apex.com",
        kb=MockCalendlyKB(),
        session_id=test_session,
    )
    assert res2["meeting_booked"] is True
    assert res2["meeting_link"] == "https://calendly.com/example-company/demo"
    assert "farhan@apex.com" in res2["agent_reply_text"]
    assert res2["should_hangup"] is True

def test_resolve_country_and_language_waterfall():
    # Signal 1: Phone Country Dialing Code
    c1, l1 = VoiceAgentService.resolve_country_and_language_waterfall("+8801712000000")
    assert c1 == "Bangladesh"
    assert l1 == "Bengali"

    c2, l2 = VoiceAgentService.resolve_country_and_language_waterfall("+971501234567")
    assert c2 == "United Arab Emirates"
    assert l2 == "Arabic"

    # Signal 2: Landline without country code, resolved from Search / Google Places Location Data
    c3, l3 = VoiceAgentService.resolve_country_and_language_waterfall("02-9881234", location_country="Bangladesh")
    assert c3 == "Bangladesh"
    assert l3 == "Bengali"

    c4, l4 = VoiceAgentService.resolve_country_and_language_waterfall("2125550199", search_metadata={"country": "United States"})
    assert c4 == "United States"
    assert l4 == "English"

    # Signal 3: No country code and no search location -> Fallback to Global/English (adapted live on call)
    c5, l5 = VoiceAgentService.resolve_country_and_language_waterfall("12345678")
    assert c5 == "Global"
    assert l5 == "English"

@pytest.mark.asyncio
async def test_should_hangup_on_meeting_and_optout():
    class MockKB:
        calendly_url = "https://calendly.com/demoagency/demo"
        company_name = "Demo Agency"
        agent_persona_name = "Karim"
        core_offer = "Free Demo"
        service_name = "ERP Solutions"
        system_prompt = "Consultative tone."
        objections_json = []

    test_session = "test_hangup_agree"
    # Case 1: Meeting agreed -> Asks delivery channel, then confirmed -> should_hangup is True
    res_agree = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Sure, tomorrow works fine",
        kb=MockKB(),
        override_client_name="Farhan",
        override_company_name="Apex Global",
        override_exact_problem="manual pipeline",
        session_id=test_session,
    )
    assert res_agree["conversation_stage"] == "ASKING_DELIVERY_CHANNEL"

    res_channel = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Send to WhatsApp",
        kb=MockKB(),
        override_phone="+8801712000000",
        session_id=test_session,
    )
    assert res_channel["conversation_stage"] == "CONFIRMING_WHATSAPP"

    res_confirm = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Yes on this number",
        kb=MockKB(),
        session_id=test_session,
    )
    assert res_confirm["should_hangup"] is True
    assert res_confirm["meeting_booked"] is True

    # Case 2: Explicit opt-out / refusal -> should_hangup is True with polite exit
    res_optout = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Not interested, please do not call again",
        kb=MockKB(),
        override_client_name="Farhan",
        override_company_name="Apex Global",
        override_exact_problem="manual pipeline",
    )
    assert res_optout["should_hangup"] is True
    assert res_optout["detected_intent"] == "OPTOUT_HANGUP"
    assert "thank you" in res_optout["agent_reply_text"].lower()

def test_post_call_template_rendering():
    raw_template = "Hello {{client_name}}, here is your link: {{calendly_prefilled_url}} from {{my_company}}."
    vars_map = {
        "client_name": "Farhan Ahmed",
        "calendly_prefilled_url": "https://calendly.com/demoagency/demo?name=Farhan&email=farhan@apex.com",
        "my_company": "Demo Agency",
    }
    rendered = VoiceAgentService.render_prompt_template(raw_template, vars_map)
    assert "Farhan Ahmed" in rendered
    assert "https://calendly.com/demoagency/demo?name=Farhan" in rendered
    assert "Demo Agency" in rendered

def test_whatsapp_phone_cleaning():
    assert VoiceAgentService.clean_phone_number("01712643138") == "8801712643138"
    assert VoiceAgentService.clean_phone_number("+880 1712-643138") == "8801712643138"
    assert VoiceAgentService.clean_phone_number("8801712643138") == "8801712643138"
    assert VoiceAgentService.clean_phone_number("+1 (555) 234-5678") == "15552345678"
    assert VoiceAgentService.clean_phone_number("") == ""

def test_gemini_audio_codecs():
    from app.services.gemini_live_service import (
        decode_mulaw_to_pcm16,
        resample_8k_to_16k,
        downsample_24k_to_8k,
        encode_pcm16_to_mulaw,
        AVAILABLE_GEMINI_VOICES,
    )
    # Test mu-law decoding & re-encoding roundtrip
    test_mulaw = b"\xff\x80\x00\x7f" * 40
    pcm16 = decode_mulaw_to_pcm16(test_mulaw)
    assert len(pcm16) == len(test_mulaw) * 2

    # Test 8k to 16k upsampling
    pcm16k = resample_8k_to_16k(pcm16)
    assert len(pcm16k) == len(pcm16) * 2

    # Test 24k to 8k downsampling (3:1 decimation)
    test_24k = b"\x00\x00" * 300
    downsampled_8k = downsample_24k_to_8k(test_24k)
    assert len(downsampled_8k) == (len(test_24k) // 3)

    # Test available voices list
    assert len(AVAILABLE_GEMINI_VOICES) >= 5
    voice_ids = [v["id"] for v in AVAILABLE_GEMINI_VOICES]
    assert "Aoede" in voice_ids
    assert "Puck" in voice_ids


@pytest.mark.asyncio
async def test_bengali_conversational_flow_and_session_memory(monkeypatch):
    class MockKB:
        calendly_url = "https://calendly.com/demoagency/demo"
        company_name = "টেক সলিউশনস"
        agent_persona_name = "সাকিব"
        core_offer = "ফ্রি পাইলট ট্রায়াল"
        service_name = "ক্লাউড সফটওয়্যার ও বিজনেস অটোমেশন"
        system_prompt = "Consultative tone."
        objections_json = []
        faq_kb_json = []
        script_questions_json = []
        gemini_api_key = "test_gemini_key"

    session_id = "test_bengali_sess_101"

    async def mock_gemini_reply(system_prompt, history, user_text, gemini_api_key=None, gemini_model_id=None):
        if "কে বলছেন" in user_text:
            return "আমি সাকিব, টেক সলিউশনস থেকে ফোন দিয়েছি।"
        elif "কী বিষয়" in user_text:
            return "আমরা বিজনেস অটোমেশন সফটওয়্যার নিয়ে কাজ করি।"
        elif "দাম" in user_text:
            return "আমাদের প্রাথমিক ট্রায়াল সম্পূর্ণ ফ্রি।"
        return "জি বলুন, কীভাবে সাহায্য করতে পারি?"

    monkeypatch.setattr(VoiceAgentService, "_generate_llm_reply", mock_gemini_reply)

    # Turn 1: Prospect asks who is calling ("কে বলছেন?")
    res1 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="কে বলছেন?",
        kb=MockKB(),
        override_client_name="রফিক",
        override_company_name="ঢাকা এন্টারপ্রাইজ",
        override_language="Bengali",
        session_id=session_id,
    )
    assert res1["conversation_stage"] == "GREETING"
    assert "সাকিব" in res1["agent_reply_text"]
    assert "টেক সলিউশনস" in res1["agent_reply_text"]
    assert res1["session_id"] == session_id

    # Turn 2: Prospect asks about services ("কী বিষয়? কী সার্ভিস দেন?")
    res2 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="কী বিষয়? কী করেন আপনারা?",
        kb=MockKB(),
        override_client_name="রফিক",
        override_company_name="ঢাকা এন্টারপ্রাইজ",
        override_language="Bengali",
        session_id=session_id,
    )
    assert res2["conversation_stage"] == "DISCOVERY"
    assert "অটোমেশন" in res2["agent_reply_text"] or "সফটওয়্যার" in res2["agent_reply_text"]

    # Turn 3: Prospect asks about pricing ("দাম কত?")
    res3 = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="আপনাদের দাম কত?",
        kb=MockKB(),
        override_client_name="রফিক",
        override_company_name="ঢাকা এন্টারপ্রাইজ",
        override_language="Bengali",
        session_id=session_id,
    )
    assert res3["conversation_stage"] == "OBJECTION"
    assert "ফ্রি" in res3["agent_reply_text"]

    # Verify session memory in cache
    memory = await VoiceAgentService.get_session_memory(session_id)
    assert memory["session_id"] == session_id
    assert memory["client_name"] == "রফিক"
    assert len(memory["history"]) >= 6

def test_multilingual_street_talk_agreement():
    """Verify street talk, Banglish, and casual phrases resolve correctly without brittle lists."""
    # Romanized Banglish street agreement
    agreed1, slot1 = VoiceAgentService.detect_meeting_agreement("bhai link ta pathan dekhi")
    assert agreed1 is True

    # Casual refusal / casual street chatter should not trigger agreement
    agreed2, _ = VoiceAgentService.detect_meeting_agreement("bhai ami ekhon ektu busy pore kotha boli")
    assert agreed2 is False

    # English link request
    agreed3, slot3 = VoiceAgentService.detect_meeting_agreement("Can you please drop the meeting link?")
    assert agreed3 is True
    assert "Flexible" in slot3




