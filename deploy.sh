#!/usr/bin/env bash
set -euo pipefail

echo "Multi-Lead-Gen Production Deployment"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if [ ! -f "$PROJECT_DIR/.env" ]; then
    if [ -f "$PROJECT_DIR/.env.production.example" ]; then
        echo "[!] .env not found. Creating from .env.production.example..."
        cp "$PROJECT_DIR/.env.production.example" "$PROJECT_DIR/.env"
        echo "[!] Please review and edit $PROJECT_DIR/.env with your real credentials before proceeding."
    else
        echo "[ERROR] Neither .env nor .env.production.example was found!"
        exit 1
    fi
fi

if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed. Please install Docker first: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

echo "[1/3] Pulling latest production images..."
docker compose -f docker-compose.prod.yml pull

echo "[2/3] Starting services via docker-compose.prod.yml..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "[3/3] Pruning unused Docker images..."
docker image prune -f

echo "================================================================="
echo " 🎉 All production services are running!"
echo "-----------------------------------------------------------------"
echo " Frontend Dashboard:  http://<YOUR_VPS_IP>:3000"
echo " Backend REST API:    http://<YOUR_VPS_IP>:8000 (Docs: /docs)"
echo " Check logs anytime:  docker compose -f docker-compose.prod.yml logs -f"
echo "================================================================="
