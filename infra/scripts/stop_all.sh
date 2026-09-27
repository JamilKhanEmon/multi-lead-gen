#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Autonomous B2B Lead-Generation Platform — Local Multi-Service Shutdown Script
# ==============================================================================

echo "================================================================="
echo " Stopping LeadGen Autonomous Platform Services"
echo "================================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 1. Stop Frontend (Next.js)
for pidfile in "$PROJECT_DIR/logs/frontend.pid"; do
    if [ -f "$pidfile" ]; then
        FRONTEND_PID=$(cat "$pidfile")
        echo "[*] Stopping Next.js Frontend (PID: $FRONTEND_PID)..."
        kill -9 "$FRONTEND_PID" 2>/dev/null || true
        rm -f "$pidfile"
    fi
done
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# 2. Stop Worker
for pidfile in "$PROJECT_DIR/logs/worker.pid" /tmp/leadgen_worker.pid; do
    if [ -f "$pidfile" ]; then
        WORKER_PID=$(cat "$pidfile")
        echo "[*] Stopping Python Worker (PID: $WORKER_PID)..."
        kill -TERM "$WORKER_PID" 2>/dev/null || true
        rm -f "$pidfile"
    fi
done
pkill -f "app.workers.runner" 2>/dev/null || true

# 3. Stop FastAPI
for pidfile in "$PROJECT_DIR/logs/fastapi.pid" /tmp/leadgen_fastapi.pid; do
    if [ -f "$pidfile" ]; then
        FASTAPI_PID=$(cat "$pidfile")
        echo "[*] Stopping FastAPI Core Engine (PID: $FASTAPI_PID)..."
        kill -TERM "$FASTAPI_PID" 2>/dev/null || true
        rm -f "$pidfile"
    fi
done
lsof -ti :8000 | xargs kill -9 2>/dev/null || true

# 4. Stop OpenClaw Gateway (Optional background process)
pkill -f "openclaw gateway" 2>/dev/null || true

# 5. Stop Docker Containers (Optional)
read -p "Do you want to stop PostgreSQL and Redis containers as well? (y/N): " -n 1 -r || true
echo
if [[ ${REPLY:-} =~ ^[Yy]$ ]]; then
    echo "[*] Stopping Docker containers..."
    docker compose -f infra/docker-compose.yml down
fi

echo "[+] All LeadGen services stopped cleanly."
