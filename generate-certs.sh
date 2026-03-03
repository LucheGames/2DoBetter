#!/bin/bash
# =============================================================================
# 2 Do Better — TLS Certificate Generator
# =============================================================================
# Creates a local Certificate Authority and a server cert signed by it.
# Works on macOS and Ubuntu. No external dependencies (uses openssl).
#
# Usage: bash generate-certs.sh
# =============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/certs"
mkdir -p "$CERT_DIR"

echo ""
echo -e "${CYAN}  2 Do Better — Certificate Generator${NC}"
echo "  ─────────────────────────────────────"
echo ""

# ── Detect LAN IP ─────────────────────────────────────────────────────────────
detect_lan_ip() {
  # macOS
  if command -v ipconfig &>/dev/null; then
    local ip
    ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  # Linux
  if command -v hostname &>/dev/null; then
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  echo ""
}

LAN_IP=$(detect_lan_ip)
RAW_HOSTNAME=$(hostname)
# Ensure .local suffix (macOS hostname may already include it)
if [[ "$RAW_HOSTNAME" == *.local ]]; then
  MDNS_HOSTNAME="$RAW_HOSTNAME"
else
  MDNS_HOSTNAME="${RAW_HOSTNAME}.local"
fi

echo -e "  ${YELLOW}Hostname:${NC} ${MDNS_HOSTNAME}"
if [ -n "$LAN_IP" ]; then
  echo -e "  ${YELLOW}LAN IP:${NC}   ${LAN_IP}"
else
  echo -e "  ${YELLOW}LAN IP:${NC}   (not detected — only localhost SANs will be used)"
fi
echo ""

# ── 1. Generate CA (if not already present) ───────────────────────────────────
if [ -f "$CERT_DIR/ca.key" ] && [ -f "$CERT_DIR/ca.crt" ]; then
  echo -e "  ${GREEN}✓ CA already exists — reusing${NC}"
else
  echo -e "  ${YELLOW}Generating Certificate Authority...${NC}"
  openssl genrsa -out "$CERT_DIR/ca.key" 2048 2>/dev/null

  # CA config with proper v3 extensions (required by Android)
  cat > "$CERT_DIR/ca.cnf" << 'CACNF'
[req]
distinguished_name = req_dn
x509_extensions = v3_ca
prompt = no

[req_dn]
CN = 2DoBetter Local CA

[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
CACNF

  openssl req -new -x509 \
    -key "$CERT_DIR/ca.key" \
    -out "$CERT_DIR/ca.crt" \
    -days 3650 \
    -config "$CERT_DIR/ca.cnf" \
    2>/dev/null
  rm -f "$CERT_DIR/ca.cnf"
  echo -e "  ${GREEN}✓ CA created (valid 10 years)${NC}"
fi

# ── 2. Create OpenSSL config with SANs ────────────────────────────────────────
echo -e "  ${YELLOW}Generating server certificate...${NC}"

cat > "$CERT_DIR/server.cnf" << CNFEOF
[req]
distinguished_name = req_dn
req_extensions = v3_req
prompt = no

[req_dn]
CN = 2DoBetter Server

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = ${MDNS_HOSTNAME}
IP.1 = 127.0.0.1
CNFEOF

# Add LAN IP if detected
if [ -n "$LAN_IP" ]; then
  echo "IP.2 = ${LAN_IP}" >> "$CERT_DIR/server.cnf"
fi

# ── 3. Generate server key + CSR ──────────────────────────────────────────────
openssl genrsa -out "$CERT_DIR/server.key" 2048 2>/dev/null
openssl req -new \
  -key "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -config "$CERT_DIR/server.cnf" \
  2>/dev/null

# ── 4. Sign with CA ──────────────────────────────────────────────────────────
openssl x509 -req \
  -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" \
  -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial \
  -out "$CERT_DIR/server.crt" \
  -days 825 \
  -extfile "$CERT_DIR/server.cnf" \
  -extensions v3_req \
  2>/dev/null

# ── 5. Create DER-format CA cert for Android ──────────────────────────────────
openssl x509 -in "$CERT_DIR/ca.crt" -outform DER -out "$CERT_DIR/ca.der.crt" 2>/dev/null

# ── 6. Clean up temp files ────────────────────────────────────────────────────
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/ca.srl"

echo -e "  ${GREEN}✓ Server certificate created (valid 825 days)${NC}"
echo ""

# ── 6. Print phone setup instructions ────────────────────────────────────────
HTTP_PORT=$((${PORT:-3000} + 1))

echo -e "  ${CYAN}═══════════════════════════════════════${NC}"
echo -e "  ${CYAN}  Phone Setup Instructions${NC}"
echo -e "  ${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo "  1. Download the CA certificate on your phone:"
if [ -n "$LAN_IP" ]; then
  echo "     http://${LAN_IP}:${HTTP_PORT}/ca.crt"
fi
echo "     http://${MDNS_HOSTNAME}:${HTTP_PORT}/ca.crt"
echo ""
echo "  2. Install the certificate:"
echo "     iOS:     Settings > General > VPN & Device Management > Install"
echo "              Then: Settings > General > About > Certificate Trust Settings > Enable"
echo "     Android: Settings > Security > Install certificates > CA certificate"
echo ""
echo "  3. Open the app:"
if [ -n "$LAN_IP" ]; then
  echo "     https://${LAN_IP}:${PORT:-3000}"
fi
echo "     https://${MDNS_HOSTNAME}:${PORT:-3000}"
echo ""
echo "  4. Add to Home Screen for a native app experience"
echo ""
echo -e "  ${CYAN}═══════════════════════════════════════${NC}"
echo ""
