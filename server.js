// 2Do Better — Custom HTTPS/HTTP server
// Wraps Next.js with Node built-in TLS. No external dependencies.

const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os   = require('os');
let bcrypt; try { bcrypt = require('bcryptjs'); } catch { /* installed post-setup */ }
let QRCode; try { QRCode = require('qrcode'); } catch { /* installed post-setup */ }

// Load .env then .env.local (local overrides base — written by npm run setup)
try { require('dotenv').config(); } catch {}
try { require('dotenv').config({ path: '.env.local', override: true }); } catch {}

// Default DATABASE_URL for Prisma (schema uses env("DATABASE_URL"))
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

// ── Multi-user store ──────────────────────────────────────────────────────────
// If data/users.json exists, load it into AUTH_USERS_JSON so middleware +
// API routes can validate tokens without hitting the DB on every request.
// If it doesn't exist but AUTH_TOKEN is set, auto-create users.json from the
// legacy single-user env vars (migration path).
const usersFile = path.join(__dirname, 'data', 'users.json');
if (!process.env.AUTH_USERS_JSON) {
  if (fs.existsSync(usersFile)) {
    try {
      process.env.AUTH_USERS_JSON = fs.readFileSync(usersFile, 'utf8');
    } catch (e) {
      console.warn('  ⚠  Could not read data/users.json:', e.message);
    }
  } else if (process.env.AUTH_TOKEN) {
    // Auto-migrate: create users.json from legacy single-user env vars
    const username = process.env.AUTH_USERNAME || 'admin';
    // Hash the plaintext token immediately — never write it to disk in plaintext
    const hash = bcrypt ? bcrypt.hashSync(process.env.AUTH_TOKEN, 12) : undefined;
    const users = hash
      ? [{ username, hash }]
      : [{ username, token: process.env.AUTH_TOKEN }]; // fallback if bcrypt unavailable
    try {
      fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
      fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
      process.env.AUTH_USERS_JSON = JSON.stringify(users);
      console.log(`  ✓  Auto-migrated to multi-user: data/users.json created (user: "${username}")`);
    } catch (e) {
      console.warn('  ⚠  Could not create data/users.json:', e.message);
    }
  }
}

// ── Startup migration: hash any remaining plaintext tokens ────────────────────
// Covers installs upgraded from pre-bcrypt builds.
if (bcrypt && process.env.AUTH_USERS_JSON && fs.existsSync(usersFile)) {
  try {
    const users = JSON.parse(process.env.AUTH_USERS_JSON);
    let migrated = false;
    for (const user of users) {
      if (user.token && !user.hash) {
        user.hash = bcrypt.hashSync(user.token, 12);
        delete user.token;
        migrated = true;
      }
    }
    if (migrated) {
      fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
      process.env.AUTH_USERS_JSON = JSON.stringify(users);
      console.log('  ✓  Migrated legacy plaintext password(s) to bcrypt hashes');
    }
  } catch (e) {
    console.warn('  ⚠  Could not migrate legacy tokens:', e.message);
  }
}

// ── Validate data/ directory permissions ──────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (fs.existsSync(dataDir)) {
  try {
    var dataStat = fs.statSync(dataDir);
    var dataMode = dataStat.mode & 0o777;
    if (dataMode & 0o077) {
      // Group or world readable — tighten it
      fs.chmodSync(dataDir, 0o700);
      console.log('  ✓  Tightened data/ directory permissions to 700');
    }
  } catch (e) {
    console.warn('  ⚠  Could not check data/ permissions:', e.message);
  }
}

const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const certDir = process.env.CERT_DIR || path.join(__dirname, 'certs');

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

// ── SSE (Server-Sent Events) for real-time sync ──────────────────────────────
const sseClients = new Set();

function parseCookies(header) {
  return (header || '').split(';').reduce((acc, c) => {
    const eq = c.indexOf('=');
    if (eq > 0) {
      const k = c.slice(0, eq).trim();
      const v = c.slice(eq + 1).trim();
      if (k) acc[k] = v;
    }
    return acc;
  }, {});
}

function sseHandler(req, res) {
  // Auth check — supports multi-user (AUTH_USERS_JSON) and legacy (AUTH_TOKEN).
  // Accepts token from cookie OR Authorization: Bearer header (for agent clients).
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = bearerToken || cookies['auth_token'];
  const userCookie = cookies['auth_user'];

  // Read fresh from disk so newly-logged-in sessions are always valid.
  // Falls back to the startup env snapshot if the file can't be read.
  let usersJson;
  try { usersJson = fs.readFileSync(usersFile, 'utf8'); } catch { usersJson = process.env.AUTH_USERS_JSON; }
  if (usersJson) {
    try {
      const users = JSON.parse(usersJson);
      // Accept session token, legacy plaintext token, or permanent agentToken.
      // Validate username+token pair (consistent with proxy.ts) to prevent
      // a stolen token from being used with a different username.
      const matchesSession = (u) =>
        (token && u.sessions && u.sessions.includes(token)) ||
        u.session === token ||
        u.token === token ||
        u.agentToken === token;
      const authedUser = userCookie
        ? users.find(u => u.username === userCookie && matchesSession(u))
        : users.find(u => matchesSession(u));
      if (!authedUser) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }
    } catch {
      res.writeHead(500);
      res.end('Server configuration error');
      return;
    }
  } else {
    const authToken = process.env.AUTH_TOKEN;
    if (authToken && token !== authToken) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });
  res.write(': connected\n\n');

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));

  // Keepalive every 30s
  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 30000);
  req.on('close', () => clearInterval(keepalive));
}

// Broadcast to all SSE clients — called by API routes via global
function broadcast() {
  const data = JSON.stringify({ event: 'update', timestamp: Date.now() });
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

// Hard-reload broadcast — forces all clients to window.location.reload()
// Used when a column is deleted so stale PWA caches can't show ghost columns
function broadcastReload() {
  const data = JSON.stringify({ event: 'reload', timestamp: Date.now() });
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

// Expose both globally so Next.js API routes can call them
global.__sseBroadcast = broadcast;
global.__sseBroadcastReload = broadcastReload;

// ── Onboarding / device setup page ───────────────────────────────────────────
// Served at http://[ip]:[httpPort]/ (TLS mode) or http://[ip]:[port]/setup (HTTP mode).
// Shows QR codes for CA cert + app URL so adding a new device is scan-and-go.
async function serveSetupPage(req, res, { useTLS, port, hostname, lanAddresses }) {
  const httpPort = port + 1;
  const primaryIP = lanAddresses[0]?.address;
  const host = primaryIP || 'localhost';
  const appUrl = `${useTLS ? 'https' : 'http'}://${host}:${port}`;
  const certUrl = useTLS ? `http://${host}:${httpPort}/ca.crt` : null;

  let certQrSvg = '', appQrSvg = '';
  if (QRCode) {
    // Match qr-box background (#111827) so QR blends into the dark card
    const opts = { type: 'svg', color: { dark: '#e5e7eb', light: '#111827' }, margin: 1, width: 200 };
    try {
      if (certUrl) certQrSvg = await QRCode.toString(certUrl, opts);
      appQrSvg = await QRCode.toString(appUrl + '/login', opts);
    } catch (e) { console.warn('  ⚠  QR generation error:', e.message); }
  }

  const addrRows = lanAddresses
    .map(a => `<div class="addr"><span>${a.address}</span><em>${a.name}</em></div>`)
    .join('');

  const noQr = '<p class="no-qr">Install the qrcode package and restart to show QR codes</p>';

  const certStep = useTLS ? `
    <div class="step">
      <div class="step-num">1</div>
      <h2>Install the certificate</h2>
      <p>Your browser needs to trust this server. Scan the QR code to download and install the certificate.</p>
      <div class="qr-box">
        ${certQrSvg || noQr}
      </div>
      <a href="${certUrl}" class="tap-btn" download="2DoBetter-CA.crt">\u2b07 Download certificate</a>
      <div class="url">${certUrl}</div>
      <div class="tabs">
        <button class="tab active" data-p="desktop" onclick="showTab('desktop')">Desktop</button>
        <button class="tab" data-p="android" onclick="showTab('android')">Android</button>
        <button class="tab" data-p="ios" onclick="showTab('ios')">iPhone</button>
      </div>
      <div id="desktop" class="platform active">
        <div class="note"><strong>Firefox:</strong><br>
        Menu \u2192 Settings \u2192 Privacy &amp; Security \u2192 scroll to Certificates \u2192 View Certificates \u2192 Authorities tab \u2192 Import \u2192 select the downloaded file \u2192 tick <em>Trust this CA to identify websites</em> \u2192 OK.<br><br>
        <strong>Chrome / Edge / Brave:</strong><br>
        Click <em>Advanced</em> \u2192 <em>Proceed to address (unsafe)</em> for a one-time bypass.<br>
        Permanent fix: Settings \u2192 Privacy and security \u2192 Security \u2192 Manage certificates \u2192 Authorities \u2192 Import \u2192 select the file \u2192 trust for websites.</div>
      </div>
      <div id="android" class="platform">
        <div class="note"><strong>⚠ Chrome on Android 7 won\u2019t work \u2014 use Firefox instead.</strong><br><br>
        After downloading the cert:<br>
        Settings \u2192 Security \u2192 Encryption &amp; credentials \u2192 Install a certificate \u2192 CA certificate \u2192 pick the file.</div>
      </div>
      <div id="ios" class="platform">
        <div class="note">After downloading the cert:<br>
        Settings \u2192 Profile Downloaded \u2192 Install \u2192 enter passcode \u2192 Install.<br><br>
        Then: Settings \u2192 General \u2192 About \u2192 Certificate Trust Settings \u2192 enable the certificate.</div>
      </div>
    </div>
    <hr class="divider">
  ` : '<div class="badge-http">HTTP mode \u2014 no certificate needed</div>';

  const stepNum       = useTLS ? '2' : '1';
  const remoteStepNum = useTLS ? '3' : '2';
  const browserNote = useTLS ? ' (use Firefox on Android 7)' : '';

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>2Do Better — Add Device</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#030712;color:#e5e7eb;font-family:Arial,sans-serif;padding:24px 16px;max-width:480px;margin:0 auto}
h1{font-size:1.25rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#d1d5db;margin-bottom:4px}
.sub{color:#6b7280;font-size:.875rem;margin-bottom:24px}
.server-info{background:#111827;border:1px solid #1f2937;border-radius:8px;padding:12px 14px;margin-bottom:28px}
.server-info .label{font-size:.7rem;color:#4b5563;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
.addr{font-size:.8125rem;color:#6b7280;margin-bottom:3px}
.addr span{color:#d1d5db;font-family:monospace;margin-right:6px}
.addr em{font-style:normal;color:#4b5563;font-size:.75rem}
.step{margin-bottom:28px}
.step-num{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#1f2937;color:#9ca3af;font-size:.8125rem;font-weight:700;margin-bottom:12px}
.step h2{font-size:1rem;font-weight:600;color:#f3f4f6;margin-bottom:6px}
.step>p{font-size:.875rem;color:#9ca3af;margin-bottom:14px;line-height:1.5}
.qr-box{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:14px}
.qr-box svg{width:176px;height:176px}
.url{font-size:.75rem;color:#6b7280;font-family:monospace;word-break:break-all;text-align:center}
.no-qr{font-size:.8125rem;color:#6b7280;font-style:italic;padding:20px 0;text-align:center}
.tabs{display:flex;gap:8px;margin-bottom:10px}
.tab{padding:5px 14px;border-radius:6px;font-size:.8125rem;cursor:pointer;border:1px solid #374151;color:#9ca3af;background:none}
.tab.active{background:#1f2937;color:#f3f4f6;border-color:#4b5563}
.platform{display:none}
.platform.active{display:block}
.note{background:#111827;border:1px solid #1f2937;border-radius:8px;padding:12px 14px;font-size:.8125rem;color:#9ca3af;line-height:1.6}
.note strong{color:#e5e7eb}
.divider{border:none;border-top:1px solid #1f2937;margin:28px 0}
.badge-http{display:inline-block;background:#1c1917;border:1px solid #44403c;border-radius:4px;padding:3px 10px;font-size:.75rem;color:#a8a29e;margin-bottom:20px}
.coffee{text-decoration:none;margin-left:5px;font-size:1rem}
.tap-btn{display:block;background:#1f2937;border:1px solid #374151;border-radius:10px;padding:14px 20px;text-align:center;color:#f3f4f6;text-decoration:none;font-size:.9375rem;font-weight:600;margin-bottom:8px}
.tap-btn:active{background:#374151}
.opt{font-size:.7rem;font-weight:500;color:#4b5563;background:#1f2937;border-radius:4px;padding:2px 7px;margin-left:6px;vertical-align:middle;letter-spacing:0}
.note a{color:#60a5fa}
</style></head>
<body>
<h1>2Do Better <a href="https://www.buymeacoffee.com/luchegames" target="_blank" class="coffee">\u2615</a></h1>
<p class="sub">Add this device</p>
<div class="server-info">
  <div class="label">Server</div>
  <div class="addr"><span>${hostname}</span></div>
  ${addrRows}
</div>
${certStep}
<div class="step">
  <div class="step-num">${stepNum}</div>
  <h2>Open the app</h2>
  <p>Tap the button to open the app. The QR code is for scanning from a second device${browserNote}.</p>
  <div class="qr-box">
    ${appQrSvg || noQr}
  </div>
  <a href="${appUrl}/login" class="tap-btn">\u2192 Open 2Do Better</a>
  <div class="url">${appUrl}/login</div>
</div>
<hr class="divider">
<div class="step">
  <div class="step-num">${remoteStepNum}</div>
  <h2>Access from anywhere <span class="opt">optional</span></h2>
  <p>The link above works on your local Wi\u2011Fi. To reach your board from any location, you need a way for devices outside your network to find this server.</p>
  <div class="note">
    <strong>Step A \u2014 Tailscale (free mesh VPN)</strong><br>
    Install Tailscale on this server and on each device that needs access. All devices share a private network \u2014 no port-forwarding, no public exposure.<br>
    <a href="https://tailscale.com/download">tailscale.com/download \u2192</a><br><br>
    <strong>Step B \u2014 DuckDNS hostname (optional but recommended)</strong><br>
    Sign up at <a href="https://duckdns.org">duckdns.org</a> for a free subdomain pointing at your Tailscale IP. This gives your board a memorable URL and lets you get a trusted HTTPS certificate (no browser warnings on any device).<br><br>
    <em>Without DuckDNS, clients connect via the Tailscale IP directly \u2014 it works, but the IP can change and the self-signed cert will still show browser warnings.</em>
  </div>
</div>
<script>
function showTab(p){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.p===p)});
  document.querySelectorAll('.platform').forEach(function(c){c.classList.toggle('active',c.id===p)});
}
</scr` + `ipt>
</body></html>`;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

function hasCerts() {
  return (
    fs.existsSync(path.join(certDir, 'server.key')) &&
    fs.existsSync(path.join(certDir, 'server.crt'))
  );
}

function serveCaCert(req, res) {
  // Serve DER format for Android compatibility, PEM as fallback
  const derPath = path.join(certDir, 'ca.der.crt');
  const pemPath = path.join(certDir, 'ca.crt');

  // /ca.der.crt for explicit DER, /ca.crt serves DER if available (Android-friendly)
  if (req.url === '/ca.pem') {
    if (!fs.existsSync(pemPath)) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="2DoBetter-CA.pem"');
    fs.createReadStream(pemPath).pipe(res);
    return;
  }

  // Default: serve DER format (works best on Android), fall back to PEM
  const certPath = fs.existsSync(derPath) ? derPath : pemPath;
  if (!fs.existsSync(certPath)) { res.writeHead(404); res.end('CA certificate not found'); return; }
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="2DoBetter-CA.crt"');
  fs.createReadStream(certPath).pipe(res);
}

// Bind the port immediately so the browser gets a response during the
// ~5-10s window while Next.js initialises, instead of connection refused.
// Once app.prepare() resolves the real handler takes over.
const earlyPort = parseInt(process.env.PORT || '3000', 10);
const earlyServer = http.createServer((_req, res) => {
  res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5' });
  res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Starting...</title><style>body{font-family:sans-serif;text-align:center;padding:60px;background:#1c1917;color:#e7e5e4}</style></head><body><h2>2Do Better is starting up...</h2><p>This page will refresh automatically.</p></body></html>');
});
earlyServer.listen(earlyPort, '0.0.0.0');

app.prepare().then(() => {
  // Close the early server before the real one claims the port
  earlyServer.close();
  const rawHostname = os.hostname();
  // Ensure .local suffix (macOS hostname may already include it)
  const hostname = rawHostname.endsWith('.local') ? rawHostname : `${rawHostname}.local`;
  const lanAddresses = getLanAddresses();
  const useTLS = hasCerts();

  if (useTLS) {
    const key = fs.readFileSync(path.join(certDir, 'server.key'));
    const cert = fs.readFileSync(path.join(certDir, 'server.crt'));

    // HTTPS server (main app) on the primary port
    const httpsServer = https.createServer({ key, cert }, (req, res) => {
      // Tell Next.js route handlers the transport is HTTPS so they build
      // redirect URLs correctly (req.url is localhost internally otherwise).
      req.headers['x-forwarded-proto'] = 'https';
      // Serve CA cert for phone setup
      if (req.url === '/ca.crt' || req.url === '/ca.pem' || req.url === '/ca.der.crt') {
        serveCaCert(req, res);
        return;
      }
      // SSE endpoint — handled directly (not via Next.js) for reliable streaming
      if (req.url === '/api/events') {
        sseHandler(req, res);
        return;
      }
      handle(req, res);
    });

    httpsServer.listen(port, '0.0.0.0', () => {
      const primaryAddr = lanAddresses[0]?.address || 'localhost';
      const httpPort = port + 1;
      console.log(`\n  ✓  2Do Better is running!\n`);
      console.log(`  ── First time on this device? ──────────────────────`);
      console.log(`  STEP 1  Open this in your browser to install the cert:`);
      console.log(`          http://${primaryAddr}:${httpPort}\n`);
      console.log(`  STEP 2  Follow the on-screen instructions, then open:`);
      console.log(`          https://${primaryAddr}:${port}`);
      console.log(`  ────────────────────────────────────────────────────`);
      console.log(`  Already set up? Go straight to:`);
      console.log(`          https://${primaryAddr}:${port}\n`);
    });

    // HTTP server on port+1 for onboarding page, CA cert download + redirect
    const httpPort = port + 1;
    const httpServer = http.createServer(async (req, res) => {
      if (req.url === '/ca.crt' || req.url === '/ca.pem' || req.url === '/ca.der.crt') {
        serveCaCert(req, res);
        return;
      }
      // Onboarding setup page at root and /setup
      if (req.url === '/' || req.url === '/setup') {
        await serveSetupPage(req, res, { useTLS: true, port, hostname, lanAddresses });
        return;
      }
      // Redirect everything else to HTTPS.
      // Pin to known hostname — do NOT trust the client-supplied Host header
      // (prevents open-redirect / host-header injection attacks).
      res.writeHead(301, { Location: `https://${hostname}:${port}${req.url}` });
      res.end();
    });

    httpServer.listen(httpPort, '0.0.0.0', () => {
      console.log(`\n  HTTP setup + CA cert: http://localhost:${httpPort}`);
      for (const { address } of lanAddresses) {
        console.log(`  Setup:    http://${address}:${httpPort}`);
      }
      console.log('');
    });

  } else {
    // No certs — HTTP only (local dev or pre-setup)
    const httpServer = http.createServer(async (req, res) => {
      if (req.url === '/api/events') {
        sseHandler(req, res);
        return;
      }
      // Onboarding setup page at /setup
      if (req.url === '/setup') {
        await serveSetupPage(req, res, { useTLS: false, port, hostname, lanAddresses });
        return;
      }
      handle(req, res);
    });

    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`\n  2Do Better — HTTP server ready (no TLS certs found)\n`);
      console.log(`  Local:    http://localhost:${port}`);
      console.log(`  Network:  http://${hostname}:${port}`);
      for (const { address } of lanAddresses) {
        console.log(`  LAN IP:   http://${address}:${port}`);
        console.log(`  Setup:    http://${address}:${port}/setup`);
      }
      console.log(`\n  Run generate-certs.sh to enable HTTPS\n`);
    });
  }
});
