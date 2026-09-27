---
name: ads-research
description: Inspects public advertising registries for active campaigns, creative consistency, and landing page quality.
---

# Ads Research Workflow

## Purpose
Inspects public advertising transparency registries (Meta Ad Library, Google Ads Transparency) to identify active commercial campaigns, creative consistency, and conversion landing page alignment.

## Procedure
1. Receive input `company_name` and domain.
2. Query public ad library for active running advertisements.
3. Observe:
   - Presence of active campaigns
   - Ad creative CTA (e.g. "Message on WhatsApp", "Visit Website", "Book Consultation")
   - Destination landing page URL
4. Evaluate alignment: Does clicking the ad lead to a dedicated, high-converting landing page or a generic/broken homepage?

## Safety & Boundaries
- Never assume ROI or claim "ads are failing" without direct data.
- Label detected friction strictly as "potential marketing funnel weakness".

## Output Schema
```json
{
  "active_ads_count": 3,
  "cta_types": ["send_whatsapp_message", "learn_more"],
  "destination_page_type": "generic_homepage",
  "funnel_friction_detected": true,
  "rationale": "Ad promotes instant discount but destination page is an unoptimized homepage with no lead capture form."
}
```
