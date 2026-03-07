#!/usr/bin/env node
// 2Do Better — Admin CLI
// Usage:
//   npm run admin                   Print all admin commands
//   npm run status                  Server health + board stats
//   npm run list-users              List users
//   npm run gen-invite [minutes]    Generate a time-limited invite code (default 10 min)
//   npm run export-data [file]      Export board to JSON
//   npm run import-data <file>      Import board from JSON
//   npm run purge-completed         Delete completed tasks
//   npm run restart                 Restart the 2Do Better service
//   npm run context                 Full session context dump (for AI session start)
'use strict';

const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const http       = require('http');
const readline   = require('readline');
const os         = require('os');
const crypto     = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m',
};
const ok   = msg => console.log(`  ${C.green}✓${C.reset}  ${msg}`);
const warn = msg => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const info = msg => console.log(`  ${C.dim}${msg}${C.reset}`);

// Shared prompt helper (creates + closes its own readline interface)
function prompt(question, defaultVal) {
  var hint = defaultVal ? ' [' + defaultVal + ']' : '';
  return new Promise(function(resolve) {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  ' + question + hint + ': ', function(a) {
      rl.close();
      resolve((a.trim()) || (defaultVal || ''));
    });
  });
}

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

// ── SQLite helper (uses sqlite3 CLI) ──────────────────────────────────────────
const DB_PATH = path.join(ROOT, 'prisma', 'dev.db');

function runSql(sql) {
  if (!fs.existsSync(DB_PATH)) return '';
  const result = spawnSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
  return result.stdout.trim();
}

// ── list-users ────────────────────────────────────────────────────────────────
function listUsers() {
  const usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) {
    warn('No users file found — run npm run setup first.');
    return;
  }
  const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  console.log('');
  if (!users.length) {
    warn('No users configured.');
    return;
  }
  console.log(`  ${C.bold}Users (${users.length}):${C.reset}`);
  users.forEach((u, i) => {
    const tag = i === 0 ? ` ${C.dim}(admin)${C.reset}` : '';
    console.log(`    ${i + 1}. ${C.bold}${u.username}${C.reset}${tag}`);
  });
  console.log('');
}

// ── status ────────────────────────────────────────────────────────────────────
function showStatus() {
  console.log('');

  // ── Service state ──────────────────────────────────────────────────────────
  let serviceState = 'unknown';
  if (process.platform === 'darwin') {
    const plist = path.join(os.homedir(), 'Library/LaunchAgents/com.luchegames.2dobetter.plist');
    if (fs.existsSync(plist)) {
      const r = spawnSync('launchctl', ['list', 'com.luchegames.2dobetter'], { stdio: 'pipe' });
      serviceState = (r.status === 0) ? `${C.green}running${C.reset}` : `${C.yellow}stopped${C.reset}`;
    } else {
      serviceState = `${C.dim}no service installed${C.reset}`;
    }
  } else if (process.platform === 'linux') {
    const r = spawnSync('systemctl', ['--user', 'is-active', '2dobetter.service'], { stdio: 'pipe', encoding: 'utf8' });
    if (r.error) {
      serviceState = `${C.dim}unknown${C.reset}`;
    } else {
      serviceState = (r.stdout.trim() === 'active') ? `${C.green}running${C.reset}` : `${C.yellow}stopped${C.reset}`;
    }
  }
  console.log(`  Service   : ${serviceState}`);

  // ── Users ──────────────────────────────────────────────────────────────────
  const usersFile = path.join(ROOT, 'data', 'users.json');
  if (fs.existsSync(usersFile)) {
    try {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      console.log(`  Users     : ${users.length}`);
    } catch (_) { console.log(`  Users     : (error reading users.json)`); }
  } else {
    console.log(`  Users     : ${C.yellow}none — run npm run setup${C.reset}`);
  }

  // ── Board stats from DB ────────────────────────────────────────────────────
  if (fs.existsSync(DB_PATH)) {
    const cols  = runSql('SELECT COUNT(*) FROM "Column"') || '?';
    const lists = runSql('SELECT COUNT(*) FROM "List" WHERE archivedAt IS NULL') || '?';
    const tasks = runSql('SELECT COUNT(*) FROM "Task" WHERE completed = 0') || '?';
    const done  = runSql('SELECT COUNT(*) FROM "Task" WHERE completed = 1') || '?';
    const stat  = fs.statSync(DB_PATH);
    const kb    = (stat.size / 1024).toFixed(1);
    console.log(`  Columns   : ${cols}`);
    console.log(`  Lists     : ${lists}  (active)`);
    console.log(`  Tasks     : ${tasks}  open  |  ${done}  completed`);
    console.log(`  DB size   : ${kb} KB  (${DB_PATH})`);
  } else {
    console.log(`  ${C.yellow}Database not found — run npm run setup${C.reset}`);
  }

  // ── Last backup ────────────────────────────────────────────────────────────
  const backupDir = path.join(ROOT, 'backups');
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db') || f.endsWith('.db.enc'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length) {
      const latest = files[0];
      const age = Math.round((Date.now() - latest.mtime) / 3600000);
      const ageStr = age < 24 ? age + 'h ago' : Math.round(age / 24) + 'd ago';
      console.log(`  Last backup: ${latest.name}  (${ageStr})`);
    } else {
      console.log(`  Last backup: ${C.dim}none yet${C.reset}`);
    }
  } else {
    console.log(`  Last backup: ${C.dim}no backups directory${C.reset}`);
  }

  console.log('');
}

// ── restart ───────────────────────────────────────────────────────────────────
function getRestartCommand() {
  if (process.platform === 'darwin') {
    const plist = path.join(os.homedir(), 'Library/LaunchAgents/com.luchegames.2dobetter.plist');
    if (fs.existsSync(plist)) {
      return { cmd: 'launchctl', args: ['kickstart', '-k', 'gui/' + process.getuid() + '/com.luchegames.2dobetter'] };
    }
  }
  if (process.platform === 'linux') {
    const probe = spawnSync('systemctl', ['--user', 'cat', '2dobetter.service'], { stdio: 'pipe' });
    if (probe.status === 0) {
      return { cmd: 'systemctl', args: ['--user', 'restart', '2dobetter.service'] };
    }
  }
  return null; // no managed service found
}

function restartService() {
  const svc = getRestartCommand();
  if (!svc) {
    console.log('\n  No managed service detected on this machine.');
    console.log('  If you started the server manually, stop it and run:');
    console.log('    npm start\n');
    return;
  }

  const displayCmd = [svc.cmd].concat(svc.args).join(' ');
  console.log('\n  Restarting service...');
  info('  Command: ' + displayCmd);

  const result = spawnSync(svc.cmd, svc.args, { stdio: 'inherit' });

  if (result.error) {
    throw new Error('Failed to run restart command: ' + result.error.message);
  }
  if (result.status !== 0) {
    throw new Error('Restart command exited with code ' + result.status);
  }

  ok('Service restarted successfully.');
  console.log('');
}

// ── gen-invite ────────────────────────────────────────────────────────────────
async function genInvite() {
  var minutesArg = parseInt(process.argv[3] || '10', 10);
  var minutes = (isNaN(minutesArg) || minutesArg < 1) ? 10 : minutesArg;

  var code = crypto.randomBytes(12).toString('hex'); // 24 hex chars
  var now = new Date();
  var expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

  var invitesFile = path.join(ROOT, 'data', 'invites.json');
  var invites = [];
  if (fs.existsSync(invitesFile)) {
    try { invites = JSON.parse(fs.readFileSync(invitesFile, 'utf8')); } catch (_) {}
  }

  // Prune expired codes
  var nowMs = Date.now();
  invites = invites.filter(function(i) { return new Date(i.expiresAt).getTime() > nowMs; });

  invites.push({ code: code, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(invitesFile, JSON.stringify(invites, null, 2), { mode: 0o600 });

  var expireTime = expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  console.log('\n  ' + C.bold + 'Invite code generated:' + C.reset + '\n');
  console.log('  ' + C.bold + C.cyan + code + C.reset + '\n');
  console.log('  ' + C.dim + 'Single-use  ·  expires at ' + expireTime + ' (' + minutes + ' min)' + C.reset);
  console.log('  ' + C.dim + 'Send to the new user — they enter it on the Create Account page.' + C.reset);
  console.log('');
}

// ── purge-completed ───────────────────────────────────────────────────────────
async function purgeCompleted() {
  var total = runSql('SELECT COUNT(*) FROM "Task" WHERE completed = 1') || '0';

  if (total === '0') {
    console.log('\n  No completed tasks in the database.\n');
    return;
  }

  console.log('\n  Completed tasks in database: ' + C.bold + total + C.reset + '\n');
  console.log('  ' + C.dim + '(a) Delete ALL ' + total + ' completed tasks' + C.reset);
  console.log('  ' + C.dim + '(d) Delete only those older than N days' + C.reset + '\n');

  var choice = await prompt('Choice (a/d)', 'd');
  var sql, count;

  if (choice.toLowerCase() === 'a') {
    count = total;
    sql = 'DELETE FROM "Task" WHERE completed = 1';
  } else {
    var days = await prompt('Delete completed tasks older than how many days?', '30');
    var n = parseInt(days, 10);
    if (isNaN(n) || n < 1) n = 30;
    // Include tasks with NULL completedAt (completed before timestamp was tracked)
    count = runSql(
      'SELECT COUNT(*) FROM "Task" WHERE completed = 1 AND ' +
      '(completedAt IS NULL OR completedAt <= datetime(\'now\', \'-' + n + ' days\'))'
    ) || '0';
    sql =
      'DELETE FROM "Task" WHERE completed = 1 AND ' +
      '(completedAt IS NULL OR completedAt <= datetime(\'now\', \'-' + n + ' days\'))';
  }

  if (count === '0') {
    console.log('\n  Nothing to delete.\n');
    return;
  }

  console.log('\n  ' + C.yellow + C.bold + '⚠  This will permanently delete ' + count + ' completed task(s).' + C.reset + '\n');
  var answer = await prompt('Type YES to confirm');

  if (answer !== 'YES') {
    console.log('\n  Cancelled — nothing changed.\n');
    return;
  }

  runSql(sql);
  ok('Deleted ' + count + ' completed task(s).');
  console.log('');
}

// ── context (AI session-start dump) ──────────────────────────────────────────
function showContext() {
  console.log('\n' + C.bold + C.cyan + '  ══ 2Do Better — Session Context ══' + C.reset + '\n');

  // Git info
  var branch = spawnSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  var log    = spawnSync('git', ['-C', ROOT, 'log', '--oneline', '-5'], { encoding: 'utf8' }).stdout.trim();
  console.log('  ' + C.bold + 'Git branch:' + C.reset + ' ' + branch);
  console.log('  ' + C.bold + 'Recent commits:' + C.reset);
  log.split('\n').forEach(function(l) { console.log('    ' + l); });
  console.log('');

  // Status (reuse existing function)
  showStatus();

  // Active invites
  var invitesFile = path.join(ROOT, 'data', 'invites.json');
  if (fs.existsSync(invitesFile)) {
    var invites = [];
    try { invites = JSON.parse(fs.readFileSync(invitesFile, 'utf8')); } catch (_) {}
    var nowMs = Date.now();
    var active = invites.filter(function(i) { return new Date(i.expiresAt).getTime() > nowMs; });
    console.log('  ' + C.bold + 'Active invite codes:' + C.reset + ' ' + active.length);
    active.forEach(function(i) {
      var mins = Math.round((new Date(i.expiresAt).getTime() - nowMs) / 60000);
      console.log('    ' + i.code + '  (' + mins + ' min remaining)');
    });
    console.log('');
  }
}

// ── help ──────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${C.bold}${C.cyan}  ╔════════════════════════════════════╗
  ║    2Do Better — Admin Commands    ║
  ╚════════════════════════════════════╝${C.reset}

  ${C.bold}Info:${C.reset}
    npm run status                  Service state, users, board stats, last backup
    npm run list-users              List all users
    npm run context                 Full session context (git, status, invites) — great for AI session start

  ${C.bold}User management:${C.reset}
    npm run setup                   Full setup wizard (first install)
    npm run add-user                Add a new user interactively
    npm run remove-user [username]          Remove user, share their column (safe default)
    npm run remove-user [username] delete   Remove user + delete their column and all tasks
    npm run gen-invite [minutes]    Generate a time-limited invite code (default 10 min)

  ${C.bold}Database:${C.reset}
    npm run export-data             Export board → 2dobetter-YYYY-MM-DD.json
    npm run export-data <file>      Export board → named file
    npm run import-data <file>      Import board from JSON ${C.yellow}(replaces ALL data)${C.reset}
    npm run purge-completed         Delete completed tasks (all, or older than N days)

  ${C.bold}Service:${C.reset}
    npm run restart                 Restart the server (auto-detects launchctl / systemctl)
    npm run service:install         Install as auto-start service
    npm run service:uninstall       Remove auto-start service
`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
const cmd = process.argv[2];
const dispatch = {
  'status':           () => { showStatus();    return Promise.resolve(); },
  'list-users':       () => { listUsers();     return Promise.resolve(); },
  'context':          () => { showContext();   return Promise.resolve(); },
  'gen-invite':       genInvite,
  'export-data':      exportData,
  'import-data':      importData,
  'purge-completed':  purgeCompleted,
  'restart':          () => { restartService(); return Promise.resolve(); },
};

if (dispatch[cmd]) {
  dispatch[cmd]().catch(e => {
    console.error(`\n  ${C.red}Error:${C.reset}`, e.message);
    process.exit(1);
  });
} else {
  printHelp();
}
