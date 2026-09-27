---
name: news-research
description: Gathers public announcements, new project launches, expansions, and partnerships.
---

# News & Announcements Research Workflow

## Purpose
Collects verifiable growth and activity signals from corporate press releases, news articles, and project announcements to establish business context and intent.

## Procedure
1. Search public news indexes for `"{company_name}"` combined with keywords: `"launch"`, `"expansion"`, `"contract"`, `"project"`, `"partnership"`.
2. Extract headline, publication date, source domain, and summary of the milestone.
3. Categorize signal: new branch, major contract, new service line, or general activity.

## Safety & Boundaries
- News signals serve as context and intent boosters; they do **not** represent business weaknesses.
- Preserve source domain and publication timestamp.

## Output Schema
```json
{
  "announcements": [
    {
      "headline": "XYZ Builders Secures Major Commercial Plaza Contract",
      "published_at": "2026-07-20T00:00:00Z",
      "source_url": "https://news-example.com/biz/xyz-contract",
      "signal_type": "new_project",
      "significance": "high"
    }
  ]
}
```
