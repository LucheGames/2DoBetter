#!/usr/bin/env node
// 2Do Better — Admin CLI
// Usage:
//   npm run admin              Print all admin commands
//   npm run export-data        Export board to JSON (default filename)
//   npm run export-data out.json
//   npm run import-data backup.json
'use strict';

const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const http     = require('http');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m',
};
const ok   = msg => console.log(`  ${C.green}✓${C.reset}  ${msg}`);
const warn = msg => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const info = msg => console.log(`  ${C.dim}${msg}${C.reset}`);

// ── .env helpers ──────────────────────────────────────────────────────────────
function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .reduce((acc, line) => {
      const eq = line.indexOf('=');
      acc[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      return acc;
    }, {});
}

// ── Auth + server config ──────────────────────────────────────────────────────
function getAdminAuth() {
  const usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) throw new Error('data/users.json not found — run npm run setup first');
  const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  if (!users.length) throw new Error('No users in data/users.json');
  return users[0]; // first user = admin
}

function getServerConfig() {
  const env = { ...parseEnv(path.join(ROOT, '.env')), ...parseEnv(path.join(ROOT, '.env.local')) };
  const port    = parseInt(env.PORT || '3000', 10);
  const certDir = env.CERT_DIR || path.join(ROOT, 'certs');
  const useHttps = fs.existsSync(path.join(certDir, 'server.key'));
  return { port, useHttps };
}

function apiRequest(method, urlPath, cookie, body) {
  return new Promise((resolve, reject) => {
    const { port, useHttps } = getServerConfig();
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
    const options = {
      hostname: 'localhost',
      port,
      path: urlPath,
      method,
      headers: {
        Cookie: cookie,
        ...(bodyBuf
          ? { 'Content-Type': 'application/json', 'Content-Length': bodyBuf.length }
          : {}),
      },
      rejectUnauthorized: false, // accept self-signed certs
    };
    const proto = useHttps ? https : http;
    const req   = proto.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function makeCookie(user) {
  return `auth_token=${user.token}; auth_user=${user.username}`;
}

// ── export-data ───────────────────────────────────────────────────────────────
async function exportData() {
  const user   = getAdminAuth();
  const cookie = makeCookie(user);
  const date   = new Date().toISOString().split('T')[0];
  const arg    = process.argv[3];
  const outPath = arg
    ? (path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg))
    : path.join(process.cwd(), `2dobetter-${date}.json`);

  console.log(`\n  Exporting board data (authenticated as ${C.bold}${user.username}${C.reset})...`);

  const res = await apiRequest('GET', '/api/export', cookie);
  if (res.status !== 200) {
    throw new Error(`Export failed: HTTP ${res.status}\n${res.body}`);
  }

  fs.writeFileSync(outPath, res.body, 'utf8');
  const kb = (Buffer.byteLength(res.body) / 1024).toFixed(1);
  ok(`Saved to: ${outPath}  (${kb} KB)`);
  console.log('');
}

// ── import-data ───────────────────────────────────────────────────────────────
async function importData() {
  const arg = process.argv[3];
  if (!arg) {
    console.error(`  Usage: npm run import-data <filename.json>`);
    process.exit(1);
  }

  const inPath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
  if (!fs.existsSync(inPath)) throw new Error(`File not found: ${inPath}`);

  let raw, payload;
  try {
    raw     = fs.readFileSync(inPath, 'utf8');
    payload = JSON.parse(raw);
  } catch {
    throw new Error('File is not valid JSON');
  }

  if (payload.version !== 1 || !Array.isArray(payload.columns)) {
    throw new Error('Not a valid 2Do Better export (expected { version: 1, columns: [...] })');
  }

  // Summary
  const colCount  = payload.columns.length;
  const listCount = payload.columns.reduce((n, c) => n + ((c.lists && c.lists.length) || 0), 0);
  const taskCount = payload.columns.reduce((n, c) => {
    const lists = c.lists || [];
    return n + lists.reduce((m, l) => {
      const topTasks = (l.tasks && l.tasks.length) || 0;
      const subTasks = (l.children || []).reduce((k, ch) => k + ((ch.tasks && ch.tasks.length) || 0), 0);
      return m + topTasks + subTasks;
    }, 0);
  }, 0);

  console.log(`\n  Import file : ${path.basename(inPath)}`);
  info(`  Exported   : ${payload.exportedAt || 'unknown'}`);
  info(`  Contents   : ${colCount} column(s), ${listCount} list(s), ${taskCount} task(s)`);
  console.log(`\n  ${C.yellow}${C.bold}⚠  This will REPLACE ALL current board data. This cannot be undone.${C.reset}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve =>
    rl.question('  Type YES to confirm: ', a => { rl.close(); resolve(a.trim()); })
  );

  if (answer !== 'YES') {
    console.log('\n  Cancelled — nothing changed.\n');
    return;
  }

  const user   = getAdminAuth();
  const cookie = makeCookie(user);

  console.log('\n  Importing...');
  const res = await apiRequest('POST', '/api/import', cookie, raw);
  if (res.status !== 200) {
    throw new Error(`Import failed: HTTP ${res.status}\n${res.body}`);
  }

  const result = JSON.parse(res.body);
  ok(`Imported ${result.columns} column(s), ${result.lists} list(s), ${result.tasks} task(s)`);
  console.log('');
}

// ── help ──────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${C.bold}${C.cyan}  ╔════════════════════════════════════╗
  ║    2Do Better — Admin Commands    ║
  ╚════════════════════════════════════╝${C.reset}

  ${C.bold}User management:${C.reset}
    npm run setup                   Full setup wizard (first install)
    npm run add-user                Add a new user interactively
    npm run remove-user [username]  Remove a user + invalidate their session

  ${C.bold}Data backup / restore:${C.reset}
    npm run export-data             Export board → 2dobetter-YYYY-MM-DD.json
    npm run export-data <file>      Export board → named file
    npm run import-data <file>      Import board from JSON ${C.yellow}(replaces ALL data)${C.reset}

  ${C.bold}Service:${C.reset}
    npm run service:restart         Restart the server (picks up user changes)
    npm run service:install         Install as auto-start service
    npm run service:uninstall       Remove auto-start service
`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
const cmd = process.argv[2];
const dispatch = {
  'export-data': exportData,
  'import-data': importData,
};

if (dispatch[cmd]) {
  dispatch[cmd]().catch(e => {
    console.error(`\n  ${C.red}Error:${C.reset}`, e.message);
    process.exit(1);
  });
} else {
  printHelp();
}
