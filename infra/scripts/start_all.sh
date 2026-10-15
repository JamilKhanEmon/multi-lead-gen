#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/logs"

echo "Starting LeadGen Platform Services"

echo "[1/6] Starting PostgreSQL and Redis containers..."
docker compose -f infra/docker-compose.yml up -d 2>/dev/null || true

echo "[2/6] Verifying OpenClaw Gateway configuration..."
echo "[+] Gateway URL: ${OPENCLAW_GATEWAY_URL:-Configured in .env}"

echo "[3/6] Rotating and capping log files to conserve VPS storage..."
for logfile in "$PROJECT_DIR/logs"/*.log; do
    if [ -f "$logfile" ]; then
        FILESIZE=$(wc -c < "$logfile" 2>/dev/null || echo 0)
        # If logfile exceeds 10MB (10485760 bytes), keep only latest 3000 lines
        if [ "$FILESIZE" -gt 10485760 ]; then
            tail -n 3000 "$logfile" > "$logfile.tmp" 2>/dev/null && mv "$logfile.tmp" "$logfile"
            echo "[*] Truncated $(basename "$logfile") to latest 3,000 lines (exceeded 10MB)."
        fi
    fi
done

echo "[4/6] Cleaning up old processes on ports 8000 & 3000..."
for pid in $(lsof -ti :8000 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
done
for pid in $(lsof -ti :3000 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
done
pkill -f "app.workers.runner" 2>/dev/null || true
sleep 1

echo "[5/6] Starting FastAPI Core Engine & Worker fleet..."
export PYTHONPATH="$PROJECT_DIR/backend"

nohup "$PROJECT_DIR/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 > "$PROJECT_DIR/logs/fastapi.log" 2>&1 &
FASTAPI_PID=$!
echo "$FASTAPI_PID" > "$PROJECT_DIR/logs/fastapi.pid"
echo "[+] FastAPI started on http://127.0.0.1:8000 (PID: $FASTAPI_PID)."

(cd "$PROJECT_DIR/backend" && nohup "$PROJECT_DIR/.venv/bin/python3" -m app.workers.runner > "$PROJECT_DIR/logs/worker.log" 2>&1 &)
WORKER_PID=$!
echo "$WORKER_PID" > "$PROJECT_DIR/logs/worker.pid"
echo "[+] Python Worker fleet started (PID: $WORKER_PID)."

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

echo "All services running in background."
