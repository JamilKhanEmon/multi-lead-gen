---
name: "business-discovery"
description: "Discovers verified commercial businesses via Google Maps & web registries with demand-side keyword queries, coordinate verification, and zero dummy data."
---

# Business Discovery Workflow — Candidate Pool Aggregation

## Purpose
Discovers real, active commercial business entities matching requested industry and geographic criteria in Bangladesh. Builds the initial Candidate Pool for the pipeline, prioritizing demand-side decision-maker signals over generic pins.

## Core Directives & Hard Rules
1. **Candidate Pool, Not Final Lead List:** Discovered businesses are raw candidates. Every candidate must pass Deduplication and the FIT GATE before being prospected or contacted.
2. **Zero Dummy Data:** Never return mock or hardcoded business names. If discovery fails on initial query, retry automatically with clean live search terms.
3. **Demand-Side Query Expansion:** Always prefer buyer-intent keyword variants:
   - `<category> head office` / `<category> corporate office` (targets corporate decision makers)
   - `<category> online order` / `<category> booking` (targets businesses actively trying digital)
4. **Mandatory Contact Requirement:** Extract real canonical telephone numbers (`+880...`, `01...`) and official domains.

## Procedure

### Step 1: Input Validation & Geographic Targeting
- Receive `industry`, `location`, `city`, `sub_city`, and `company_limit` (default: 10 target leads $\rightarrow$ scrape 3-5x candidates).
- Normalize location coordinates (e.g. Uttara ≈ 23.8759, 90.3735; Dhanmondi ≈ 23.7465, 90.3760).

### Step 2: Live Candidate Scraping
- Query public Google Maps and local search engine business listings.
- Extract:
  - Canonical business name (NFKC-normalized)
  - Physical address and city
  - Official website URL or domain (if present)
  - Public contact phone number
  - Google Maps listing URL, review count, and star rating

### Step 3: In-Memory Pre-Dedup & Filtering
- Strip out directory aggregators (e.g. YellowPages, Tripadvisor, Yelp).
- Normalize phone numbers to last 10 digits.
- Check against existing database records to discard duplicates *before* the Fit Gate.

### Step 4: Output Compilation
- Return structured candidate array with source URLs and verified metadata.

## Output Schema
```json
{
  "discovered_companies": [
    {
      "canonical_name": "<Target Commercial Entity>",
      "industry": "<target_industry>",
      "location": "<target_location>",
      "website": "https://example.com",
      "phone": "+8801700000000",
      "address": "<Physical Street Address, City>",
      "rating": 4.5,
      "review_count": 85,
      "source_url": "https://www.google.com/maps/search/...",
      "confidence": 0.95
    }
  ],
  "candidate_count": 1
}
```
