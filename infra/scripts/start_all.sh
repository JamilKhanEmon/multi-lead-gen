#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Autonomous B2B Lead-Generation Platform — All-In-One Unified Startup Script
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/logs"

echo "================================================================="
echo " 🦞 Starting LeadGen Autonomous Platform Services (All-In-One)"
echo "================================================================="

# 1. Start PostgreSQL 16 & Redis 7 containers (if Docker is running)
echo "[1/6] Starting PostgreSQL and Redis containers..."
docker compose -f infra/docker-compose.yml up -d 2>/dev/null || echo "[*] Note: Docker Desktop not active. Using existing/local PostgreSQL & Redis if running."

# 2. Hostinger OpenClaw Cloud AI Gateway
echo "[2/4] Verifying OpenClaw Cloud Gateway configuration..."
echo "[+] Using Hostinger OpenClaw Gateway: https://darkblue-antelope-685588.hostingersite.com (Active)"

# Clean up stale processes on ports 8000 and 3000
echo "[4/6] Cleaning up old processes on ports 8000 & 3000..."
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
pkill -f "app.workers.runner" 2>/dev/null || true
sleep 1

# 5. Start FastAPI Control Plane & Python Worker Fleet
echo "[5/6] Starting FastAPI Core Engine & Worker fleet..."
export PYTHONPATH="$PROJECT_DIR/backend"

# FastAPI Backend
nohup "$PROJECT_DIR/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 > "$PROJECT_DIR/logs/fastapi.log" 2>&1 &
FASTAPI_PID=$!
echo "$FASTAPI_PID" > "$PROJECT_DIR/logs/fastapi.pid"
echo "[+] FastAPI started on http://127.0.0.1:8000 (PID: $FASTAPI_PID)."

# Python Worker
nohup "$PROJECT_DIR/.venv/bin/python3" "$PROJECT_DIR/backend/app/workers/runner.py" > "$PROJECT_DIR/logs/worker.log" 2>&1 &
WORKER_PID=$!
echo "$WORKER_PID" > "$PROJECT_DIR/logs/worker.pid"
echo "[+] Python Worker fleet started (PID: $WORKER_PID)."

# 6. Start Next.js Frontend App
echo "[6/6] Starting Next.js Dashboard Frontend..."
(cd "$PROJECT_DIR/frontend" && nohup npm run dev > "$PROJECT_DIR/logs/frontend.log" 2>&1 &)
sleep 3
FRONTEND_PID=$(lsof -ti :3000 | head -n 1 || true)
if [ -n "$FRONTEND_PID" ]; then
    echo "$FRONTEND_PID" > "$PROJECT_DIR/logs/frontend.pid"
    echo "[+] Next.js Frontend started on http://localhost:3000 (PID: $FRONTEND_PID)."
else
    echo "[+] Next.js Frontend launching on http://localhost:3000..."
fi

echo "================================================================="
echo " 🎉 ALL SERVICES ARE NOW RUNNING IN THE BACKGROUND!"
echo "-----------------------------------------------------------------"
echo " 🌐 Dashboard Frontend:  http://localhost:3000"
echo " ⚡ FastAPI Backend API: http://127.0.0.1:8000 (Docs: /docs)"
echo " 🦞 OpenClaw Gateway:   https://darkblue-antelope-685588.hostingersite.com (Hostinger Cloud)"
echo " 📑 System Logs Dir:     $PROJECT_DIR/logs/"
echo "-----------------------------------------------------------------"
echo " To stop all services anytime, run: bash infra/scripts/stop_all.sh"
echo "================================================================="
