---
name: "skill-lead-gen"
description: "Demand-side lead pipeline for N I Biz Soft: catch buying signals (broken sites, ad spenders, hiring, manual ops) → fit-gate → prospect only leads with evidence → discovery-first script → store in local PostgreSQL system database and display in UI dashboard (No external Google Sheet required)."
---

# skill-lead-gen — Demand-Side Lead Pipeline for N I Biz Soft (System-Native)

End-to-end pipeline: **Aggregate candidates → Dedup → FIT GATE → Prospect → Call Script → Store in Database**.
v2 Pipeline is DEMAND-SIDE. We no longer pitch every scraped business.
A lead only gets prospected, scored, or handed to employees if it has **live evidence of a buying signal** matched to a **specific NiBiz service**. No evidence → silently dropped. Goal: employees only call leads with a documented, specific reason to buy.

## Trigger
User asks for leads (e.g., "find me leads for restaurants in Chattogram", "run lead gen real estate").
Default mode is fit-gated. "Just scrape anything" mode must be explicitly requested.

## Inputs
1. **Keywords / Industry** — business type (e.g., "real estate developer", "restaurant", "hospital")
2. **Location** — area/city in Bangladesh (+ lat/lon if known; default Dhaka 23.7806, 90.4074)
3. **Count** — target number of FIT-GATED leads (default 10). Note: scrape 3–5x this number; the gate drops candidates without signals.

## Stage 1 — Candidate Aggregation
- Query local business directory and maps sources for candidates.
- Prioritize demand-side keyword variants:
  - `<category> head office` / `<category> corporate office` (bigger buyers)
  - `<category> <service-needed>` e.g. "restaurant online order" (already trying digital)
- Normalize: name, address, phone, website, Maps URL, review count, rating count.

## Stage 1.5 — Dedup Check (against System DB)
- Check normalized name, domain, and last 10 digits of phone against existing database records.
- Drop ALL duplicates before the fit gate. Never gate, prospect, score, or draft for a duplicate entity.

## Stage 1.7 — FIT GATE (Core Logic)
For each candidate, hunt for buying-signal EVIDENCE and BUDGET signals. **A lead must have ≥1 EVIDENCE signal + ≥1 BUDGET signal to pass.**
- **HARD RULES:**
  - Healthy modern website AND no other evidence signal → **DROP** (web dev pitch is useless).
  - Small one-location shop with no budget signals → **DROP** (pitching ERP = "not interested").
  - If evidence supports multiple services, pick the one with the strongest pain; note the rest in "What They Need".
  - Record the exact evidence in `why_they_need_us` — employees repeat it on the call.
  - Gate failure = silent drop. Do not store gated-out businesses in leads.

## Stage 2 — Prospect & Verify
For each gate-passed lead:
1. Confirm live evidence and pain points.
2. **PHONE & EMAIL VERIFICATION:**
   - Dig through website contact/about pages (`mailto:`, `tel:`).
   - Search public business listings and verified Facebook page.
3. Record:
   - `why_they_need_us`: Live verified evidence / pain point.
   - `what_they_need`: Specific solution + wedge offer.
   - `matched_service`: Best-fit service from NiBiz service matrix.

## Stage 3 — 30-Second Discovery-First Call Script
Employees pitch AFTER one discovery question, not before:
1. **Hook:** Open with the evidence ("I saw your booking is phone-only / you're running ads without CRM / your site is down").
2. **Discovery Question:** "How are you tracking [orders/stock/bookings/leads] right now?" — their answer confirms the pain in 30 seconds.
3. **Wedge Offer:** Offer 5-minute interactive live demonstration.

## Stage 4 — System Storage (PostgreSQL & Next.js UI)
- Leads are saved directly into the PostgreSQL database via `/api/v1/leads`.
- No Google Sheets needed.
- Leads immediately appear in the Next.js UI Dashboard under `/leads` with:
  - Fit-tier badges (`🔥 HOT`, `⚡ WARM`)
  - Direct 1-Click WhatsApp and phone calling
  - Instant popup **"📞 Call Script"** with ready English & Bengali scripts
  - Full audit trail and status tracking.
