---
name: social-research
description: Researches public social media profiles for posting recency, customer questions, and engagement.
---

# Social Research Workflow

## Purpose
Gathers publicly visible signals from brand social profiles (Facebook, Instagram, LinkedIn, YouTube) regarding activity recency, customer inquiries, and response patterns.

## Procedure
1. Receive input `company_name` and known social URLs.
2. Visit public business pages.
3. Extract:
   - Date of newest post
   - Approximate posting frequency over the last 90 days
   - Visible public customer questions in post comments
   - Unanswered customer inquiries or unanswered complaints
   - Presence of working WhatsApp/contact CTA buttons
4. Calculate recency and activity status.

## Safety & Boundaries
- Only publicly visible business page content is accessed.
- Strictly **never** access private messages, personal direct messages, or locked accounts.
- Zero login sessions; zero personal cookies.
- If a platform blocks access or requires login, mark `status: "UNAVAILABLE"` (never assume the account doesn't exist).

## Output Schema
```json
{
  "platform": "facebook",
  "profile_url": "string",
  "is_active": true,
  "last_post_date": "2026-08-15T00:00:00Z",
  "unanswered_public_questions": 4,
  "public_engagement_level": "medium",
  "contact_options_visible": ["phone", "email"]
}
```
