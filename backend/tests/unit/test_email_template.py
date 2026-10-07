"""
Unit Tests for Global Email Template & Signature Rendering
"""
import pytest
from app.models.email_template import EmailTemplate


def test_email_template_default_signature_rendering():
    tpl = EmailTemplate(
        name="test_default",
        subject="Hello {{company_name}}",
        body="Dear {{contact_person}}, {{signature}}",
        sender_name="Jamil Khan",
        sender_title="Senior Solutions Consultant",
        sender_company="Multi-Lead Gen AI",
        sender_email="contact@leadgen.local",
        sender_phone="+880 1700-000000",
        sender_website="https://leadgen.local",
        sign_off="Best regards,",
        signature_text="",
    )
    sig = tpl.render_signature()
    assert "Best regards," in sig
    assert "Jamil Khan" in sig
    assert "Senior Solutions Consultant" in sig
    assert "Multi-Lead Gen AI" in sig
    assert "contact@leadgen.local" in sig
    assert "+880 1700-000000" in sig
    assert "https://leadgen.local" in sig


def test_email_template_custom_signature_text_override():
    tpl = EmailTemplate(
        name="test_custom",
        subject="Custom Test",
        body="Test Body",
        sender_name="Jamil Khan",
        sign_off="Sincerely,",
        signature_text="--- Custom Direct Signature Block ---\nDirect Line: 12345",
    )
    sig = tpl.render_signature()
    assert "--- Custom Direct Signature Block ---" in sig
    assert "Direct Line: 12345" in sig
    assert "Senior Solutions Consultant" not in sig


def test_persona_signature_raw_content_rendering():
    from app.models.email_template import PersonaSignature
    ps = PersonaSignature(
        title="Consultant Note",
        raw_content="Sincerely,\ntest\nSenior Solutions Consultant, Multi-Lead Gen AI\nEmail: contact@leadgen.local | Phone: +880 1700-000000\nhttps://leadgen.local",
        is_active=True,
    )
    sig = ps.render_signature()
    assert "Sincerely," in sig
    assert "test" in sig
    assert "Senior Solutions Consultant, Multi-Lead Gen AI" in sig
    assert "https://leadgen.local" in sig

