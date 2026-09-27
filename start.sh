#!/usr/bin/env bash
# Root entrypoint shortcut to launch all services (Frontend, Backend, OpenClaw, Worker)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$PROJECT_DIR/infra/scripts/start_all.sh" "$@"
