#!/usr/bin/env bash
set -euo pipefail

echo "Stopping LeadGen Platform Services"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for pidfile in "$PROJECT_DIR/logs/frontend.pid"; do
    if [ -f "$pidfile" ]; then
        FRONTEND_PID=$(cat "$pidfile")
        echo "[*] Stopping Next.js Frontend (PID: $FRONTEND_PID)..."
        kill -9 "$FRONTEND_PID" 2>/dev/null || true
        rm -f "$pidfile"
    fi
done
for pid in $(lsof -ti :3000 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
done

for pidfile in "$PROJECT_DIR/logs/worker.pid" /tmp/leadgen_worker.pid; do
    if [ -f "$pidfile" ]; then
        WORKER_PID=$(cat "$pidfile")
        echo "[*] Stopping Python Worker (PID: $WORKER_PID)..."
        kill -TERM "$WORKER_PID" 2>/dev/null || true
        rm -f "$pidfile"
    fi
done
pkill -f "app.workers.runner" 2>/dev/null || true

for pidfile in "$PROJECT_DIR/logs/fastapi.pid" /tmp/leadgen_fastapi.pid; do
    if [ -f "$pidfile" ]; then
        FASTAPI_PID=$(cat "$pidfile")
        echo "[*] Stopping FastAPI Core Engine (PID: $FASTAPI_PID)..."
        kill -TERM "$FASTAPI_PID" 2>/dev/null || true
        rm -f "$pidfile"
    fi
done
lsof -ti :8000 | xargs kill -9 2>/dev/null || true

pkill -f "openclaw gateway" 2>/dev/null || true

read -p "Do you want to stop PostgreSQL and Redis containers as well? (y/N): " -n 1 -r || true
echo
if [[ ${REPLY:-} =~ ^[Yy]$ ]]; then
    echo "[*] Stopping Docker containers..."
    docker compose -f infra/docker-compose.yml down
fi

# Clean up any remaining pid files including macOS duplicates
rm -f "$PROJECT_DIR/logs"/*.pid "$PROJECT_DIR/logs"/*\ *.pid 2>/dev/null || true

echo "[+] All LeadGen services stopped cleanly."
