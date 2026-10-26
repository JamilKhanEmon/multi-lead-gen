---
name: "social-research"
description: "Deep public social media intelligence: inspects Facebook & Instagram business profiles for posting recency, dormancy, unanswered buyer comments ('price please'), and click-to-WhatsApp funnels with 1-click human proof links."
---

# Social Research Workflow — Deep Social Intelligence & Human Verification

## Purpose
Inspects public brand profiles on Facebook and Instagram to detect live buying signals and operational weaknesses without requiring private logins or Meta Graph tokens. Identifies whether a business is actively spending effort on social media or has completely neglected its digital presence, and provides 1-click clickable proof links for human sales callers.

## Core Directives & Hard Rules
1. **Zero Dummy Data:** Never fabricate post dates, follower counts, or activity status. If a profile cannot be found or indexed, explicitly return `has_facebook: false` and factual search queries. Never generate mock placeholders.
2. **1-Click Proof Links:** Every observation must be backed by the real, verified profile URL (`proof_link`) so human callers can click and verify in 2 seconds before pitching.
3. **No Login Wall Blockers:** Use search engine dorking (`site:facebook.com "<Name>"`) and public webview/mbasic to bypass desktop login redirects and read public intro/about, contact numbers, and post timestamps.

## Procedure

### Step 1: Profile Discovery & Name Disambiguation
- Receive `canonical_name`, `domain`, `location`, and optional `facebook_url`.
- If `facebook_url` is not provided:
  - Query: `site:facebook.com "{canonical_name}" {location}`
  - Filter out generic shares, groups, login redirects, or name collisions from other countries.
  - Record the verified canonical Facebook page URL.

### Step 2: Post Recency & Activity State Detection
- Extract public post timestamps and date markers from recent feed snippets (e.g., "Oct 2026", "2 months ago", "2024", "Yesterday").
- Classify page activity:
  - **`DORMANT_SOCIAL_PAGE` (High Value Pitch):** Last post was > 60 days ago, in a previous year (2024, 2023), or no recent posts detected.
    - *Pitch:* Business is losing local customers to competitors because their social presence is dormant. Offer Social Media Management & Digital Brand Revival.
  - **`ACTIVE_POSTING`:** Recent posts within last 30 days.
    - *Pitch:* Active traffic needs automated CRM and WhatsApp lead routing.

### Step 3: Inbound Customer Funnel & Comment Neglect Audit
- Inspect public comments on recent posts for unanswered purchase intent:
  - Public queries like *"Price please"*, *"How to order?"*, *"Address?"*, *"Doctor schedule?"*
  - If comments lack automated fast replies, flag as **`UNANSWERED_BUYER_LEADS`** (lost ad spend / manual delay).
- Verify presence of direct **Click-to-WhatsApp** link (`wa.me` or WhatsApp action button).
  - If missing, flag as **`NO_WHATSAPP`**.

### Step 4: Contact Extraction & Cross-Check
- Extract public contact mobile numbers and emails from the page Intro/About snippet.
- Validate that the phone number is a real telephone line and not a Facebook page ID.

### Step 5: Output Generation & Proof Verification
- Formulate factual evidence notes including the exact proof URL.
- Output clean structured JSON matching backend `LiveResearchEngine` and `FitGateEngine`.

## Output Schema
```json
{
  "canonical_name": "<Target Business Name>",
  "domain": "example.com",
  "facebook_url": "https://www.facebook.com/example-biz",
  "proof_link": "https://www.facebook.com/example-biz",
  "has_facebook": true,
  "is_dormant": true,
  "post_recency_text": "Last post detected from several months ago",
  "has_whatsapp": false,
  "comment_neglect_detected": true,
  "evidence_text": "Public social page verified. Activity check indicates dormant posting schedule with delayed inquiry follow-ups.",
  "checked_live": true
}
```
