---
name: "ads-research"
description: "Inspects public Meta Ad Library transparency registries and website conversion pixel signals with direct clickable proof links."
---

# Ads Research Workflow — Meta Ad Transparency & Conversion Funnel Audit

## Purpose
Examines public advertising transparency registries (Meta Ad Library) to detect whether a commercial entity is actively spending money on paid Facebook/Instagram advertisements, and audits whether that ad spend is supported by proper conversion tracking (Meta Pixel) and automated customer funnels.

## Core Directives & Hard Rules
1. **Zero Dummy Data:** Never assume a company is running ads without real verification. Use the public transparency link to provide 100% auditable evidence.
2. **1-Click Proof Verification:** Every observation must provide the direct Meta Ad Library search URL (`proof_link`) so the sales caller or manager can click and view live running creatives instantly.
3. **The 'Leaking Ad Spender' Formula:** A business spending money on ads without a website lead capture form, without a Meta Pixel, or without an automated WhatsApp CRM is wasting 40-60% of their budget. This is our highest-converting pitch!

## Procedure

### Step 1: Meta Ad Library Query Generation
- Receive `canonical_name`, `domain`, and `has_meta_pixel`.
- Construct the verified public Meta Ad Library URL:
  `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BD&q={encoded_name}&search_type=keyword_unordered&media_type=all`
- Query search engine index to observe if active advertisements are currently associated with the brand name.

### Step 2: Conversion Tracking Audit (Meta Pixel Check)
- Cross-check with website research: Does the business domain load the official Meta Pixel (`fbq('init', ...)` or `connect.facebook.net/en_US/fbevents.js`)?
- Classification:
  - **Pixel Missing (`NO_PIXEL`):** If the company runs ads or has a website but lacks a Meta Pixel, they cannot track website conversions, calculate return on ad spend (ROAS), or run visitor retargeting campaigns.
  - **Pixel Active:** Confirms sophisticated marketing intent; pitch CRM and automated lead intake.

### Step 3: Landing Page & Funnel Alignment
- If ads point directly to a phone number or a generic homepage without an inquiry form or WhatsApp router:
  - Flag as **`ADS_RUNNING_LEAD_LEAKAGE`**.
  - *Sales Opener:* "We saw you are running active paid ads in Dhaka, but prospects clicking your ads don't have an automated inquiry capture form. Inquiries are getting lost."

### Step 4: Output Generation
- Assemble the auditable evidence note containing the live Meta Ad Library link.

## Output Schema
```json
{
  "canonical_name": "<Target Business Name>",
  "domain": "example.com",
  "meta_ads_url": "https://www.facebook.com/ads/library/?...",
  "proof_link": "https://www.facebook.com/ads/library/?...",
  "has_pixel_signal": false,
  "funnel_friction_detected": true,
  "evidence_text": "Meta Ad Library verification check completed. Official website lacks retargeting pixel or direct lead capture funnel.",
  "checked_live": true
}
```
