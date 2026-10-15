---
name: "website-research"
description: "Audits corporate websites for mobile responsiveness, broken links, missing lead capture forms, WhatsApp widgets, and Meta Pixel tracking with 1-click proof links."
---

# Website Research Workflow — Deep Technical & Conversion Audit

## Purpose
Inspects public website assets using an isolated browser and DOM analyzer to evaluate technical availability, mobile responsiveness, contact capture friction, and advertising tracking tags, providing 1-click proof links for human sales verification.

## Core Directives & Hard Rules
1. **Zero Dummy Data:** Never assume a website is broken without executing a real HTTP/browser request. If unreachable, record `is_accessible: false` with the exact HTTP error code.
2. **1-Click Proof Verification:** Provide the target website URL (`proof_link`) so the sales caller can test mobile layout or broken forms with one click.
3. **Healthy Website Gate Rule:** If a company has a modern, healthy, mobile-responsive website AND has no other operational pain signals $\rightarrow$ **DROP** from web development pitches (do not waste time pitching website redesigns to companies whose site is already great).

## Procedure

### Step 1: HTTP Handshake & SSL Encryption
- Receive target `url`, `canonical_name`, and `location`.
- Validate HTTP response code and SSL certificate (HTTPS).
- Check if domain is parked, suspended, or returning 404/500 errors.

### Step 2: Mobile Viewport & Responsive Layout Check
- Render page in mobile viewport (width: 375px).
- Check for horizontal scrolling (`mobile_overflow: true`) or unscaled desktop viewports (`has_viewport: false`).
- If mobile layout breaks, flag as **`NOT_MOBILE_RESPONSIVE`**.

### Step 3: Inbound Lead Capture & WhatsApp Friction
- Scan DOM for `<form>` elements and input types (`text`, `email`, `tel`).
  - If no contact form or online booking exists, flag as **`NO_LEAD_FORM`**.
- Scan DOM and anchor tags for WhatsApp links (`wa.me`, `whatsapp.com`, `api.whatsapp.com`, `elfsight-app-whatsapp`).
  - If no WhatsApp link exists, flag as **`NO_WHATSAPP`**.
- For appointment niches (clinics, salons, consultants), check for digital appointment scheduling.
  - If missing, flag as **`NO_ONLINE_BOOKING`**.

### Step 4: Tracking Scripts & Conversion Attribution
- Inspect `<head>` and script tags for:
  - Meta Advertising Pixel (`fbq('init', ...)` / `connect.facebook.net/.../fbevents.js`)
  - Google Analytics / GA4 (`gtag('config', ...)` / `google-analytics.com/analytics.js`)
- If missing, flag as **`NO_PIXEL`** or **`NO_ANALYTICS`**.

### Step 5: Output Compilation
- Return structured audit result with proof link and verified gaps.

## Output Schema
```json
{
  "url": "https://example.com",
  "proof_link": "https://example.com",
  "is_accessible": true,
  "status": 200,
  "mobile_responsive": false,
  "mobile_overflow": true,
  "has_contact_form": false,
  "has_whatsapp": false,
  "has_online_booking": false,
  "has_meta_pixel": false,
  "has_google_analytics": false,
  "broken_links_count": 0,
  "extracted_phone": "+8801700000000",
  "extracted_email": "info@example.com",
  "evidence_text": "Public website layout breaks on mobile viewports with horizontal scrolling. No direct appointment scheduling or interactive lead capture detected. Proof: https://example.com",
  "checked_live": true
}
```
