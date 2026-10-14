---
name: "review-research"
description: "Analyzes public Google Maps ratings, review sentiments, and customer service bottlenecks with 1-click human verification links."
---

# Review Research Workflow — Google Maps Reputation & Service Bottleneck Audit

## Purpose
Examines public ratings, review counts, and customer feedback across Google Maps and local business profiles to detect operational pain points (e.g. communication delays, front-desk chaos, manual booking bottlenecks) and provides 1-click proof links for human sales callers.

## Core Directives & Hard Rules
1. **Zero Dummy Data:** Never guess a rating or fake reviewer comments. Extract real numbers from the business's public Maps profile.
2. **1-Click Proof Verification:** Every finding must provide the direct Google Maps profile search URL (`proof_link`) so a human caller can click and read the actual customer reviews before making a call.
3. **Dual Interpretation Matrix:**
   - **Low Rating (< 4.3★):** Customer sentiment highlights response delays, unanswered calls, or slow service. Pitch: Customer Service CRM & Reputation Management.
   - **High Rating (> 4.5★ with 50+ reviews):** Business has massive local commercial demand, but relies on manual phone calls/paper registers. Pitch: Automated Client Intake, Cloud POS & Appointment Booking.

## Procedure

### Step 1: Google Maps Profile Link Construction
- Receive `business_name`, `location`, `rating`, and `review_count`.
- Generate the direct Google Maps search and profile URL:
  `https://www.google.com/maps/search/{encoded_name_and_location}`

### Step 2: Rating & Sentiment Classification
- **Case A: Rating < 4.3★ (`MAPS_RATING_GAP`)**
  - Customer review sentiment indicates service response bottlenecks, phone reachability issues, or booking delays in the target market.
  - *Proof:* Link directly to Maps listing.
  - *Sales Angle:* "We noticed your Google Maps rating has dropped to {rating}★ with customers mentioning delays in phone response. Our automated intake system ensures no customer wait times."
- **Case B: Rating >= 4.3★ with High Volume (`LOCAL_DEMAND_AUTOMATION_FIT`)**
  - Strong commercial reputation ({rating}★ across {review_count} reviews), but inbound client intake and booking remain completely manual.
  - *Proof:* Link directly to Maps listing.
  - *Sales Angle:* "You have a top-rated reputation on Google Maps ({rating}★), but your team is handling all incoming inquiries through manual phone calls. Our software automates booking and client routing."

### Step 3: Owner Response Habit Check
- Check if negative or recent reviews receive official owner responses.
- If owner response rate is zero or low, flag as unmanaged public reputation.

### Step 4: Output Generation
- Compile structured JSON output with the exact Google Maps URL as `proof_link`.

## Output Schema
```json
{
  "business_name": "Sultans Dine Dhanmondi",
  "location": "Dhanmondi, Dhaka",
  "google_maps_url": "https://www.google.com/maps/search/Sultans%20Dine%20Dhanmondi",
  "proof_link": "https://www.google.com/maps/search/Sultans%20Dine%20Dhanmondi",
  "rating": 4.1,
  "review_count": 840,
  "evidence_tag": "MAPS_RATING_GAP",
  "evidence_text": "Google Maps public rating stands at 4.1★ (840 reviews) with customer review sentiment indicating response bottlenecks. Proof: https://www.google.com/maps/search/Sultans%20Dine%20Dhanmondi",
  "checked_live": true
}
```
