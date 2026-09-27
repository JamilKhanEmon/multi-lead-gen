---
name: review-research
description: Analyzes public customer reviews to identify repeated complaint themes and owner response habits.
---

# Review Research Workflow

## Purpose
Examines public ratings and reviews across Google Maps and business directories to detect genuine, repeated customer pain points (e.g. communication delays, booking friction, delivery issues).

## Procedure
1. Receive input `business_name`, `location`, and profile URL.
2. Extract overall rating, total review count, and reviews published in the last 180 days.
3. Identify recurring complaint themes across 1-star and 2-star reviews:
   - "Unanswered phone calls" or "no reply to WhatsApp"
   - "Delayed appointment confirmation"
   - "Broken online system"
4. Check owner response frequency to public reviews.
5. Record exact quotation snippets and publication timestamps for evidence preservation.

## Safety & Boundaries
- Single negative reviews are marked as weak evidence (Level 1).
- Repeated patterns (3+ independent reviewers citing the same friction) qualify as stronger evidence (Level 3).
- Only public reviews are processed.

## Output Schema
```json
{
  "total_reviews": 48,
  "average_rating": 3.7,
  "repeated_complaint_themes": [
    {
      "theme": "slow_response_time",
      "count": 5,
      "sample_quotes": [
        "Called three times to book an appointment with no answer.",
        "Sent WhatsApp message last week and never got a reply."
      ],
      "recency_days": 18
    }
  ],
  "owner_response_rate": 0.15
}
```
