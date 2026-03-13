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
  # Linux — try ip route first (works in Alpine/Docker), fall back to hostname -I
  if command -v ip &>/dev/null; then
    local ip
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  if command -v hostname &>/dev/null; then
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  echo ""
}

LAN_IP=$(detect_lan_ip || echo "")
RAW_HOSTNAME=$(hostname 2>/dev/null || echo "localhost")
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
echo -e "  ${GREEN}✓ Done — restart the server to enable HTTPS${NC}"
echo ""
