import pytest
from app.services.ai_client import parse_llm_json_response

def test_parse_clean_json():
    raw = '{"status": "ok", "ping": "pong"}'
    res = parse_llm_json_response(raw)
    assert res == {"status": "ok", "ping": "pong"}

def test_parse_markdown_json():
    raw = """```json
{
  "status": "ok",
  "score": 95
}
```"""
    res = parse_llm_json_response(raw)
    assert res.get("status") == "ok"
    assert res.get("score") == 95

def test_parse_reasoning_tags_think():
    raw = """<think>
The user is asking for a diagnostic ping-pong response in JSON.
I will generate {"status": "ok", "ping": "pong"}.
</think>
```json
{
  "status": "ok",
  "ping": "pong"
}
```"""
    res = parse_llm_json_response(raw)
    assert res == {"status": "ok", "ping": "pong"}

def test_parse_unclosed_think_tag_no_crash():
    raw = "<think>\nModel ran out of tokens before finishing thinking..."
    res = parse_llm_json_response(raw)
    assert isinstance(res, dict)

def test_parse_trailing_commas():
    raw = '{\n  "subject": "Quick question",\n  "body": "Hi there",\n}'
    res = parse_llm_json_response(raw)
    assert res.get("subject") == "Quick question"
    assert res.get("body") == "Hi there"

def test_parse_conversational_wrapping():
    raw = """Sure! Here is the cold email you requested:

{
  "subject": "Growth synergy for Acme Corp",
  "body": "Hi John,\\n\\nI noticed your recent expansion."
}

Let me know if you would like any revisions!"""
    res = parse_llm_json_response(raw)
    assert res.get("subject") == "Growth synergy for Acme Corp"
    assert "expansion" in res.get("body", "")

def test_parse_plain_text_email():
    raw = """Subject: Quick collaboration question

Hi Sarah,

I came across your company and saw great synergy in lead generation. Would you have 10 minutes next Tuesday?

Best regards,
Outreach Team"""
    res = parse_llm_json_response(raw)
    assert res.get("subject") == "Quick collaboration question"
    assert "Hi Sarah" in res.get("body", "")

def test_parse_empty_or_malformed():
    assert parse_llm_json_response("") == {}
    assert parse_llm_json_response(None) == {}
    res = parse_llm_json_response("Some totally unparseable string")
    assert "content" in res
