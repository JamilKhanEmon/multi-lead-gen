---
name: evidence-collection
description: Aggregates multi-source evidence items, cross-checks URLs, and produces immutable structured evidence records.
---

# Evidence Collection Workflow

## Purpose
Synthesizes findings from website, social, reviews, ads, and news research into structured, tamper-proof evidence records linked to specific parameters.

## Procedure
1. Receive raw signals from all executed research skills for a business.
2. For each observable or inferable signal:
   - Map to corresponding parameter ID (1 through 135)
   - Attach exact source URL and domain
   - Calculate source publication timestamp and compute recency weight
   - Retain raw snapshot reference
3. Check for contradictions between sources:
   - If Source A reports phone active but Source B reports disconnected, mark `conflict: true`
4. Assign status: `PASS`, `WEAK`, `STRONG`, `UNKNOWN`, `NOT_VERIFIED`, or `UNAVAILABLE`.
5. Return standardized evidence collection array.

## Output Schema
```json
{
  "business_name": "string",
  "evidence_items": [
    {
      "parameter_id": 43,
      "source_url": "https://example.com/contact",
      "source_type": "website",
      "evidence_text": "Website contact page provides no direct WhatsApp link or chat widget.",
      "status": "STRONG",
      "classification": "OBSERVABLE",
      "confidence": 0.95,
      "recency_weight": 100,
      "conflict": false
    }
  ]
}
```
