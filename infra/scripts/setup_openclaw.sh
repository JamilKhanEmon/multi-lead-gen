#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "Setting up OpenClaw Local Gateway for LeadGen Platform"

if ! command -v openclaw &> /dev/null; then
    echo "[!] OpenClaw CLI not found. Installing via official installer..."
    curl -fsSL https://openclaw.ai/install.sh | bash
    if [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc" || true
    elif [ -f "$HOME/.bash_profile" ]; then
        source "$HOME/.bash_profile" || true
    fi
fi

if ! command -v openclaw &> /dev/null; then
    echo "[-] Error: 'openclaw' command still not found in PATH."
    echo "    Please verify /usr/local/bin or /opt/homebrew/bin is in your PATH."
    exit 1
fi

echo "[+] OpenClaw CLI detected: $(openclaw --version || echo 'Installed')"

OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
mkdir -p "$OPENCLAW_DIR"

GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-oc_dev_gateway_token_change_me_super_secure}"

echo "[*] Writing secured OpenClaw configuration to $OPENCLAW_CONFIG..."
cat <<EOF > "$OPENCLAW_CONFIG"
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "127.0.0.1",
    "auth": {
      "mode": "token",
      "token": "$GATEWAY_TOKEN"
    }
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "workspaceAccess": "none",
        "allowHostControl": false,
        "docker": {
          "network": "none"
        }
      }
    }
  }
}
EOF

chmod 600 "$OPENCLAW_CONFIG"
echo "[+] Secured configuration file written (mode 0600)."

echo "[*] Installing OpenClaw LaunchAgent service (ai.openclaw.gateway)..."
openclaw gateway install || echo "[!] Notice: Gateway service already installed or updated."

echo "[*] Checking OpenClaw Gateway service status..."
openclaw gateway status || true

echo "OpenClaw Gateway Setup Completed Successfully"
echo "Target: ws://127.0.0.1:18789 (Protocol 4)"
