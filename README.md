# Autonomous B2B Lead-Generation Platform (Local-First)

An enterprise-grade, local-first autonomous intelligence platform designed to discover, research, corroborate, and qualify genuine B2B leads backed by verifiable, public evidence.

---

## 🏗️ System Architecture

```
[Next.js Dashboard] (Port 3000)
       ↕ REST / WebSocket
[FastAPI Core Engine] (Port 8000)
       ↕ Redis (Queue: leadgen:tasks / PubSub)
[Python Worker Fleet]
   ├── [OpenClaw Gateway] (127.0.0.1:18789 - LaunchAgent)
   │     └── Sandboxed Managed Browser (Public Web Research)
   ├── [Ollama Runtime] (127.0.0.1:11434 - gemma3:4b multimodal)
   ├── [Deterministic Rule & Parameter Engine] (135 Parameters)
   └── [PostgreSQL 16] (127.0.0.1:5432 - Immutable Evidence & Snapshots)
```

---

## 🚀 Quickstart & Setup (Phase 1)

### 1. Prerequisites
- **macOS** (Optimized for Apple Silicon / 16 GB Unified Memory)
- **Docker Desktop** (Running for PostgreSQL 16 & Redis 7)
- **Ollama** installed natively (`curl -fsSL https://ollama.com/install.sh | sh`)
- **OpenClaw** installed natively (`curl -fsSL https://openclaw.ai/install.sh | bash`)

### 2. Start PostgreSQL & Redis
```bash
cd infra
docker compose up -d
```
*Note: Ports are bound strictly to `127.0.0.1` (`5432` for Postgres, `6379` for Redis) for local security.*

### 3. Setup OpenClaw Local Gateway
Run the automated setup script to configure `~/.openclaw/openclaw.json` (loopback, authentication, tool sandbox) and register the native LaunchAgent:
```bash
./infra/scripts/setup_openclaw.sh
```

### 4. Setup Ollama Model
```bash
ollama serve &
ollama pull gemma3:4b
```

### 5. Verify Infrastructure
Run the automated Phase 1 verification script:
```bash
python3 infra/scripts/verify_phase1.py
```

---

## 🔒 Security Principles
- **Loopback-First:** All service interfaces bind strictly to `127.0.0.1`.
- **Zero Browser Bleed:** The research agent executes in an isolated Chromium sandbox with zero access to personal Chrome sessions, cookies, or credentials.
- **Untrusted Input Defense:** Web content is treated strictly as passive data and delimited to prevent prompt injection.
- **Dedicated Tokens:** Gateway token and automation webhook tokens are managed independently.
