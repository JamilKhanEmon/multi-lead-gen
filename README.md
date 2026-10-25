# 🎯 Multi-LeadGen AI — Autonomous B2B Lead Generation, Qualification & Outreach Platform

An enterprise-grade, autonomous B2B lead generation, intelligence gathering, deterministic qualification, and automated multi-channel outreach platform. 

The system automates the entire sales pipeline: discovering verified businesses across any target industry and geographic region, crawling websites via autonomous headless browser agents, capturing immutable visual screenshot proof, evaluating leads across **135 deterministic parameters**, and executing high-converting outreach campaigns (Deliverability-Engineered Cold Emails with Multi-Inbox Rotation, Meta Ads Copywriting, and Bilingual AI Voice Calling).

---

## 📑 Table of Contents
1. [🌟 System Overview & Value Proposition](#-system-overview--value-proposition)
2. [⚙️ Complete Technology Stack (কী কী ব্যবহার করা হয়েছে)](#️-complete-technology-stack-কী-কী-ব্যবহার-করা-হয়েছে)
3. [🧠 Core Architecture & Engine Breakdown (কে কী কাজ করে)](#-core-architecture--engine-breakdown-কে-কী-কাজ-করে)
   - [1. Discovery Optimizer & Geo-Expansion Engine](#1-discovery-optimizer--geo-expansion-engine)
   - [2. Multi-Factor Deduplication & Aggregator Filtering](#2-multi-factor-deduplication--aggregator-filtering)
   - [3. Deep Web Scraping & Visual Evidence Engine (OpenClaw)](#3-deep-web-scraping--visual-evidence-engine-openclaw)
   - [4. 135 Deterministic Parameters Audit Engine](#4-135-deterministic-parameters-audit-engine)
   - [5. Mathematical Scoring & Tier Qualification Gates](#5-mathematical-scoring--tier-qualification-gates)
   - [6. Deliverability-Engineered Cold Outreach Engine (RFC 5322)](#6-deliverability-engineered-cold-outreach-engine-rfc-5322)
   - [7. Bilingual AI Voice Agent & Dialogue Engine](#7-bilingual-ai-voice-agent--dialogue-engine)
   - [8. Unified Conversation Inbox & IMAP Sync Engine](#8-unified-conversation-inbox--imap-sync-engine)
   - [9. Meta Ads Copywriting & Creative Generator](#9-meta-ads-copywriting--creative-generator)
   - [10. Autopilot Continuous Daemon & Task Queue Fleet](#10-autopilot-continuous-daemon--task-queue-fleet)
   - [11. Granular RBAC Team Permissions Architecture](#11-granular-rbac-team-permissions-architecture)
4. [🔄 End-to-End Lead Lifecycle & State Transitions](#-end-to-end-lead-lifecycle--state-transitions)
5. [📂 Exhaustive Project Directory Structure](#-exhaustive-project-directory-structure)
6. [🚀 Local Development Setup Guide](#-local-development-setup-guide)
7. [🚢 Production VPS Deployment Guide](#-production-vps-deployment-guide)
8. [🔐 Complete Environment Variables Reference](#-complete-environment-variables-reference)
9. [🌐 API Endpoints & WebSocket Architecture](#-api-endpoints--websocket-architecture)
10. [📜 License](#-license)

---

## 🌟 System Overview & Value Proposition

Traditional B2B lead generation relies on bloated directories, stale email lists, and generic spamming that damages domain reputation. **Multi-LeadGen AI** is built on a **proof-first, deterministic qualification methodology**:

- **Real-Time Discovery:** Directly scrapes active, operational businesses from Google Maps, local search, and company websites without hardcoded geographic or industry limits.
- **Visual Evidence & Proof:** Executes headless Chromium browsers to take high-resolution viewport and full-page screenshots of every prospect's website, validating detected gaps with visual proof.
- **135 Deterministic Parameters:** Replaces subjective AI hallucinations with rigorous, rule-based audits across 6 technical and commercial pillars.
- **Multi-Channel Personalized Outreach:**
  - **Cold Email:** RFC 5322-compliant multipart MIME emails with multi-inbox round-robin rotation, human approval queues, and automated follow-ups.
  - **AI Voice Agent:** Autonomous bilingual voice calling (English & Bengali) powered by ElevenLabs, capable of real-time speech dialogue, objection handling, and booking meetings directly into Google Meet / Calendly.
  - **Meta Ads:** Automated ad copy and angle generation targeting identified business weaknesses.

---

## ⚙️ Complete Technology Stack (কী কী ব্যবহার করা হয়েছে)

The platform is designed with a modern, high-performance, asynchronous tech stack:

### 1. Frontend Client
| Technology | Version / Spec | Purpose & Responsibility |
| :--- | :--- | :--- |
| **Next.js** | 15.1+ (App Router) | High-performance React framework with server-side rendering, API route proxying, and standalone output. |
| **React** | 19.0+ | Reactive user interface with React Server Components, Client Components, and hooks. |
| **TypeScript** | 5.0+ | Strict end-to-end static typing across all UI components and API contracts. |
| **Tailwind CSS** | 3.4+ | Utility-first styling with sleek dark-mode aesthetics, custom gradients, and glassmorphic panels. |
| **Lucide React** | Latest | Modern SVG icon suite for high-density dashboard layouts. |
| **WebSockets** | Browser Native | Live log streaming, real-time pipeline status updates, and interactive audio waveform rendering. |
| **Web Speech API** | Browser Native | Client-side real-time speech recognition for interactive voice testing and live call simulator. |

### 2. Backend & Core Processing
| Technology | Version / Spec | Purpose & Responsibility |
| :--- | :--- | :--- |
| **Python** | 3.11+ | Core language for asynchronous business logic, scraping engines, and worker daemons. |
| **FastAPI** | 0.115+ | High-throughput async REST API framework with automatic OpenAPI documentation and dependency injection. |
| **Uvicorn** | 0.30+ | Asynchronous Server Gateway Interface (ASGI) running backend HTTP and WebSocket workers. |
| **SQLAlchemy** | 2.0+ (Asyncio) | Modern async Object Relational Mapper (ORM) using `asyncpg` for PostgreSQL connection pooling. |
| **Alembic** | 1.13+ | Database schema migrations, historical revision tracking, and automated schema upgrades. |
| **Pydantic** | v2.8+ | Fast data parsing, strict request/response validation, and environment configuration management. |
| **Passlib & Argon2** | Latest | State-of-the-art cryptographic password hashing for secure authentication. |
| **Python-Jose** | Latest | Stateless JWT (JSON Web Token) encoding, decoding, and bearer token authorization. |
| **HTTPX** | 0.27+ | High-performance async HTTP client used for external API interactions and webhooks. |

### 3. Data Storage & Caching Layer
| Technology | Version / Spec | Purpose & Responsibility |
| :--- | :--- | :--- |
| **PostgreSQL** | 16 | ACID-compliant relational database storing leads, visual evidence paths, campaigns, audit parameters, and team users. |
| **Redis** | 7.0+ | In-memory cache, task queue broker for background worker fleet, rate limiting, and Pub/Sub event bus. |
| **Persistent Storage**| Local / Volume | Storage system for immutable screenshot archives and audit media referenced by UUID hashes. |

### 4. Scraping, Intelligence & AI Services
| Technology | Role | Purpose & Responsibility |
| :--- | :--- | :--- |
| **OpenClaw Gateway** | Headless Crawler | Sandboxed Chromium engine executing JavaScript, rendering SPAs, taking screenshots, and extracting contact data. |
| **ElevenLabs API** | Text-to-Speech (TTS) | Ultra-realistic, low-latency voice synthesis supporting bilingual English and Bengali (`eleven_multilingual_v2`). |
| **Multi-Source Detector** | Dynamic Resolver | Multi-factor resolution combining international dialing codes, local area codes, addresses, domain TLDs, and live speech audio. |
| **Outbound SMTP** | Email Delivery | RFC 5322 multipart MIME builder with DKIM, SPF, DMARC alignment, and multi-inbox rotation. |
| **IMAP Sync** | Inbound Tracking | Background email synchronization polling client replies, threading conversations, and evaluating sentiment. |

---

## 🧠 Core Architecture & Engine Breakdown (কে কী কাজ করে)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MULTI-LEADGEN AI                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
          │
          ├── [1] DISCOVERY OPTIMIZER ─────> Dynamic Google Maps & Search Scraping
          │
          ├── [2] DEDUPLICATION ENGINE ────> Aggregator Blacklist & Levenshtein Matching
          │
          ├── [3] OPENCLAW CRAWLER ────────> Headless Chromium + Full-Page Screenshots
          │
          ├── [4] 135 PARAMETER ENGINE ────> Technical, SEO, Conversion & Trust Audit
          │
          ├── [5] QUALIFICATION SCORING ───> Weighted Mathematical Score & Tier Gates
          │
          ├── [6] COLD OUTREACH ENGINE ────> RFC 5322 Emails + Multi-Inbox Rotation
          │
          ├── [7] AI VOICE AGENT ──────────> ElevenLabs TTS + Dynamic Bilingual Dialogue
          │
          ├── [8] UNIFIED INBOX ───────────> IMAP Sync + Threading + Sentiment Analysis
          │
          ├── [9] META ADS GENERATOR ──────> Automated Ad Angles, Headlines & Copy
          │
          ├── [10] AUTOPILOT DAEMON ───────> Redis Task Queue & Continuous Orchestration
          │
          └── [11] GRANULAR RBAC ──────────> Role-Based Access Control & Team Permissions
```

---

### 1. Discovery Optimizer & Geo-Expansion Engine
- **Files:** `backend/app/engine/discovery_optimizer.py`, `backend/app/services/geo_expander.py`
- **What it does:**
  - Takes a target industry (e.g., "Real Estate", "Dental Clinic", "SaaS") and a target location without hardcoded city or country limits.
  - Queries Google Maps and search results to extract business names, physical addresses, review counts, average ratings, phone numbers, and operational status.
  - **Dynamic Multi-Zone Expansion:** If the initial search yields fewer leads than the campaign requirement (e.g., target: 200 leads), the engine automatically calculates surrounding neighborhoods, postal codes, and adjacent suburban sectors to expand discovery coverage continuously.

### 2. Multi-Factor Deduplication & Aggregator Filtering
- **Files:** `backend/app/engine/deduplication.py`
- **What it does:**
  - Prevents wasted resources by filtering out non-business directory domains (`yelp.com`, `clutch.co`, `yellowpages.com`, `daraz.com`, `bikroy.com`, etc.) using a 60+ aggregator blacklist.
  - **Canonical Domain Normalization:** Strips subdomains, URL protocols (`http/https`), ports, and path queries.
  - **Levenshtein Fuzzy Matching:** Normalizes business titles by stripping legal designations (`Ltd`, `Inc`, `Corp`, `LLC`, `Pvt`) and applies string similarity matching at a strict **90% threshold** to catch duplicates with minor naming variations.
  - **Phone Number Sanitization:** Extracts international dialing codes and compares the canonical **last 10 digits** across all existing database records.

### 3. Deep Web Scraping & Visual Evidence Engine (OpenClaw)
- **Files:** `backend/app/services/openclaw_client.py`, `backend/app/engine/evidence_engine.py`
- **What it does:**
  - Launches headless Chromium instances to execute full JavaScript single-page applications (React, Vue, WordPress, Next.js).
  - Captures full-page and above-the-fold viewport screenshots saved locally to persistent storage with immutable UUID hashes.
  - Scrapes official social media profiles (Facebook, Instagram, LinkedIn, X/Twitter, YouTube, TikTok).
  - Extracts direct contact emails and phone numbers from footers, headers, and `/contact`, `/about` subpages.

### 4. 135 Deterministic Parameters Audit Engine
- **Files:** `backend/app/engine/parameter_engine.py`, `backend/app/engine/seed_parameters.py`
- **What it does:**
  - Audits every prospective business across **135 deterministic, rule-based criteria** categorized into 6 core pillars:
    1. **Technical Performance & Mobile Friendliness:** Load speed, mobile viewport meta tags, SSL certificate validity, modern image compression (WebP/AVIF).
    2. **On-Page & Technical SEO:** Meta titles, description lengths, OpenGraph tags, canonical tags, H1-H3 hierarchy, schema.org structured data.
    3. **Social Presence & Engagement:** Verification of active social links, follower visibility, social proof badges.
    4. **Conversion Architecture:** Sticky header navigation, click-to-call phone buttons, contact inquiry forms, booking widgets.
    5. **Security & Trust Signals:** Privacy policy, terms of service, cookie consent banners, copyright year currency, customer testimonials.
    6. **Marketing & Analytics Footprint:** Meta Pixel presence, Google Analytics (GA4), Google Tag Manager, ad conversion tracking.

### 5. Mathematical Scoring & Tier Qualification Gates
- **Files:** `backend/app/engine/qualification_engine.py`, `backend/app/engine/fit_gate.py`
- **What it does:**
  - Calculates a normalized Lead Score ($0 - 100$) using the formula:
    $$\text{Score} = (0.25 \times EQ) + (0.20 \times PR) + (0.15 \times RR) + (0.15 \times RC) + (0.10 \times BI) + (0.15 \times SF)$$
    *(EQ = Evidence Quality, PR = Problem Relevance, RR = Problem Repetition, RC = Recency, BI = Business Impact, SF = Service Fit)*
  - **Tier Assignment:**
    - 🟢 **Strong Potential ($\ge 80$):** High-priority gaps detected, verified contact details, clear service fit.
    - 🟡 **Review Needed ($60 - 79$):** Actionable gaps found but requires manual human review or contact verification.
    - 🔴 **Rejected ($< 60$ or Gate Failure):** Inactive websites, aggregator domains, or lack of contact channels.

### 6. Deliverability-Engineered Cold Outreach Engine (RFC 5322)
- **Files:** `backend/app/engine/outreach_engine.py`, `backend/app/engine/dispatch_outreach.py`
- **What it does:**
  - Generates RFC 5322 standard MIME emails with cryptographic `Message-ID`, RFC 2822 `Date`, `In-Reply-To`, `References`, and `List-Unsubscribe` headers.
  - Sends dual-part emails (`multipart/alternative` with HTML + Plain Text) to maximize inbox placement across Gmail, Outlook, and corporate filters.
  - **Multi-Inbox Round-Robin Rotation:** Cycles outbound volume across multiple configured SMTP inboxes to stay under daily sending limits (e.g., 50 emails/day per inbox) and protect sender domain reputation.
  - **Automated 3-Step Follow-Up Cadence:**
    - *Step 1 (Day 0):* Initial pitch highlighting specific visual audit findings.
    - *Step 2 (Day 4):* Follow-up referencing the previous email with an action summary offer.
    - *Step 3 (Day 8):* Polite break-up email with permission to close file.
  - **Human Approval Mode:** Allows manual review, editing, approval, or rejection of outbound drafts from the UI before sending.

### 7. Bilingual AI Voice Agent & Dialogue Engine
- **Files:** `backend/app/services/voice_agent_service.py`, `backend/app/services/elevenlabs_service.py`, `backend/app/api/v1/voice_agent.py`, `frontend/src/app/voice-agent/page.tsx`
- **What it does:**
  - **Dynamic Multi-Source Language & Country Resolution:** Resolves country and spoken language (Bengali or English) by cross-referencing international dialing prefixes, regional landline area codes, physical addresses, domain TLDs, and live incoming speech acoustic cues.
  - **Natural Dialogue Turns:** Conducts realistic sales calls through 5 conversation states: *Initial Greeting ➔ Permission ➔ Specific Gap Pitch ➔ Objection Handling ➔ Meeting Booking*.
  - **Customizable Knowledge Base (KB):** Admin can customize company profile, services, objection rebuttals, qualifying questions, and FAQs directly from the dashboard without touching code.
  - **ElevenLabs Speech Synthesis:** Streams ultra-realistic, low-latency audio using the `eleven_multilingual_v2` model with configurable voice stability, similarity boost, and speed parameters.
  - **Call Queue Management:** Call queue table with optimistic one-click toggles, batch selection, audio controls, call recordings, and sentiment summaries.

### 8. Unified Conversation Inbox & IMAP Sync Engine
- **Files:** `backend/app/services/imap_sync_service.py`, `backend/app/api/v1/autopilot.py`, `frontend/src/app/inbox/page.tsx`
- **What it does:**
  - Continuously syncs replies from prospects via IMAP across all configured inboxes.
  - **Client-Grouped Threading:** Organizes messages into complete conversation threads grouped by company and contact person.
  - **Automated Sentiment Classification:** Labels incoming responses as `POSITIVE_INTEREST`, `MEETING_REQUESTED`, `INFORMATION_REQUESTED`, `NOT_INTERESTED`, or `UNSUBSCRIBE`.
  - Enables direct outbound replies from the unified dashboard using the authentic sender inbox.

### 9. Meta Ads Copywriting & Creative Generator
- **Files:** `backend/app/engine/meta_intelligence.py`, `frontend/src/lib/api/ads.ts`
- **What it does:**
  - Analyzes the specific technical and conversion gaps identified during the website audit.
  - Automatically drafts high-converting Facebook and Instagram ad copy, creative headlines, primary text angles, and call-to-action hooks tailored to the target prospect's industry.

### 10. Autopilot Continuous Daemon & Task Queue Fleet
- **Files:** `backend/app/engine/autopilot_runner.py`, `backend/app/workers/runner.py`, `backend/app/workers/tasks.py`
- **What it does:**
  - Runs a background scheduler that monitors target quotas and automatically triggers the end-to-end pipeline: Discovery ➔ Scraping ➔ Audit ➔ Qualification ➔ Outreach.
  - Uses Redis for task queueing with concurrency controls, worker isolation, and exponential backoff retry logic.

### 11. Granular RBAC Team Permissions Architecture
- **Files:** `backend/app/api/v1/auth.py`, `backend/app/models/user.py`, `frontend/src/components/AppShell.tsx`
- **What it does:**
  - Controls access across team members with granular permissions:
    - `can_view_inbox`: View conversation threads in the Unified Inbox.
    - `can_send_emails`: Dispatch manual emails and approve queue drafts.
    - `can_delete_inbox`: Delete or purge inbox conversation threads.
    - `can_edit_leads`: Modify lead details, status tiers, and tags.
    - `can_manage_campaigns`: Configure Autopilot parameters, Voice Agent, and Meta Ads.
    - `can_access_admin`: Manage team members and edit system settings.
  - Real-time client synchronization ensures permission updates take effect immediately without requiring re-login.

---

## 🔄 End-to-End Lead Lifecycle & State Transitions

```
[1. DISCOVERED]
       │
       ▼  (Worker dequeues task from Redis)
[2. RESEARCHING]  ─── Crawl Site, Extract Contacts, Capture Screenshots (OpenClaw)
       │
       ▼  (Audit 135 Deterministic Parameters)
[3. EVALUATING]   ─── Calculate Lead Score (0 - 100)
       │
   ┌───┴──────────────────────────────┐
   │ Score < 60 or Gate Failure       │ Score >= 60 & Passes Gates
   ▼                                  ▼
[DISQUALIFIED / REJECTED]       [4. QUALIFIED]
                                      │
                                      ▼  (Generate Personalized Pitch & Drafts)
                                [5. READY_FOR_OUTREACH]
                                      │
                                      ├── (Manual Approval Mode) ──> Human Reviews in UI
                                      │
                                      ▼  (Outreach Engine Live Dispatch)
                                [6. DISPATCHED / SENT]
                                      │
                                ┌─────┴──────────────────────┐
                                ▼                            ▼
                       [7. REPLIED / INBOX]         [NO RESPONSE (Follow-up)]
                                │                            │
                                ▼                            ▼
                       Categorize Sentiment:         Step 2 (Day 4)
                       - Positive / Meeting Booked   Step 3 (Day 8 Break-up)
                       - Information Requested
                       - Unsubscribe
```

---

## 📂 Exhaustive Project Directory Structure

```bash
multi-lead-gen/
├── backend/
│   ├── alembic/                    # Database migration environment
│   │   ├── versions/               # Historical schema migration revisions
│   │   └── env.py                  # Alembic runtime configuration
│   ├── app/
│   │   ├── api/                    # FastAPI REST & WebSocket Endpoints
│   │   │   └── v1/
│   │   │       ├── admin.py        # System administration & stats
│   │   │       ├── auth.py         # Authentication, team members & RBAC
│   │   │       ├── autopilot.py    # Autopilot cycles & Unified Inbox endpoints
│   │   │       ├── campaigns.py    # Campaign configuration & batch dispatch
│   │   │       ├── leads.py        # Lead filtering, editing & approval
│   │   │       ├── parameters.py   # Parameter definitions & pillar scores
│   │   │       ├── research.py     # Single domain research trigger
│   │   │       ├── voice_agent.py  # Voice Agent KB, queue, dialogue & TTS
│   │   │       └── ws.py           # Real-time WebSocket live log streaming
│   │   ├── core/                   # Application Core Configuration
│   │   │   ├── config.py           # Pydantic v2 application settings
│   │   │   ├── logging.py          # Structured production logger
│   │   │   └── security.py         # Password hashing & JWT token handling
│   │   ├── db/                     # Database Access Layer
│   │   │   ├── base.py             # Declarative SQLAlchemy base
│   │   │   └── session.py          # Async PostgreSQL session manager
│   │   ├── engine/                 # Core Intelligence & Business Logic Engines
│   │   │   ├── autopilot_runner.py # Background continuous scheduling runner
│   │   │   ├── deduplication.py    # Multi-factor domain & Levenshtein deduplication
│   │   │   ├── discovery_optimizer.py # Dynamic Google Maps & multi-zone expansion
│   │   │   ├── dispatch_outreach.py# Outbox dispatch executor
│   │   │   ├── email_verifier.py   # SMTP & MX record verifier
│   │   │   ├── evidence_engine.py  # Visual proof & DOM metric extraction
│   │   │   ├── fit_gate.py         # Qualification gatekeeper definitions
│   │   │   ├── meta_intelligence.py# Meta Ads copywriting generator
│   │   │   ├── outreach_engine.py  # RFC 5322 email builder, multi-inbox & SMTP
│   │   │   ├── parameter_engine.py # 135 Parameter evaluation interface
│   │   │   ├── qualification_engine.py # Mathematical scoring & tier assignment
│   │   │   ├── seed_parameters.py  # Definition & seeding of all 135 parameters
│   │   │   ├── service_matcher.py  # Service gap matching logic
│   │   │   └── strategy_engine.py  # Outreach strategy selector
│   │   ├── models/                 # SQLAlchemy ORM Database Schemas
│   │   │   ├── campaign.py         # Campaign target configurations
│   │   │   ├── evidence.py         # Screenshot paths & parameter findings
│   │   │   ├── lead.py             # Lead, company info, contact & status
│   │   │   ├── outreach_log.py     # Dispatched emails & conversation threads
│   │   │   ├── user.py             # User accounts & RBAC permissions
│   │   │   └── voice_agent.py      # Voice KB, call queue & call logs
│   │   ├── schemas/                # Pydantic Request & Response Models
│   │   │   ├── campaign.py         # Campaign schemas
│   │   │   ├── lead.py             # Lead schemas
│   │   │   ├── user.py             # User & RBAC schemas
│   │   │   └── voice_agent.py      # Voice agent & KB schemas
│   │   ├── services/               # External Integrations & Service Adapters
│   │   │   ├── ai_client.py        # LLM reasoning & message synthesis
│   │   │   ├── elevenlabs_service.py# ElevenLabs TTS streaming & voice models
│   │   │   ├── geo_expander.py     # Geographic radius expansion helper
│   │   │   ├── imap_sync_service.py# IMAP email synchronization
│   │   │   ├── meta_client.py      # Meta Marketing Graph API client
│   │   │   ├── openclaw_client.py  # Headless browser scraping client
│   │   │   └── voice_agent_service.py # Voice dialogue turns & language detector
│   │   ├── workers/                # Background Worker Fleet
│   │   │   ├── runner.py           # Task consumer daemon
│   │   │   └── tasks.py            # Async Redis job definitions
│   │   └── main.py                 # FastAPI Application Factory & Lifespan
│   ├── tests/                      # Pytest unit & integration test suite
│   ├── Dockerfile                  # Production Multi-Stage Backend Dockerfile
│   └── requirements.txt            # Python Dependencies
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js 15 App Router Pages
│   │   │   ├── admin/              # User management, RBAC & Voice KB setup
│   │   │   ├── autopilot/          # Continuous autopilot monitor & control
│   │   │   ├── campaigns/          # Campaign target manager
│   │   │   ├── inbox/              # Unified client-grouped conversation inbox
│   │   │   ├── leads/              # Lead explorer, evidence inspector & approval
│   │   │   ├── parameters/         # 135 Parameter inspection dashboard
│   │   │   ├── research/           # Single domain on-demand research
│   │   │   ├── voice-agent/        # Voice Agent Queue, Simulator & Analytics
│   │   │   ├── layout.tsx          # Root HTML layout & fonts
│   │   │   └── page.tsx            # Executive KPI Dashboard & live metrics
│   │   ├── components/             # Reusable UI Components
│   │   │   ├── AppShell.tsx        # Navigation sidebar & permission synchronizer
│   │   │   ├── LeadTable.tsx       # Paginated lead management table
│   │   │   └── EvidenceModal.tsx   # Visual screenshot & audit gap viewer
│   │   ├── hooks/                  # Custom React Hooks (WebSocket, Auth)
│   │   └── lib/                    # HTTP Client & API SDKs
│   │       ├── api.ts              # Core API client & endpoint helpers
│   │       └── api/                # Modular domain API handlers
│   ├── Dockerfile                  # Production Next.js Standalone Dockerfile
│   ├── package.json                # Frontend Node Dependencies
│   └── tsconfig.json               # TypeScript Configuration
├── infra/
│   ├── docker-compose.yml          # Local Dev Services (PostgreSQL 16 + Redis 7)
│   ├── init_db.sql                 # Initial SQL seed & extension script
│   └── scripts/
│       ├── start_all.sh            # One-click startup shell script
│       └── stop_all.sh             # Graceful shutdown script
├── storage/                        # Persistent local volume for screenshots & evidence
├── .env.example                    # Local environment variables template
├── .env.production.example         # Production environment variables template
├── docker-compose.prod.yml         # Production Multi-Container Orchestration Manifest
├── deploy.sh                       # Production initialization & deploy script
└── README.md                       # Comprehensive Technical Documentation
```

---

## 🚀 Local Development Setup Guide

### 1. Prerequisites
- **Node.js:** v18.0.0 or higher
- **Python:** v3.11 or higher
- **Docker Desktop:** Installed and running (for local PostgreSQL 16 & Redis 7)

### 2. Configure Environment
```bash
# Copy local environment variables template
cp .env.example .env
```
*Open `.env` and verify database credentials, OpenClaw gateway token, and optional SMTP / ElevenLabs API keys.*

### 3. Launch Local PostgreSQL & Redis
```bash
cd infra
docker compose up -d
cd ..
```

### 4. Setup Backend & Run Migrations
```bash
# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt

# Run database migrations
cd backend
alembic upgrade head
cd ..

# Start FastAPI Core Server (Port 8000)
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 5. Launch Background Worker Fleet (In a separate terminal)
```bash
source .venv/bin/activate
python3 -m backend.app.workers.runner
```

### 6. Setup & Launch Frontend Dashboard (In a separate terminal)
```bash
cd frontend
npm install
npm run dev
```
Navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

### 💡 One-Click Startup & Teardown
To start all services simultaneously in one command:
```bash
chmod +x ./infra/scripts/*.sh
./infra/scripts/start_all.sh
```
To cleanly stop all background processes anytime:
```bash
./infra/scripts/stop_all.sh
```

---

## 🚢 Production VPS Deployment Guide

The platform includes a production Docker Compose setup (`docker-compose.prod.yml`) that containerizes the backend, frontend, worker daemon, PostgreSQL database, and Redis cache.

### 1. Prepare Environment on VPS
```bash
# Copy production environment configuration
cp .env.production.example .env
nano .env
```

### 2. Build and Launch Containers
```bash
# Build images and start services in detached mode
docker compose -f docker-compose.prod.yml up -d --build

# Run database migrations inside the backend container
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### 3. Verify Health & Logs
```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# Follow live container logs
docker compose -f docker-compose.prod.yml logs -f backend
```

---

## 🔐 Complete Environment Variables Reference

| Variable | Description | Example / Default Value | Required? |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Operational environment mode | `development` / `production` | **Yes** |
| `LOG_LEVEL` | Logging verbosity | `INFO` / `DEBUG` | **Yes** |
| `SECRET_KEY` | Cryptographic secret for JWT authentication | `secure_random_hex_string_32_chars` | **Yes** |
| `DATABASE_URL` | Async PostgreSQL connection string | `postgresql+asyncpg://user:pw@127.0.0.1:5432/leadgen`| **Yes** |
| `REDIS_URL` | Redis instance connection string | `redis://127.0.0.1:6379/0` | **Yes** |
| `OPENCLAW_GATEWAY_URL` | OpenClaw Headless Crawler Gateway URL | `https://openclaw.yourdomain.com` | **Yes** |
| `OPENCLAW_GATEWAY_TOKEN` | OpenClaw authentication Bearer token | `secret_openclaw_token` | **Yes** |
| `OPENCLAW_WEBHOOK_TOKEN`| Webhook verification secret | `secret_webhook_token` | **Yes** |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for AI Voice Agent | `sk_...` | Optional |
| `ELEVENLABS_VOICE_ID` | Default ElevenLabs Voice ID | `21m00Tcm4TlvDq8ikWAM` | Optional |
| `WORKER_CONCURRENCY` | Concurrent research worker threads | `2` | **Yes** |
| `RESEARCH_TIMEOUT_SECONDS`| Crawl timeout per target (seconds) | `120` | **Yes** |
| `SMTP_HOST` | Outbound SMTP server hostname | `smtp.gmail.com` | Optional (Dry-run mode if empty) |
| `SMTP_PORT` | Outbound SMTP server port | `587` (TLS) or `465` (SSL) | Optional |
| `SMTP_USER` | Authenticated SMTP username / email | `outreach@yourdomain.com` | Optional |
| `SMTP_PASSWORD` | SMTP password / App Password | `app_password_here` | Optional |
| `SMTP_FROM_EMAIL` | Sender email address (Must align with SMTP)| `outreach@yourdomain.com` | Optional |
| `SMTP_FROM_NAME` | Sender display name | `Growth Partnership Team` | Optional |
| `NEXT_PUBLIC_API_URL` | Backend API base URL for frontend client | `http://127.0.0.1:8000/api/v1` | **Yes** |
| `META_ACCESS_TOKEN` | Meta Marketing Graph API Access Token | `EAAG...` | Optional |

---

## 🌐 API Endpoints & WebSocket Architecture

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Authenticate user & issue JWT bearer token. |
| `GET` | `/api/v1/auth/users` | List team members and inspect granular permissions. |
| `PATCH`| `/api/v1/auth/users/{id}/permissions` | Update granular RBAC permissions (`can_view_inbox`, `can_send_emails`, etc.). |
| `GET` | `/api/v1/leads/` | Fetch paginated leads with tier filters, scoring, and search. |
| `PATCH`| `/api/v1/leads/{id}` | Edit lead contact details, status, or manual approval. |
| `GET` | `/api/v1/leads/{id}/evidence` | Retrieve visual screenshot proof and 135 parameter findings. |
| `POST` | `/api/v1/autopilot/start` | Trigger continuous discovery and qualification loop. |
| `GET` | `/api/v1/autopilot/inbox` | Retrieve client-grouped conversation threads and timeline. |
| `POST` | `/api/v1/autopilot/inbox/reply` | Send outbound email response to prospect thread. |
| `GET` | `/api/v1/voice-agent/kb` | Fetch Voice Agent Knowledge Base, persona, and objection rules. |
| `PUT` | `/api/v1/voice-agent/kb` | Update Voice Agent Knowledge Base and scripts. |
| `GET` | `/api/v1/voice-agent/queue` | Retrieve Voice Agent call queue leads. |
| `POST` | `/api/v1/voice-agent/dialogue` | Process real-time dialogue turn and synthesize AI speech response. |
| `POST` | `/api/v1/voice-agent/tts` | Stream synthesized audio speech from ElevenLabs. |
| `WS` | `/api/v1/ws/logs` | Real-time WebSocket live worker and pipeline logs. |

---

## 📜 License
Distributed under the **MIT License**. See `LICENSE` for details.
