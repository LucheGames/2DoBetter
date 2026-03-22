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
const bcrypt     = require('bcryptjs');
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
  // Use session token if available (new bcrypt system), fall back to legacy plaintext token
  return `auth_token=${user.session || user.token || ''}; auth_user=${user.username}`;
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
  if (res.status === 401) {
    throw new Error('Export failed: no active session. Log in through the browser first, then retry.');
  }
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
  if (res.status === 401) {
    throw new Error('Import failed: no active session. Log in through the browser first, then retry.');
  }
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

// ── reset-password ────────────────────────────────────────────────────────────
async function resetPassword() {
  var usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) {
    console.log('\n  No users file found — run npm run setup first.\n');
    return;
  }
  var users;
  try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (_) { users = []; }
  if (!users.length) { console.log('\n  No users configured.\n'); return; }

  var target = (process.argv[3] || '').trim();
  if (!target) {
    console.log('');
    users.forEach(function(u, i) { console.log('  ' + (i + 1) + '. ' + u.username); });
    console.log('');
    target = await prompt('Username to reset');
  }
  if (!target) { console.log('\n  Cancelled.\n'); return; }

  var idx = users.findIndex(function(u) { return u.username.toLowerCase() === target.toLowerCase(); });
  if (idx === -1) { warn('User "' + target + '" not found.'); console.log(''); return; }

  var username = users[idx].username;
  console.log('\n  Resetting password for: ' + C.bold + username + C.reset);
  console.log('  ' + C.dim + '(blank = generate a random token)' + C.reset + '\n');

  var newToken = await prompt('New password');
  if (!newToken) {
    newToken = crypto.randomBytes(16).toString('hex');
    console.log('\n  Generated: ' + C.bold + C.cyan + newToken + C.reset);
  } else if (newToken.length < 8) {
    warn('Password must be at least 8 characters.');
    return;
  }

  var hash = await bcrypt.hash(newToken, 12);
  users[idx].hash = hash;
  delete users[idx].token;   // remove legacy plaintext if present
  delete users[idx].session; // invalidate any active sessions
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
  ok('Password updated for "' + username + '".');
  info('The user will be signed out automatically — they can log in with the new password.');
  console.log('');
}

// ── rename-user ───────────────────────────────────────────────────────────────
async function renameUser() {
  var usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) { console.log('\n  No users file found.\n'); return; }
  var users;
  try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (_) { users = []; }
  if (!users.length) { console.log('\n  No users configured.\n'); return; }

  var oldName = (process.argv[3] || '').trim();
  var newName = (process.argv[4] || '').trim();

  if (!oldName) {
    console.log('');
    users.forEach(function(u, i) { console.log('  ' + (i + 1) + '. ' + u.username); });
    console.log('');
    oldName = await prompt('Username to rename');
  }
  if (!oldName) { console.log('\n  Cancelled.\n'); return; }

  var idx = users.findIndex(function(u) { return u.username.toLowerCase() === oldName.toLowerCase(); });
  if (idx === -1) { warn('User "' + oldName + '" not found.'); console.log(''); return; }

  if (!newName) { newName = await prompt('New username'); }
  if (!newName) { console.log('\n  Cancelled.\n'); return; }
  if (newName.length < 2) { warn('Username must be at least 2 characters.'); return; }

  var clash = users.find(function(u, i) { return i !== idx && u.username.toLowerCase() === newName.toLowerCase(); });
  if (clash) { warn('"' + newName + '" is already taken.'); return; }

  var confirm = await prompt('Rename "' + users[idx].username + '" → "' + newName + '"? (y/n)');
  if (confirm.toLowerCase() !== 'y') { console.log('\n  Cancelled.\n'); return; }

  var oldUsername = users[idx].username;
  users[idx].username = newName;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
  ok('User renamed: "' + oldUsername + '" → "' + newName + '"');

  // Update DB: ownerUsername + rename the column if it was named after the old user
  var safeOld = oldUsername.replace(/'/g, "''");
  var safeNew = newName.replace(/'/g, "''");
  var colName = runSql("SELECT name FROM \"Column\" WHERE ownerUsername = '" + safeOld + "' LIMIT 1");
  if (colName) {
    if (colName.toLowerCase() === oldUsername.toLowerCase()) {
      runSql("UPDATE \"Column\" SET ownerUsername = '" + safeNew + "', name = '" + safeNew + "' WHERE ownerUsername = '" + safeOld + "'");
      ok('Column renamed to "' + newName + '".');
    } else {
      runSql("UPDATE \"Column\" SET ownerUsername = '" + safeNew + "' WHERE ownerUsername = '" + safeOld + "'");
      ok('Column "' + colName + '" ownership transferred.');
    }
  }

  info('Restart the server to apply the session change:  npm run restart');
  console.log('');
}

// ── list-users ────────────────────────────────────────────────────────────────
function listUsers() {
  var usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) {
    warn('No users file found — run npm run setup first.');
    return;
  }
  var users;
  try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (_) { users = []; }
  console.log('');
  if (!users.length) { warn('No users configured.'); return; }

  // Build username → column name map from DB
  var colMap = {};
  if (fs.existsSync(DB_PATH)) {
    var colRows = runSql('SELECT ownerUsername, name FROM "Column" WHERE ownerUsername IS NOT NULL');
    if (colRows) {
      colRows.split('\n').forEach(function(row) {
        var bar = row.indexOf('|');
        if (bar !== -1) { colMap[row.slice(0, bar)] = row.slice(bar + 1); }
      });
    }
  }

  console.log('  ' + C.bold + 'Users (' + users.length + '):' + C.reset);
  users.forEach(function(u, i) {
    var adminTag  = u.isAdmin ? ' ' + C.dim + '(admin)' + C.reset : '';
    var typeTag   = u.isAgent ? ' ' + C.dim + '[agent]' + C.reset : '';
    var access    = u.readOnly ? 'readonly' : (u.ownColumnOnly ? 'own' : 'full');
    var accessTag = u.isAdmin ? '' : '  ' + C.dim + access + C.reset;
    var col       = colMap[u.username];
    var colStr    = col ? '  ' + C.dim + '→ ' + col + C.reset : '';
    console.log('    ' + (i + 1) + '. ' + C.bold + u.username + C.reset + adminTag + typeTag + accessTag + colStr);
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
    const colRows = runSql('SELECT name, ownerUsername FROM "Column" ORDER BY "order"');
    if (colRows) {
      var colNames = colRows.split('\n').map(function(row) {
        var bar = row.indexOf('|');
        return bar !== -1 ? row.slice(0, bar) : row;
      });
      console.log('  Columns   : ' + colNames.join('  ·  ') + '  (' + colNames.length + ')');
    } else {
      console.log('  Columns   : ?');
    }
    const lists = runSql('SELECT COUNT(*) FROM "List" WHERE archivedAt IS NULL') || '?';
    const tasks = runSql('SELECT COUNT(*) FROM "Task" WHERE completed = 0') || '?';
    const done  = runSql('SELECT COUNT(*) FROM "Task" WHERE completed = 1') || '?';
    const stat  = fs.statSync(DB_PATH);
    const kb    = (stat.size / 1024).toFixed(1);
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

// ── service:install / service:uninstall ──────────────────────────────────────
function serviceInstall() {
  if (process.platform === 'darwin') {
    const plistSrc  = path.join(ROOT, 'com.luchegames.2dobetter.plist');
    const launchDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistDst  = path.join(launchDir, 'com.luchegames.2dobetter.plist');
    if (!fs.existsSync(plistSrc)) throw new Error('plist template not found: ' + plistSrc);
    if (!fs.existsSync(launchDir)) fs.mkdirSync(launchDir, { recursive: true });
    fs.copyFileSync(plistSrc, plistDst);
    const r = spawnSync('launchctl', ['load', plistDst], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('launchctl load failed');
    ok('Service installed (macOS launchd). 2Do Better will start at login.');
    return;
  }

  if (process.platform === 'linux') {
    // Prefer nvm node v20+ over the system node
    let nodeBin = process.execPath;
    const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmDir)) {
      const v20 = fs.readdirSync(nvmDir)
        .filter(v => /^v[2-9]\d*\./.test(v) && parseInt(v.slice(1), 10) >= 20)
        .sort().reverse()[0];
      if (v20) nodeBin = path.join(nvmDir, v20, 'bin', 'node');
    }

    const serviceContent = [
      '[Unit]',
      'Description=2Do Better',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'WorkingDirectory=' + ROOT,
      'Environment=NODE_ENV=production',
      'ExecStart=' + nodeBin + ' ' + path.join(ROOT, 'server.js'),
      'Restart=on-failure',
      'RestartSec=5',
      'StandardOutput=journal',
      'StandardError=journal',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n');

    const unitDir  = path.join(os.homedir(), '.config', 'systemd', 'user');
    const unitFile = path.join(unitDir, '2dobetter.service');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(unitFile, serviceContent);

    spawnSync('systemctl', ['--user', 'daemon-reload'],       { stdio: 'inherit' });
    spawnSync('systemctl', ['--user', 'enable', '2dobetter'], { stdio: 'inherit' });
    const r = spawnSync('systemctl', ['--user', 'start',  '2dobetter'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('systemctl start failed — check: journalctl --user -u 2dobetter -n 50');

    // Allow service to start at boot without an interactive login session
    spawnSync('loginctl', ['enable-linger', os.userInfo().username], { stdio: 'pipe' });

    ok('Service installed (Linux systemd). 2Do Better will start at boot.');
    console.log('  Unit file: ' + unitFile);
    console.log('  Node:      ' + nodeBin);
    console.log('  Logs:      journalctl --user -u 2dobetter -f');
    console.log('');
    return;
  }

  throw new Error('service:install is only supported on macOS and Linux');
}

function serviceUninstall() {
  if (process.platform === 'darwin') {
    const plistDst = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.luchegames.2dobetter.plist');
    if (!fs.existsSync(plistDst)) { info('No launchd service found — nothing to remove.'); return; }
    spawnSync('launchctl', ['unload', plistDst], { stdio: 'inherit' });
    fs.unlinkSync(plistDst);
    ok('Service removed (macOS launchd).');
    return;
  }

  if (process.platform === 'linux') {
    const unitFile = path.join(os.homedir(), '.config', 'systemd', 'user', '2dobetter.service');
    if (!fs.existsSync(unitFile)) { info('No systemd service found — nothing to remove.'); return; }
    spawnSync('systemctl', ['--user', 'stop',    '2dobetter'], { stdio: 'inherit' });
    spawnSync('systemctl', ['--user', 'disable', '2dobetter'], { stdio: 'inherit' });
    fs.unlinkSync(unitFile);
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
    ok('Service removed (Linux systemd).');
    return;
  }

  throw new Error('service:uninstall is only supported on macOS and Linux');
}

// ── gen-invite ────────────────────────────────────────────────────────────────
async function genInvite() {
  var minutesArg = parseInt(process.argv[3] || '0', 10);
  var minutes;
  if (!isNaN(minutesArg) && minutesArg > 0) {
    minutes = minutesArg;
  } else {
    var mStr = await prompt('Expires in (minutes)', '60');
    minutes = parseInt(mStr, 10);
    if (isNaN(minutes) || minutes < 1) minutes = 60;
  }

  // Access level
  console.log('\n  Access levels: full · own (default) · readonly');
  var levelStr = (await prompt('Access level', 'own')).toLowerCase().trim();
  var readOnly = false;
  var ownColumnOnly = false;
  if (levelStr === 'readonly') { readOnly = true; }
  else if (levelStr === 'own' || levelStr === '') { ownColumnOnly = true; }
  // 'full' leaves both false

  // Type
  var typeStr = (await prompt('Type (human/agent)', 'human')).toLowerCase().trim();
  var isAgent = (typeStr === 'agent');

  var code = crypto.randomBytes(4).toString('hex'); // 8 hex chars — short enough to read aloud
  var now = new Date();
  var expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

  var invite = { code: code, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
  if (readOnly)      { invite.readOnly = true; }
  if (ownColumnOnly) { invite.ownColumnOnly = true; }
  if (isAgent)       { invite.isAgent = true; }

  var invitesFile = path.join(ROOT, 'data', 'invites.json');
  var invites = [];
  if (fs.existsSync(invitesFile)) {
    try { invites = JSON.parse(fs.readFileSync(invitesFile, 'utf8')); } catch (_) {}
  }

  // Prune expired codes
  var nowMs = Date.now();
  invites = invites.filter(function(i) { return new Date(i.expiresAt).getTime() > nowMs; });
  invites.push(invite);

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(invitesFile, JSON.stringify(invites, null, 2), { mode: 0o600 });

  var levelLabel = readOnly ? 'readonly' : (ownColumnOnly ? 'own column' : 'full');
  var typeLabel  = isAgent ? 'agent' : 'human';
  var expireTime = expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  console.log('\n  ' + C.bold + 'Invite code generated:' + C.reset + '\n');
  console.log('  ' + C.bold + C.cyan + code + C.reset + '\n');
  console.log('  ' + C.dim + 'Access: ' + levelLabel + '  ·  Type: ' + typeLabel + C.reset);
  console.log('  ' + C.dim + 'Single-use  ·  expires at ' + expireTime + ' (' + minutes + ' min)' + C.reset);
  console.log('  ' + C.dim + 'Send to the new user — they enter it on the Create Account page.' + C.reset);
  console.log('');
}

// ── gen-agent-token ───────────────────────────────────────────────────────────
async function genAgentToken() {
  var usersFile = path.join(ROOT, 'data', 'users.json');
  var users = [];
  try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (_) {}
  if (!users.length) { console.error('  No users found.'); process.exit(1); }

  // Pick user — default to first, or accept username arg
  var targetName = process.argv[3] || null;
  var idx = targetName
    ? users.findIndex(function(u) { return u.username.toLowerCase() === targetName.toLowerCase(); })
    : 0;
  if (idx === -1) { console.error('  User "' + targetName + '" not found.'); process.exit(1); }

  var token = crypto.randomBytes(32).toString('hex'); // 64-char hex — same entropy as session token
  users[idx].agentToken = token;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });

  console.log('\n  ' + C.bold + 'Agent token generated for ' + users[idx].username + ':' + C.reset + '\n');
  console.log('  ' + C.bold + C.cyan + token + C.reset + '\n');
  console.log('  ' + C.dim + 'Add this to ~/.claude.json on the MCP client machine:' + C.reset);
  console.log('  ' + C.dim + '  mcpServers.2dobetter.env.AUTH_TOKEN = <token above>' + C.reset);
  console.log('  ' + C.dim + 'Rotate anytime by re-running this command.' + C.reset);
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

// ── purge-graveyard ───────────────────────────────────────────────────────────
async function purgeGraveyard() {
  var total = runSql('SELECT COUNT(*) FROM "List" WHERE archivedAt IS NOT NULL') || '0';

  if (total === '0') {
    console.log('\n  No archived lists in the graveyard.\n');
    return;
  }

  console.log('\n  Archived lists in graveyard: ' + C.bold + total + C.reset + '\n');
  console.log('  ' + C.dim + '(a) Delete ALL ' + total + ' archived lists and their tasks' + C.reset);
  console.log('  ' + C.dim + '(d) Delete only those archived more than N days ago' + C.reset + '\n');

  var choice = await prompt('Choice (a/d)', 'd');
  var where, count;

  if (choice.toLowerCase() === 'a') {
    where = 'archivedAt IS NOT NULL';
    count = total;
  } else {
    var days = await prompt('Archived more than how many days ago?', '30');
    var n = parseInt(days, 10);
    if (isNaN(n) || n < 1) n = 30;
    where = 'archivedAt IS NOT NULL AND archivedAt <= datetime(\'now\', \'-' + n + ' days\')';
    count = runSql('SELECT COUNT(*) FROM "List" WHERE ' + where) || '0';
  }

  if (count === '0') {
    console.log('\n  Nothing to delete.\n');
    return;
  }

  console.log('\n  ' + C.yellow + C.bold + '⚠  This will permanently delete ' + count + ' list(s) and all their tasks.' + C.reset + '\n');
  var answer = await prompt('Type YES to confirm');

  if (answer !== 'YES') {
    console.log('\n  Cancelled — nothing changed.\n');
    return;
  }

  // Delete child tasks first, then lists (guards against FK cascade not being enabled)
  runSql('DELETE FROM "Task" WHERE listId IN (SELECT id FROM "List" WHERE ' + where + ')');
  runSql('DELETE FROM "List" WHERE ' + where);
  ok('Deleted ' + count + ' list(s) from graveyard.');
  console.log('');
}

// ── set-access ────────────────────────────────────────────────────────────────
async function setAccess() {
  var usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) { console.log('\n  No users file found.\n'); return; }
  var users;
  try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (_) { users = []; }
  if (!users.length) { console.log('\n  No users configured.\n'); return; }

  var targetName = (process.argv[3] || '').trim();
  var level = (process.argv[4] || '').toLowerCase().trim();

  if (!targetName) {
    console.log('');
    users.forEach(function(u, i) {
      var cur = u.readOnly ? 'readonly' : (u.ownColumnOnly ? 'own' : 'full');
      console.log('  ' + (i + 1) + '. ' + u.username + (u.isAdmin ? ' (admin)' : '') + '  [' + cur + ']');
    });
    console.log('');
    targetName = await prompt('Username');
  }
  if (!targetName) { console.log('\n  Cancelled.\n'); return; }

  var idx = users.findIndex(function(u) { return u.username.toLowerCase() === targetName.toLowerCase(); });
  if (idx === -1) { warn('User "' + targetName + '" not found.'); return; }
  if (users[idx].isAdmin) { warn('Cannot change access flags on an admin account.'); return; }

  if (level !== 'full' && level !== 'own' && level !== 'readonly') {
    var cur = users[idx].readOnly ? 'readonly' : (users[idx].ownColumnOnly ? 'own' : 'full');
    console.log('\n  Levels: full (read+write everywhere) · own (write only their column) · readonly');
    level = (await prompt('Access level for "' + users[idx].username + '"', cur)).toLowerCase().trim();
  }

  if (level === 'full') {
    users[idx].readOnly = false;
    users[idx].ownColumnOnly = false;
  } else if (level === 'own') {
    users[idx].readOnly = false;
    users[idx].ownColumnOnly = true;
  } else if (level === 'readonly') {
    users[idx].readOnly = true;
    users[idx].ownColumnOnly = false;
  } else {
    warn('Unknown level "' + level + '". Use: full / own / readonly');
    return;
  }

  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
  ok('Access for "' + users[idx].username + '" set to: ' + level);
  console.log('');
}

// ── set-type ──────────────────────────────────────────────────────────────────
async function setType() {
  var usersFile = path.join(ROOT, 'data', 'users.json');
  if (!fs.existsSync(usersFile)) { console.log('\n  No users file found.\n'); return; }
  var users;
  try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (_) { users = []; }
  if (!users.length) { console.log('\n  No users configured.\n'); return; }

  var targetName = (process.argv[3] || '').trim();
  var type = (process.argv[4] || '').toLowerCase().trim();

  if (!targetName) {
    console.log('');
    users.forEach(function(u, i) {
      console.log('  ' + (i + 1) + '. ' + u.username + '  [' + (u.isAgent ? 'agent' : 'human') + ']');
    });
    console.log('');
    targetName = await prompt('Username');
  }
  if (!targetName) { console.log('\n  Cancelled.\n'); return; }

  var idx = users.findIndex(function(u) { return u.username.toLowerCase() === targetName.toLowerCase(); });
  if (idx === -1) { warn('User "' + targetName + '" not found.'); return; }

  if (type !== 'human' && type !== 'agent') {
    var cur = users[idx].isAgent ? 'agent' : 'human';
    type = (await prompt('Type for "' + users[idx].username + '" (human/agent)', cur)).toLowerCase().trim();
  }
  if (type !== 'human' && type !== 'agent') {
    warn('Unknown type "' + type + '". Use: human / agent');
    return;
  }

  users[idx].isAgent = (type === 'agent');
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
  ok('"' + users[idx].username + '" type set to: ' + type);
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
    npm run setup                              Full setup wizard (first install)
    npm run add-user                           Add a new user interactively
    npm run remove-user [username]             Remove user, rename column → "Shared" (safe default)
    npm run remove-user [username] delete      Remove user + delete their column and all tasks
    npm run reset-password [username]          Reset a user's password
    npm run rename-user [old] [new]            Rename a user (updates their column name too)
    npm run set-access [username] [full|own|readonly]   Set access level
    npm run set-type [username] [human|agent]           Set display type
    npm run gen-invite [minutes]               Generate a time-limited invite code (prompts for access/type)
    npm run gen-agent-token [username]         Generate a permanent MCP/agent token (default: first user)

  ${C.bold}Database:${C.reset}
    npm run export-data             Export board → 2dobetter-YYYY-MM-DD.json
    npm run export-data <file>      Export board → named file
    npm run import-data <file>      Import board from JSON ${C.yellow}(replaces ALL data)${C.reset}
    npm run purge-completed         Delete completed tasks (all, or older than N days)
    npm run purge-graveyard         Permanently delete archived lists from graveyard

  ${C.bold}Service:${C.reset}
    npm run restart                 Restart the server (auto-detects launchctl / systemctl)
    npm run service:install         Install as auto-start service
    npm run service:uninstall       Remove auto-start service
    npm run uninstall               ${C.red}Nuke — remove all app footprint from this machine${C.reset}
`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
const cmd = process.argv[2];
const dispatch = {
  'status':           () => { showStatus();    return Promise.resolve(); },
  'list-users':       () => { listUsers();     return Promise.resolve(); },
  'context':          () => { showContext();   return Promise.resolve(); },
  'gen-invite':       genInvite,
  'gen-agent-token':  genAgentToken,
  'reset-password':   resetPassword,
  'rename-user':      renameUser,
  'set-access':       setAccess,
  'set-type':         setType,
  'export-data':      exportData,
  'import-data':      importData,
  'purge-completed':  purgeCompleted,
  'purge-graveyard':  purgeGraveyard,
  'restart':          () => { restartService();    return Promise.resolve(); },
  'service:install':  () => { serviceInstall();   return Promise.resolve(); },
  'service:uninstall':() => { serviceUninstall(); return Promise.resolve(); },
};

if (dispatch[cmd]) {
  dispatch[cmd]().catch(e => {
    console.error(`\n  ${C.red}Error:${C.reset}`, e.message);
    process.exit(1);
  });
} else {
  printHelp();
}
