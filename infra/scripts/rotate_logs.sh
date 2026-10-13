#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# LeadGen Platform - Automated VPS Log Rotation & Storage Optimization Script
# Capping log sizes to prevent VPS disk exhaustion.
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAX_BYTES=10485760  # 10 MB cap per log file
KEEP_LINES=3000

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting VPS Log & Storage Maintenance..."

# 1. Truncate application log files in logs/
if [ -d "$PROJECT_DIR/logs" ]; then
    for logfile in "$PROJECT_DIR/logs"/*.log; do
        if [ -f "$logfile" ]; then
            FILESIZE=$(wc -c < "$logfile" 2>/dev/null || echo 0)
            if [ "$FILESIZE" -gt "$MAX_BYTES" ]; then
                tail -n "$KEEP_LINES" "$logfile" > "$logfile.tmp" 2>/dev/null && mv "$logfile.tmp" "$logfile"
                echo "  [✓] Truncated $(basename "$logfile") from $((FILESIZE / 1024 / 1024))MB to latest $KEEP_LINES lines."
            fi
        fi
    done
fi

# 2. Clean scratch temporary files older than 3 days
if [ -d "$PROJECT_DIR/storage/scratch" ]; then
    find "$PROJECT_DIR/storage/scratch" -type f -mtime +3 -delete 2>/dev/null || true
fi

# 3. Truncate Docker container logs if docker is running
if command -v docker >/dev/null 2>&1; then
    CONTAINER_LOGS=$(find /var/lib/docker/containers/ -name "*-json.log" 2>/dev/null || true)
    for dlog in $CONTAINER_LOGS; do
        if [ -f "$dlog" ]; then
            DSIZE=$(wc -c < "$dlog" 2>/dev/null || echo 0)
            if [ "$DSIZE" -gt "$MAX_BYTES" ]; then
                truncate -s 5M "$dlog" 2>/dev/null || true
                echo "  [✓] Truncated Docker container log $(basename "$dlog")."
            fi
        fi
    done
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Maintenance complete. Disk storage preserved."
