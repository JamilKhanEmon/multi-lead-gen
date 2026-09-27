"""
Unit tests for B2B Voice Calling Agent Service.
"""
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
    # 00:00 to 23:59 should always be within hours
    is_valid, msg = VoiceAgentService.is_within_office_hours("00:00", "23:59")
    assert is_valid is True
    assert "Active Office Hours" in msg


def test_generate_meeting_link():
    gmeet = VoiceAgentService.generate_meeting_link("Google Meet", "Star Textiles")
    assert gmeet.startswith("https://meet.google.com/")

    zoom = VoiceAgentService.generate_meeting_link("Zoom", "Star Textiles")
    assert zoom.startswith("https://zoom.us/j/")


def test_detect_meeting_agreement():
    # Agreeing with specific time
    agreed, slot = VoiceAgentService.detect_meeting_agreement("Sure, tomorrow at 3 pm works for me")
    assert agreed is True
    assert "3:00 PM" in slot

    # Agreeing with link request
    agreed2, slot2 = VoiceAgentService.detect_meeting_agreement("Yes, send me the meeting link")
    assert agreed2 is True

    # Common Bengali agreement
    agreed3, slot3 = VoiceAgentService.detect_meeting_agreement("কাল বিকাল ৩টায় পারব")
    assert agreed3 is True
    assert "3:00 PM" in slot3

    # Disagreeing or asking question
    agreed4, slot4 = VoiceAgentService.detect_meeting_agreement("How much does it cost?")
    assert agreed4 is False


def test_objection_counter():
    objections = [
        {"trigger": "budget", "counter": "Our pilot is 100% free with zero upfront investment."}
    ]
    counter = VoiceAgentService.find_objection_counter("We do not have any budget for this", objections)
    assert counter == "Our pilot is 100% free with zero upfront investment."

    # Built-in objection
    counter_busy = VoiceAgentService.find_objection_counter("I am very busy right now", [])
    assert "10 minutes on Zoom" in counter_busy


@pytest.mark.asyncio
async def test_process_dialogue_turn_meeting_booked():
    class MockKB:
        meeting_platform = "Google Meet"
        company_name = "Apex AI"
        agent_persona_name = "Jamil"
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
    assert res["meeting_link"] is not None
    assert "3:00 PM" in res["meeting_time"]
    assert "dispatching" in res["agent_reply_text"].lower()


def test_user_reported_speech_agreement():
    # User's exact speech-to-text phrase
    agreed, slot = VoiceAgentService.detect_meeting_agreement("Yeah oh yeah Mom available at this time")
    assert agreed is True
    assert slot is not None

    agreed2, slot2 = VoiceAgentService.detect_meeting_agreement("Yeah I'm available at this time")
    assert agreed2 is True


def test_service_inquiry_counter():
    counter = VoiceAgentService.find_objection_counter(
        "Uh could you please share with me what the service list",
        [],
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
