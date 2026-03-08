// 2 Do Better — Custom HTTPS/HTTP server
// Wraps Next.js with Node built-in TLS. No external dependencies.

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');

// Load .env then .env.local (local overrides base — written by npm run setup)
try { require('dotenv').config(); } catch {}
try { require('dotenv').config({ path: '.env.local', override: true }); } catch {}

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
    const users = [{ username, token: process.env.AUTH_TOKEN }];
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
  // Auth check — supports multi-user (AUTH_USERS_JSON) and legacy (AUTH_TOKEN)
  const cookies = parseCookies(req.headers.cookie);
  const tokenCookie = cookies['auth_token'];

  const usersJson = process.env.AUTH_USERS_JSON;
  if (usersJson) {
    try {
      const users = JSON.parse(usersJson);
      if (!users.some(u => u.token === tokenCookie)) {
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
    if (authToken && tokenCookie !== authToken) {
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

app.prepare().then(() => {
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
      console.log(`\n  2 Do Better — HTTPS server ready\n`);
      console.log(`  Local:    https://localhost:${port}`);
      console.log(`  Network:  https://${hostname}:${port}`);
      for (const { address } of lanAddresses) {
        console.log(`  LAN IP:   https://${address}:${port}`);
      }
    });

    // HTTP server on port+1 for CA cert download + redirect
    const httpPort = port + 1;
    const httpServer = http.createServer((req, res) => {
      if (req.url === '/ca.crt' || req.url === '/ca.pem' || req.url === '/ca.der.crt') {
        serveCaCert(req, res);
        return;
      }
      // Redirect everything else to HTTPS
      const host = (req.headers.host || `localhost:${httpPort}`).replace(`:${httpPort}`, `:${port}`);
      res.writeHead(301, { Location: `https://${host}${req.url}` });
      res.end();
    });

    httpServer.listen(httpPort, '0.0.0.0', () => {
      console.log(`\n  HTTP redirect + CA cert: http://localhost:${httpPort}`);
      for (const { address } of lanAddresses) {
        console.log(`  CA cert:  http://${address}:${httpPort}/ca.crt`);
      }
      console.log('');
    });

  } else {
    // No certs — HTTP only (local dev or pre-setup)
    const httpServer = http.createServer((req, res) => {
      if (req.url === '/api/events') {
        sseHandler(req, res);
        return;
      }
      handle(req, res);
    });

    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`\n  2 Do Better — HTTP server ready (no TLS certs found)\n`);
      console.log(`  Local:    http://localhost:${port}`);
      console.log(`  Network:  http://${hostname}:${port}`);
      for (const { address } of lanAddresses) {
        console.log(`  LAN IP:   http://${address}:${port}`);
      }
      console.log(`\n  Run generate-certs.sh to enable HTTPS\n`);
    });
  }
});
