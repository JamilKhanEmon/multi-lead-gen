---
name: business-discovery
description: Discovers public business candidates matching requested industry and location criteria.
---

# Business Discovery Workflow

## Purpose
Discovers real commercial businesses in target geographic areas and industries through public directories, local listings, and search results.

## Procedure
1. Receive input parameters: `industry`, `location`, `company_limit`, `business_type_override`.
2. Query public search engines and business registries using search terms: `"{industry} companies in {location}"` and `"{industry} services {location}"`.
3. Extract candidates:
   - Canonical business name
   - Official website URL (if found)
   - Public contact phone number
   - Physical address / city
   - Primary discovery source URL
4. Filter out duplicates and personal/irrelevant results.
5. Format and return structured JSON.

## Safety & Boundaries
- Only access publicly accessible listings.
- Never bypass login or paywalls.
- Never scrape private personal data.
- If a listing does not provide a phone or website, record `null` (do not guess).

## Output Schema
```json
{
  "discovered_companies": [
    {
      "canonical_name": "string",
      "industry": "string",
      "location": "string",
      "website": "string or null",
      "phone": "string or null",
      "address": "string or null",
      "source_url": "string",
      "business_type": "string",
      "confidence": 0.95
    }
  ]
}
```
