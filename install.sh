#!/bin/bash
# =============================================================================
# 2 Do Better — Installer (macOS + Linux)
# =============================================================================
# Installs the app, sets up the database, builds for production,
# registers the background service, and (macOS only) creates a launcher.
#
# Usage: bash install.sh
# =============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="$HOME/2DoBetter"
NODE_MIN_VERSION=18

# ── Detect OS ─────────────────────────────────────────────────────────────────
IS_MACOS=false
IS_LINUX=false
if [[ "$OSTYPE" == "darwin"* ]]; then
  IS_MACOS=true
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  IS_LINUX=true
else
  echo -e "  ${RED}✗ Unsupported OS: $OSTYPE${NC}"
  exit 1
fi

echo ""
echo -e "${CYAN}  2 Do Better — Installer${NC}"
echo "  ─────────────────────────────────"
echo ""

# ── 1. Check Node.js ────────────────────────────────────────────────────────
echo -e "  ${YELLOW}Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}✗ Node.js not found.${NC}"
  echo "    Install Node.js $NODE_MIN_VERSION+ (via nvm recommended) and re-run this script."
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(parseInt(process.versions.node))")
if [ "$NODE_MAJOR" -lt "$NODE_MIN_VERSION" ]; then
  echo -e "  ${RED}✗ Node.js $NODE_MAJOR found, but $NODE_MIN_VERSION+ required.${NC}"
  echo "    Upgrade Node.js and re-run."
  exit 1
fi
echo -e "  ${GREEN}✓ Node.js $(node -v) found${NC}"

# ── 2. Install to ~/2DoBetter ────────────────────────────────────────────────
echo -e "  ${YELLOW}Installing to $APP_DIR...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
    --exclude='prisma/dev.db' --exclude='mcp/dist' --exclude='.env' \
    "$SCRIPT_DIR/" "$APP_DIR/"
fi
echo -e "  ${GREEN}✓ Files in place${NC}"

# ── 3. Make scripts executable ───────────────────────────────────────────────
chmod +x "$APP_DIR/start-service.sh"

# ── 4. Install dependencies ──────────────────────────────────────────────────
echo -e "  ${YELLOW}Installing dependencies...${NC}"
(cd "$APP_DIR" && npm install --silent)
echo -e "  ${GREEN}✓ Dependencies installed${NC}"

# ── 5. Set up database ───────────────────────────────────────────────────────
echo -e "  ${YELLOW}Setting up database...${NC}"
(cd "$APP_DIR" && npx prisma migrate deploy --schema=prisma/schema.prisma 2>&1 | grep -v "^warn\|^┌\|^│\|^└\|Update")
echo -e "  ${GREEN}✓ Database ready${NC}"

# ── 6a. Generate auth token ────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ] || ! grep -q "AUTH_TOKEN" "$APP_DIR/.env" 2>/dev/null; then
  echo -e "  ${YELLOW}Generating access token...${NC}"
  TOKEN=$(openssl rand -hex 32)
  echo "AUTH_TOKEN=$TOKEN" >> "$APP_DIR/.env"
  echo -e "  ${GREEN}✓ Access token generated${NC}"
else
  TOKEN=$(grep AUTH_TOKEN "$APP_DIR/.env" | cut -d= -f2)
  echo -e "  ${GREEN}✓ Access token already exists${NC}"
fi

# ── 6b. Generate TLS certificates ─────────────────────────────────────────────
if [ ! -f "$APP_DIR/certs/server.crt" ]; then
  echo -e "  ${YELLOW}Generating TLS certificates...${NC}"
  bash "$APP_DIR/generate-certs.sh"
else
  echo -e "  ${GREEN}✓ TLS certificates already exist${NC}"
fi

# ── 7. Build for production ──────────────────────────────────────────────────
echo -e "  ${YELLOW}Building app (this takes ~30 seconds)...${NC}"
(cd "$APP_DIR" && npm run build 2>&1 | grep -E "✓|Error|error" | head -5)
echo -e "  ${GREEN}✓ Production build complete${NC}"

# ── 8. Register background service ───────────────────────────────────────────
echo -e "  ${YELLOW}Registering background service...${NC}"

if $IS_MACOS; then
  # ── macOS: launchd ──────────────────────────────────────────────────────────
  PLIST_LABEL="com.luchegames.2dobetter"
  PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
  LOG_DIR="$HOME/Library/Logs"
  NODE_PATH=$(command -v node)

  launchctl unload "$PLIST_PATH" 2>/dev/null || true

  cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$APP_DIR/start-service.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$APP_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/2dobetter.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/2dobetter-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "$NODE_PATH"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
PLIST

  launchctl load "$PLIST_PATH"
  echo -e "  ${GREEN}✓ launchd service registered (starts on login)${NC}"

  # ── 9. Create .app launcher (macOS only) ─────────────────────────────────────
  echo -e "  ${YELLOW}Creating 2DoBetter.app launcher...${NC}"
  APPLESCRIPT_TMP=$(mktemp /tmp/2dobetter_XXXXXX.applescript)
  cat > "$APPLESCRIPT_TMP" << 'APPL'
set serverURL to "https://localhost:3000"
set plistPath to (POSIX path of (path to home folder)) & "Library/LaunchAgents/com.luchegames.2dobetter.plist"

try
  do shell script "curl -sk -o /dev/null -w '%{http_code}' https://localhost:3000/ --max-time 2"
  set httpCode to result
on error
  set httpCode to "000"
end try

if httpCode is not "200" and httpCode is not "307" then
  try
    do shell script "launchctl load " & quoted form of plistPath & " 2>/dev/null; true"
  end try
  set attempts to 0
  repeat
    delay 1
    set attempts to attempts + 1
    try
      do shell script "curl -sk -o /dev/null -w '%{http_code}' https://localhost:3000/ --max-time 1"
      if result is "200" or result is "307" then exit repeat
    end try
    if attempts > 8 then
      display alert "2 Do Better" message "Server could not start. Check ~/Library/Logs/2dobetter-error.log" as critical
      return
    end if
  end repeat
end if

open location serverURL
APPL

  osacompile -o "/Applications/2DoBetter.app" "$APPLESCRIPT_TMP"
  rm "$APPLESCRIPT_TMP"
  echo -e "  ${GREEN}✓ 2DoBetter.app created in /Applications${NC}"

elif $IS_LINUX; then
  # ── Linux: systemd user service ─────────────────────────────────────────────
  # User-level service: no sudo required, auto-starts at boot via loginctl linger.
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  SERVICE_FILE="$SYSTEMD_DIR/2dobetter.service"

  mkdir -p "$SYSTEMD_DIR"
  systemctl --user stop 2dobetter 2>/dev/null || true
  systemctl --user disable 2dobetter 2>/dev/null || true

  cat > "$SERVICE_FILE" << UNIT
[Unit]
Description=2 Do Better — Todo App
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$APP_DIR/start-service.sh
WorkingDirectory=$APP_DIR
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=HOME=$HOME
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  systemctl --user enable 2dobetter
  systemctl --user start 2dobetter
  loginctl enable-linger "$(whoami)"
  echo -e "  ${GREEN}✓ systemd user service registered + linger enabled (starts at boot)${NC}"
fi

# ── 10. Verify server started ─────────────────────────────────────────────────
echo ""
echo -e "  ${YELLOW}Waiting for server to start...${NC}"
for i in {1..15}; do
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost:3000/ --max-time 1 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "307" ]; then break; fi
  sleep 1
done

if [ "$CODE" = "200" ] || [ "$CODE" = "307" ]; then
  echo -e "  ${GREEN}✓ Server is running at https://localhost:3000${NC}"
else
  echo -e "  ${YELLOW}⚠ Server not yet responding — it may still be starting.${NC}"
  if $IS_LINUX; then
    echo "    Check: journalctl --user -u 2dobetter -n 50"
  else
    echo "    Check: ~/Library/Logs/2dobetter.log"
  fi
fi

echo ""
if $IS_MACOS; then
  echo "  • Double-click 2DoBetter in /Applications to open"
  echo "  • The server runs in the background and starts automatically on login"
  echo "  • Logs: ~/Library/Logs/2dobetter.log"
fi
echo ""

# ── 11. Phone/client setup instructions ──────────────────────────────────────
if command -v ipconfig &>/dev/null; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
else
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
fi
RAW_HOSTNAME=$(hostname)
if [[ "$RAW_HOSTNAME" == *.local ]]; then
  MDNS_HOSTNAME="$RAW_HOSTNAME"
else
  MDNS_HOSTNAME="${RAW_HOSTNAME}.local"
fi
HTTP_PORT=3001

echo -e "  ${GREEN}Installation complete!${NC}"
echo ""
echo -e "  ${CYAN}═══════════════════════════════════════${NC}"
echo -e "  ${CYAN}  Phone / Client Setup${NC}"
echo -e "  ${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo "  1. Download CA cert on your phone:"
if [ -n "$LAN_IP" ]; then
  echo "     http://${LAN_IP}:${HTTP_PORT}/ca.crt"
fi
echo "     http://${MDNS_HOSTNAME}:${HTTP_PORT}/ca.crt"
echo ""
echo "  2. Install the certificate:"
echo "     iOS:     Settings > General > VPN & Device Management > Install"
echo "              Then: About > Certificate Trust Settings > Enable"
echo "     Android: Settings > Security > Install certificates > CA"
echo ""
echo "  3. Open the app:"
if [ -n "$LAN_IP" ]; then
  echo "     https://${LAN_IP}:3000"
fi
echo "     https://${MDNS_HOSTNAME}:3000"
echo ""
echo "  4. Enter username: $(grep AUTH_USERNAME "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 || echo '(see .env)')"
echo "  5. Enter token: ${TOKEN}"
echo ""
echo "  6. Tap Share > Add to Home Screen"
echo ""
echo -e "  ${CYAN}═══════════════════════════════════════${NC}"
echo ""
