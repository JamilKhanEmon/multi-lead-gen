---
name: jobs-research
description: Inspects public job postings for hiring intent, IT openings, and technology adoption signals.
---

# Jobs & Hiring Research Workflow

## Purpose
Surveys public career pages and job boards to detect hiring velocity and specific technology openings (e.g. searching for CRM managers, software engineers, or digital marketers).

## Procedure
1. Search public career sites for `"{company_name}"` job listings.
2. Filter active job posts from the past 90 days.
3. Categorize roles:
   - General hiring velocity (expansion indicator)
   - Technology/IT roles (technology investment intent)
   - Sales/Marketing roles (lead-generation and funnel intent)

## Safety & Boundaries
- Only passive inspection of public job boards.
- Absence of job postings does not mean a company isn't hiring internally; mark as `status: "UNKNOWN"` if no postings found.

## Output Schema
```json
{
  "active_job_count": 4,
  "tech_roles_found": ["CRM Specialist", "Digital Marketing Executive"],
  "hiring_intent_level": "strong",
  "source_urls": ["https://jobs-example.com/xyz"]
}
```
