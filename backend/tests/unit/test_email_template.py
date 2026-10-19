import pytest
from app.models.email_template import EmailTemplate

def test_email_template_default_signature_rendering():
    tpl = EmailTemplate(
        name="test_default",
        subject="Hello {{company_name}}",
        body="Dear {{contact_person}}, {{signature}}",
        sender_name="Alex Taylor",
        sender_title="Account Executive",
        sender_company="Acme Corp",
        sender_email="alex@example.com",
        sender_phone="+1 555-0199",
        sender_website="https://example.com",
        sign_off="Best regards,",
        signature_text="",
    )
    sig = tpl.render_signature()
    assert "Best regards," in sig
    assert "Alex Taylor" in sig
    assert "Account Executive" in sig
    assert "Acme Corp" in sig
    assert "alex@example.com" in sig
    assert "+1 555-0199" in sig
    assert "https://example.com" in sig

def test_email_template_custom_signature_text_override():
    tpl = EmailTemplate(
        name="test_custom",
        subject="Custom Test",
        body="Test Body",
        sender_name="Alex Taylor",
        sign_off="Sincerely,",
        signature_text="--- Custom Direct Signature Block ---\nDirect Line: 12345",
    )
    sig = tpl.render_signature()
    assert "--- Custom Direct Signature Block ---" in sig
    assert "Direct Line: 12345" in sig
    assert "Account Executive" not in sig

def test_persona_signature_raw_content_rendering():
    from app.models.email_template import PersonaSignature
    ps = PersonaSignature(
        title="Consultant Note",
        raw_content="Sincerely,\nAlex Taylor\nAccount Executive, Acme Corp\nEmail: alex@example.com | Phone: +1 555-0199\nhttps://example.com",
        is_active=True,
    )
    sig = ps.render_signature()
    assert "Sincerely," in sig
    assert "Alex Taylor" in sig
    assert "Account Executive, Acme Corp" in sig
    assert "https://example.com" in sig

def test_outreach_template_empty_city_no_parentheses():
    from app.engine.outreach_engine import OutreachEngine
    tpl = {
        "subject": "Quick question regarding {company_name} ({city})",
        "body": "Hi {contact_person},\n\nI was researching top businesses in {city} and came across {company_name}.\n\nWould you be open to a call?",
        "signature_text": ""
    }
    lead_data = {
        "company_name": "New Nation Solar Limited",
        "city": "",
        "contact_person": "Executive",
        "custom_template": tpl,
        "selected_persona": {
            "name": "Sarah Connor",
            "title": "Head of Partnerships",
            "company": "Growth HQ",
            "raw_content": "Best regards,\n\nSarah Connor\nHead of Partnerships"
        }
    }
    subj, body = OutreachEngine.render_email_template(1, lead_data)
    assert "()" not in subj
    assert "in  and" not in body
    assert "in and" not in body
    assert "Sarah Connor" in body
    assert "Head of Partnerships" in body

def test_outreach_template_guarantees_signature_from_inbox_if_persona_missing():
    from app.engine.outreach_engine import OutreachEngine
    tpl = {
        "subject": "Quick question regarding {company_name}",
        "body": "Hi {contact_person},\n\nWe would love to connect.",
        "signature_text": "",
        "sender_name": "",
        "sign_off": ""
    }
    lead_data = {
        "company_name": "Apex Innovations",
        "city": "Austin",
        "contact_person": "Alex",
        "custom_template": tpl,
        "selected_inbox": {
            "from_name": "David Smith",
            "from_email": "david@growthhq.io"
        }
    }
    subj, body = OutreachEngine.render_email_template(1, lead_data)
    assert "David Smith" in body
    assert "Best regards" in body

