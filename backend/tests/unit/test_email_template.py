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

