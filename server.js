// 2 Do Better — Custom HTTPS/HTTP server
// Wraps Next.js with Node built-in TLS. No external dependencies.

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');

// Load .env if present (dotenv is already a project dependency)
try { require('dotenv').config(); } catch {}

const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const certDir = process.env.CERT_DIR || path.join(__dirname, 'certs');

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

// ── SSE (Server-Sent Events) for real-time sync ──────────────────────────────
const sseClients = new Set();

function sseHandler(req, res) {
  // Auth check: validate cookie
  const authToken = process.env.AUTH_TOKEN;
  if (authToken) {
    const cookies = (req.headers.cookie || '').split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    if (cookies['auth_token'] !== authToken) {
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

// Expose broadcast globally so Next.js API routes can call it
global.__sseBroadcast = broadcast;

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
