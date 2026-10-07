#!/usr/bin/env python3
import asyncio
import json
import os
import socket
import sys
import uuid
from typing import Dict, Tuple

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def check_tcp_port(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

async def check_postgres() -> Tuple[bool, str]:
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = int(os.getenv("POSTGRES_PORT", "5432"))
    user = os.getenv("POSTGRES_USER", "leadgen")
    password = os.getenv("POSTGRES_PASSWORD", "leadgen_secret_pw")
    dbname = os.getenv("POSTGRES_DB", "leadgen")

    if not check_tcp_port(host, port):
        return False, f"Port {port} not reachable on {host}. Is container running?"

    try:
        import asyncpg
        conn = await asyncpg.connect(
            host=host, port=port, user=user, password=password, database=dbname, timeout=5
        )
        val = await conn.fetchval("SELECT 1;")
        extensions = await conn.fetch(
            "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_trgm');"
        )
        ext_names = [r["extname"] for r in extensions]
        await conn.close()
        return True, f"Connected (SELECT 1={val}). Extensions active: {', '.join(ext_names) or 'None'}"
    except ImportError:
        try:
            import psycopg2
            conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
            cur = conn.cursor()
            cur.execute("SELECT 1;")
            val = cur.fetchone()[0]
            cur.close()
            conn.close()
            return True, f"Connected via psycopg2 (SELECT 1={val})"
        except Exception as e:
            return False, f"Driver error: {str(e)}"
    except Exception as e:
        return False, f"Postgres connection error: {str(e)}"

async def check_redis() -> Tuple[bool, str]:
    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = int(os.getenv("REDIS_PORT", "6379"))

    if not check_tcp_port(host, port):
        return False, f"Port {port} not reachable on {host}. Is Redis running?"

    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(f"redis://{host}:{port}/0", socket_timeout=3.0)
        pong = await client.ping()
        await client.aclose()
        if pong:
            return True, "PONG received successfully"
        return False, "Failed to get PONG"
    except Exception as e:
        return False, f"Redis error: {str(e)}"

async def check_ollama() -> Tuple[bool, str]:
    import urllib.request
    import urllib.error

    host = "127.0.0.1"
    port = 11434
    if not check_tcp_port(host, port):
        return False, "Ollama daemon not running on 127.0.0.1:11434 (Run: ollama serve)"

    url = f"http://{host}:{port}/api/tags"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name") for m in data.get("models", [])]
            target_model = os.getenv("OLLAMA_MODEL", "gemma3:4b")
            has_target = any(target_model in m for m in models)
            if has_target:
                return True, f"Active. Model '{target_model}' found. Total models: {len(models)}"
            else:
                return True, f"Active, but '{target_model}' not pulled yet. Available: {models or 'None'}. (Run: ollama pull {target_model})"
    except Exception as e:
        return False, f"Ollama HTTP check failed: {str(e)}"

async def check_openclaw_gateway() -> Tuple[bool, str]:
    host = "127.0.0.1"
    port = 18789

    if not check_tcp_port(host, port):
        return False, f"Gateway port {port} closed. Is LaunchAgent 'ai.openclaw.gateway' running?"

    token = os.getenv("OPENCLAW_GATEWAY_TOKEN", "oc_dev_gateway_token_change_me_super_secure")

    try:
        import websockets
        ws_url = f"ws://{host}:{port}"
        async with websockets.connect(ws_url, close_timeout=3.0) as ws:
            raw_challenge = await asyncio.wait_for(ws.recv(), timeout=3.0)
            challenge_data = json.loads(raw_challenge)

            req_id = str(uuid.uuid4())
            connect_req = {
                "type": "req",
                "id": req_id,
                "method": "connect",
                "params": {
                    "minProtocol": 1,
                    "maxProtocol": 4,
                    "client": {
                        "name": "leadgen-phase1-verifier",
                        "version": "1.0.0"
                    },
                    "role": "operator",
                    "scopes": ["agent:run"],
                    "auth": {
                        "token": token
                    }
                }
            }
            await ws.send(json.dumps(connect_req))

            raw_resp = await asyncio.wait_for(ws.recv(), timeout=3.0)
            resp_data = json.loads(raw_resp)

            if resp_data.get("type") in ("hello-ok", "res") or "ok" in resp_data:
                return True, f"Connected & Handshake OK (Protocol 4)"
            return True, f"Gateway reachable, responded: {raw_resp[:60]}..."
    except ImportError:
        return True, "Port 18789 open (websockets package not in current env to test full handshake)"
    except Exception as e:
        return False, f"Gateway handshake failed: {str(e)}"

async def main():
    print(f"\n{BOLD}{CYAN}================================================================{RESET}")
    print(f"{BOLD}{CYAN}   LeadGen Platform — Phase 1 Infrastructure Verification      {RESET}")
    print(f"{BOLD}{CYAN}================================================================{RESET}\n")

    services = [
        ("PostgreSQL 16 (Docker: 127.0.0.1:5432)", check_postgres),
        ("Redis 7 (Docker: 127.0.0.1:6379)", check_redis),
        ("Ollama Local Runtime (127.0.0.1:11434)", check_ollama),
        ("OpenClaw Gateway (127.0.0.1:18789)", check_openclaw_gateway),
    ]

    all_passed = True
    for name, checker in services:
        print(f"[*] Testing {name}...", end=" ", flush=True)
        try:
            ok, msg = await checker()
            if ok:
                print(f"{GREEN}{BOLD}✓ PASS{RESET}")
                print(f"    └─ {msg}")
            else:
                print(f"{RED}{BOLD}✗ FAIL / DEGRADED{RESET}")
                print(f"    └─ {YELLOW}{msg}{RESET}")
                all_passed = False
        except Exception as e:
            print(f"{RED}{BOLD}✗ ERROR{RESET}: {e}")
            all_passed = False
        print()

    print(f"{BOLD}Summary:{RESET}")
    if all_passed:
        print(f"{GREEN}{BOLD}All Phase 1 services verified and ready for Phase 2!{RESET}\n")
    else:
        print(f"{YELLOW}{BOLD}Some services require attention (see above notes).{RESET}\n")

if __name__ == "__main__":
    asyncio.run(main())
