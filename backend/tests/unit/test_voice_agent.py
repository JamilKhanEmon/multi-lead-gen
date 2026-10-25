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

def test_objection_counter():
    objections = [
        {"trigger": "budget", "counter": "Our pilot is 100% free with zero upfront investment."}
    ]
    counter = VoiceAgentService.find_objection_counter("We do not have any budget for this", objections)
    assert counter == "Our pilot is 100% free with zero upfront investment."

    # When no objection matches in dynamic list, it returns None (allowing LLM to handle it dynamically)
    counter_busy = VoiceAgentService.find_objection_counter("I am very busy right now", [])
    assert counter_busy is None

@pytest.mark.asyncio
async def test_process_dialogue_turn_meeting_booked():
    class MockKB:
        company_name = "Acme AI"
        agent_persona_name = "Alex"
        core_offer = "Free 14-day trial"
        service_name = "Enterprise Automation"
        system_prompt = "Keep responses under 15 words."
        objections_json = []

    res = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Tomorrow at 3 PM works fine for me",
        kb=MockKB(),
        override_client_name="Rafiqul",
        override_company_name="Star Textiles",
        override_exact_problem="fabric defects",
    )

    assert res["meeting_booked"] is True
    assert res["meeting_link"] is None  # Zero dummy fake link generated
    assert "3:00 PM" in res["meeting_time"]
    assert "locked in" in res["agent_reply_text"].lower()

def test_user_reported_speech_agreement():
    agreed, slot = VoiceAgentService.detect_meeting_agreement("Yeah oh yeah Mom available at this time")
    assert agreed is True
    assert slot is not None

    agreed2, slot2 = VoiceAgentService.detect_meeting_agreement("Yeah I'm available at this time")
    assert agreed2 is True

def test_service_inquiry_counter():
    custom_objections = [
        {"trigger": "service", "counter": "We build custom automated client acquisition systems."}
    ]
    counter = VoiceAgentService.find_objection_counter(
        "Uh could you please share with me what the service list",
        custom_objections,
        company_name="A Leading Real Estate Developer Company",
    )
    assert counter is not None
    assert "automated client acquisition" in counter.lower()

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

    res = await VoiceAgentService.process_dialogue_turn(
        user_speech_text="Yes, tomorrow 3 PM works perfectly",
        kb=MockCalendlyKB(),
        override_client_name="Farhan",
        override_company_name="Apex Real Estate",
        override_exact_problem="manual lead routing",
    )

    assert res["meeting_booked"] is True
    assert res["meeting_link"] == "https://calendly.com/example-company/demo"
    assert "calendly" in res["agent_reply_text"].lower()

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
