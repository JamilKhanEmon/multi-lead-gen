---
name: visual-research
description: Captures high-resolution visual evidence of website UI, mobile rendering, and creative quality.
---

# Visual Evidence Research Workflow

## Purpose
Captures screenshots of website layouts, mobile viewport renderings, and ad creatives for multimodal visual evaluation by local AI models.

## Procedure
1. Receive input `target_url` and `capture_mode` (`desktop` or `mobile`).
2. Load page in managed headless browser profile.
3. Configure viewport:
   - Desktop: 1280x800
   - Mobile: 375x812 (iPhone device emulation)
4. Allow CSS transitions and fonts to stabilize.
5. Capture clean PNG screenshot and save to `storage/screenshots/<sha256>.png`.
6. Return storage path and image metadata.

## Safety & Boundaries
- Only run visual capture when visual quality directly impacts the target business type.
- Never capture sensitive or private user screens.

## Output Schema
```json
{
  "target_url": "string",
  "viewport": "mobile",
  "screenshot_path": "storage/screenshots/a1b2c3d4e5f6.png",
  "dimensions": { "width": 375, "height": 812 },
  "captured_at": "2026-09-23T12:00:00Z"
}
```
