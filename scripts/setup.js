#!/usr/bin/env node
// 2Do Better — First-run setup wizard
// Usage: npm run setup           (full setup)
//        npm run setup add-user  (add a user to an existing install)
'use strict';

const readline = require('readline');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { spawnSync, spawn } = require('child_process');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  console.error('\n  ✗  bcryptjs is not installed. Run:  npm install\n');
  process.exit(1);
}

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT          = path.join(__dirname, '..');
const ENV_FILE      = path.join(ROOT, '.env');
const ENV_LOCAL     = path.join(ROOT, '.env.local');
const DATA_DIR      = path.join(ROOT, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const SCRIPTS_DIR   = path.join(ROOT, 'scripts');
const BACKUP_SCRIPT = path.join(SCRIPTS_DIR, 'backup-db.sh');
const KEY_FILE      = path.join(os.homedir(), '.2dobetter_backup_key');
const CRON_MARKER   = '2dobetter-backup';

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',  bold:   '\x1b[1m',  dim:    '\x1b[2m',
  green:  '\x1b[32m', yellow: '\x1b[33m', cyan:   '\x1b[36m',
  red:    '\x1b[31m',
};
const ok   = msg => console.log(`  ${C.green}✓${C.reset}  ${msg}`);
const warn = msg => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const info = msg => console.log(`  ${C.dim}${msg}${C.reset}`);
const step = (n, t, label) => {
  console.log(`\n${C.bold}[${n}/${t}] ${label}${C.reset}`);
  console.log('─'.repeat(44));
};

// ── readline helpers ──────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultVal = '') {
  const hint = defaultVal ? ` ${C.dim}[${defaultVal}]${C.reset}` : '';
  return new Promise(resolve =>
    rl.question(`  ${question}${hint}: `, a => resolve(a.trim() || defaultVal))
  );
}

function askSecret(label) {
  return new Promise(resolve => {
    process.stdout.write(`  ${label}: `);
    const stdin = process.openStdin();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let buf = '';
    stdin.on('data', function handler(ch) {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '\x7f') {
        if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
      } else if (ch === '\x03') {
        process.exit();
      } else {
        buf += ch;
        process.stdout.write('*');
      }
    });
  });
}

async function askChoice(question, choices) {
  console.log(`  ${question}`);
  choices.forEach((c, i) => console.log(`    ${i + 1}) ${c}`));
  while (true) {
    const a = await ask(`Choice [1–${choices.length}]`);
    const n = parseInt(a, 10);
    if (n >= 1 && n <= choices.length) return n - 1;
    console.log(`  ${C.yellow}Please enter a number between 1 and ${choices.length}.${C.reset}`);
  }
}

// ── .env parser / writer ──────────────────────────────────────────────────────
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

function writeEnv(file, obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(file, lines, { mode: 0o600 });
}

// ── users.json helpers ───────────────────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

function saveUsers(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

// ── SQLite helper (uses sqlite3 CLI; no Prisma needed) ────────────────────────
const DB_PATH = path.join(ROOT, 'prisma', 'dev.db');

function runSql(sql) {
  if (!fs.existsSync(DB_PATH)) return { ok: false, out: '' };
  const result = spawnSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
  if (result.error) return { ok: false, out: '' }; // sqlite3 CLI not installed
  return { ok: true, out: result.stdout.trim() };
}

// ── Shared column naming helper ───────────────────────────────────────────────
// Returns "Shared 01", "Shared 02", … whichever is unused.
function nextSharedName() {
  var result = runSql("SELECT name FROM \"Column\" WHERE name LIKE 'Shared %'");
  var existing = [];
  if (result.ok && result.out) {
    existing = result.out.split('\n').filter(function(n) { return n.trim(); });
  }
  var n = 1;
  while (true) {
    var candidate = 'Shared ' + (n < 10 ? '0' + n : '' + n);
    if (existing.indexOf(candidate) === -1) return candidate;
    n++;
  }
}

// ── Token collection helper ───────────────────────────────────────────────────
async function collectToken(existing) {
  const tokenMode = await askChoice(
    'Access token (this user\'s login password):',
    ['I\'ll set my own passphrase', 'Generate a random secure token']
  );

  let token;
  if (tokenMode === 0) {
    let t1, t2;
    do {
      t1 = await askSecret('Passphrase');
      t2 = await askSecret('Confirm passphrase');
      if (t1 !== t2)        warn('Passphrases do not match — try again.');
      else if (t1.length < 8) warn('Use at least 8 characters.');
    } while (t1 !== t2 || t1.length < 8);
    token = t1;
    ok(`Passphrase accepted (${t1.length} characters)`);
  } else {
    // 3 groups of 4 hex chars = 12 chars total, e.g. "a3f2-7b91-4e28"
    // Easy to read aloud, share over chat, or type on mobile.
    const parts = [
      crypto.randomBytes(2).toString('hex'),
      crypto.randomBytes(2).toString('hex'),
      crypto.randomBytes(2).toString('hex'),
    ];
    token = parts.join('-');
    console.log(`\n  ${C.bold}${C.yellow}Generated password — share this with the new user:${C.reset}`);
    console.log(`\n  ${C.bold}${C.cyan}  ${token}  ${C.reset}\n`);
    info('(right-click → Copy to copy the token — Ctrl+C will exit the wizard)');
    info('They type this into the Password field on the login screen.');
    info('They can change it later (currently: ask admin to run npm run reset-password).');
    await ask('Press Enter once you\'ve shared it');
  }
  return token;
}

// ── Backup script generator ───────────────────────────────────────────────────
function writeBackupScript(dest, encrypt) {
  const dbPath    = path.join(ROOT, 'prisma', 'dev.db');
  const backupDir = path.join(ROOT, 'backups');
  const logFile   = path.join(ROOT, 'logs', 'backup.log');
  const remote    = dest === 'gdrive' ? 'gdrive:2DoBetter-backups' : backupDir;
  const ext       = encrypt ? '.db.enc' : '.db';
  const decryptNote = encrypt
    ? `# Decrypt: openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in FILE.db.enc -out restored.db -pass file:${KEY_FILE}`
    : '';

  const script = `#!/bin/bash
# 2Do Better — database backup  (generated by npm run setup)
${decryptNote}
set -euo pipefail

DB_PATH="${dbPath}"
BACKUP_DIR="${backupDir}"
LOG_FILE="${logFile}"
REMOTE="${remote}"
RETAIN_DAYS=30
${encrypt ? `KEY_FILE="${KEY_FILE}"` : ''}

mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
log() { echo "[$(date +"%Y-%m-%d %H:%M:%S")] $*" | tee -a "$LOG_FILE"; }

${encrypt ? `if [ ! -f "$KEY_FILE" ]; then log "ERROR: key file missing — aborting"; exit 1; fi` : ''}

log "=== Backup started ==="

STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
SNAP="$BACKUP_DIR/dev_\${STAMP}.db"
sqlite3 "$DB_PATH" ".backup $SNAP"
log "Snapshot: $SNAP ($(du -sh "$SNAP" | cut -f1))"

${encrypt ? `ENCRYPTED="\${SNAP}.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \\
  -in "$SNAP" -out "$ENCRYPTED" -pass file:"$KEY_FILE"
rm "$SNAP"
log "Encrypted: $(basename "$ENCRYPTED")"
` : ''}
${dest === 'gdrive' ? `rclone copy "${encrypt ? '"$ENCRYPTED"' : '"$SNAP"'}" "$REMOTE/" --log-level INFO 2>&1 | tee -a "$LOG_FILE"
log "Uploaded to $REMOTE/"
` : ''}
find "$BACKUP_DIR" -name "dev_*${ext}" -mtime +$RETAIN_DAYS -delete
log "Pruned backups older than \${RETAIN_DAYS} days"
log "=== Backup complete ==="
`;

  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.writeFileSync(BACKUP_SCRIPT, script, { mode: 0o755 });
}

function installCron() {
  const existing = spawnSync('crontab', ['-l']).stdout?.toString() || '';
  const clean    = existing.split('\n').filter(l => !l.includes(CRON_MARKER));
  const updated  = [...clean, `0 3 * * * ${BACKUP_SCRIPT} # ${CRON_MARKER}`].join('\n').trim();
  const result   = spawnSync('crontab', ['-'], { input: updated + '\n' });
  return result.status === 0;
}

// ── Service restart command detector ─────────────────────────────────────────
function isDocker() {
  return fs.existsSync('/.dockerenv');
}

function getRestartCommand() {
  // Inside a Docker container — user must restart from the host
  if (isDocker()) return 'docker compose restart';
  // macOS: check for installed launchd plist
  if (process.platform === 'darwin') {
    const plist = path.join(os.homedir(), 'Library/LaunchAgents/com.luchegames.2dobetter.plist');
    if (fs.existsSync(plist)) {
      return `launchctl kickstart -k gui/$(id -u)/com.luchegames.2dobetter`;
    }
  }
  // Linux: check for systemd user service
  if (process.platform === 'linux') {
    const r = spawnSync('systemctl', ['--user', 'cat', '2dobetter.service'], { stdio: 'pipe' });
    if (r.status === 0) {
      return 'systemctl --user restart 2dobetter.service';
    }
  }
  // Fallback: direct invocation (first-time launch or service not yet installed)
  return 'npm start';
}

// ── add-user subcommand ───────────────────────────────────────────────────────
async function addUser() {
  console.log(`
${C.bold}${C.cyan}  ╔════════════════════════════════════╗
  ║    2Do Better — Add User          ║
  ╚════════════════════════════════════╝${C.reset}
`);

  const users = loadUsers();
  if (users.length > 0) {
    console.log('  Current users:');
    users.forEach(u => console.log(`    • ${u.username}`));
    console.log('');
  }

  const username = await ask('New username');
  if (!username) { warn('Username cannot be empty.'); rl.close(); return; }

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    warn(`User "${username}" already exists.`);
    rl.close(); return;
  }

  const typeChoice = await askChoice('Account type:', ['Human', 'AI agent']);
  const isAgent = typeChoice === 1;

  const token = await collectToken();

  const hash = await bcrypt.hash(token, 12);
  const userObj = { username: username, hash: hash };
  if (isAgent) userObj.isAgent = true;
  users.push(userObj);
  saveUsers(users);
  ok(`User "${username}" added (${isAgent ? 'AI agent' : 'human'}).`);
  info('They\'ll get their own column automatically on first login.');
  console.log('');

  // Auto-restart so the live server picks up the new user immediately
  const restartCmd = getRestartCommand();
  if (restartCmd === 'npm start') {
    info('Server not running as a service. Start it with:  npm start');
  } else {
    process.stdout.write(`  Restarting server…`);
    const r = spawnSync('bash', ['-c', restartCmd], { stdio: 'pipe', encoding: 'utf8' });
    if (r.status === 0) {
      process.stdout.write(`  ${C.green}✓${C.reset}  Server restarted — new user is live.\n`);
    } else {
      process.stdout.write(`\n`);
      warn(`Restart failed (${r.stderr || r.error || 'unknown error'}).`);
      info(`Run manually:  ${restartCmd}`);
    }
  }

  console.log('');
  rl.close();
}

// ── remove-user subcommand ────────────────────────────────────────────────────
async function removeUser() {
  console.log(`
${C.bold}${C.cyan}  ╔════════════════════════════════════╗
  ║    2Do Better — Remove User       ║
  ╚════════════════════════════════════╝${C.reset}
`);

  const users = loadUsers();
  if (users.length === 0) {
    warn('No users configured.');
    rl.close(); return;
  }

  console.log('  Current users:');
  users.forEach(u => console.log(`    • ${u.username}`));
  console.log('');

  // argv[3] = username,  argv[4] = optional 'delete' flag
  let target = (process.argv[3] || '').trim();
  const deleteData = (process.argv[4] || '').toLowerCase() === 'delete';

  if (!target) {
    target = await ask('Username to remove');
  }
  if (!target) { warn('No username specified.'); rl.close(); return; }

  const idx = users.findIndex(u => u.username.toLowerCase() === target.toLowerCase());
  if (idx === -1) {
    warn(`User "${target}" not found.`);
    rl.close(); return;
  }

  const found = users[idx];
  const safeUser = found.username.replace(/'/g, "''");
  const colCheck = runSql(`SELECT name FROM "Column" WHERE ownerUsername = '${safeUser}' LIMIT 1`);
  const hasColumn = colCheck.ok && colCheck.out;

  // Pre-compute the target shared name so we can show it in the confirm prompt
  const sharedName = (!deleteData && hasColumn) ? nextSharedName() : null;

  // Single confirm — tell them exactly what will happen before they say y
  const colNote = !hasColumn ? ''
    : deleteData  ? ` Their column + all tasks will be deleted.`
    :               ` Their column will be renamed "${sharedName}" (shared team column).`;
  const confirm = await ask(`Remove "${found.username}"?${colNote} (y/n)`);
  if (confirm.toLowerCase() !== 'y') {
    console.log('\n  Cancelled — nothing changed.\n');
    rl.close(); return;
  }

  users.splice(idx, 1);
  saveUsers(users);
  ok(`User "${found.username}" removed`);

  // ── Handle their column in the database ────────────────────────────────────
  if (!colCheck.ok) {
    warn('sqlite3 CLI not available — column data was not touched.');
  } else if (hasColumn) {
    if (deleteData) {
      runSql(`DELETE FROM "Column" WHERE ownerUsername = '${safeUser}'`);
      ok(`Column "${colCheck.out}" and all its tasks deleted.`);
    } else {
      const safeName = sharedName.replace(/'/g, "''");
      runSql(`UPDATE "Column" SET ownerUsername = NULL, name = '${safeName}' WHERE ownerUsername = '${safeUser}'`);
      ok(`Column renamed to "${sharedName}" (shared team column).`);
    }
  }

  console.log('');
  const restartCmd = getRestartCommand();
  info(`Restart the server to invalidate their session:  ${restartCmd}`);
  console.log('');
  rl.close();
}

// ── TLS cert helper (called from both full run and early exit) ────────────────
function ensureCerts() {
  const certDir  = path.join(ROOT, 'certs');
  const certKey  = path.join(certDir, 'server.key');
  const certFile = path.join(certDir, 'server.crt');
  if (!fs.existsSync(certKey) || !fs.existsSync(certFile)) {
    console.log('\n' + '─'.repeat(44));
    info('Generating TLS certificates...');
    const certScript = path.join(ROOT, 'generate-certs.sh');
    const r = spawnSync('bash', [certScript], { stdio: 'inherit' });
    if (r.status !== 0) {
      warn('Certificate generation failed — server will start in HTTP mode.');
      warn('Run:  bash generate-certs.sh  to enable HTTPS later.');
    }
  } else {
    ok('TLS certificates already present — skipping cert generation.');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Subcommand routing
  if (process.argv[2] === 'add-user')    { await addUser();    return; }
  if (process.argv[2] === 'remove-user') { await removeUser(); return; }

  console.log(`
${C.bold}${C.cyan}  ╔════════════════════════════════════╗
  ║    2Do Better — Setup Wizard  v2   ║
  ╚════════════════════════════════════╝${C.reset}
`);

  // ── Offer clean DB wipe if one already exists ─────────────────────
  var freshInstall = false;
  if (fs.existsSync(DB_PATH)) {
    warn('Existing database found.');
    info('  y = delete everything and start fresh (new DB, new users)');
    info('  n = keep existing tasks but reconfigure users');
    const wipe = await ask('Wipe database? (y/n)');
    if (wipe.toLowerCase() === 'y') {
      fs.unlinkSync(DB_PATH);
      if (fs.existsSync(USERS_FILE)) fs.unlinkSync(USERS_FILE);
      freshInstall = true;
      ok('Database and users wiped — starting fresh.');
    } else {
      info('Keeping existing tasks. Old user columns will be cleaned up at the end.');
    }
  }

  // ── Run DB migrations ─────────────────────────────────────────────
  // Ensures the SQLite schema is up to date before we touch anything.
  info('Applying database migrations...');
  const migrateResult = spawnSync(
    process.execPath,
    [path.join(ROOT, 'node_modules', '.bin', 'prisma'), 'migrate', 'deploy'],
    { stdio: 'inherit', cwd: ROOT }
  );
  if (migrateResult.status !== 0) {
    warn('Migration failed — the app may not work correctly.');
    warn('Try running manually:  npx prisma migrate deploy');
  } else {
    ok('Database schema up to date.');
  }

  // Load existing config so we can preserve / show current values
  const existing = freshInstall ? {} : { ...parseEnv(ENV_FILE), ...parseEnv(ENV_LOCAL) };
  const existingUsers = loadUsers();

  // ── DB kept — offer to add users to existing setup ──────────────
  if (!freshInstall && existingUsers.length > 0) {
    console.log('  Current users:');
    existingUsers.forEach(function(u) {
      var role = u.isAdmin ? 'admin' : u.isAgent ? 'agent' : 'human';
      console.log('    \u2022 ' + u.username + ' (' + role + ')');
    });
    console.log('');

    const addMore = await ask('Add another user? (y/n)');
    if (addMore.toLowerCase() !== 'y') {
      console.log('\n  Nothing changed. Existing config preserved.\n');
      ensureCerts();
      rl.close(); return;
    }

    // Add new users to existing list
    const users = existingUsers.slice();
    while (true) {
      const uname = await ask('Username');
      if (!uname) { warn('Username cannot be empty — skipping.'); continue; }
      if (users.some(function(u) { return u.username.toLowerCase() === uname.toLowerCase(); })) {
        warn('User "' + uname + '" already exists — skipping.');
        continue;
      }

      const typeChoice = await askChoice('Account type:', ['Admin', 'Human user', 'AI agent']);
      const isAdmin = typeChoice === 0;
      const isAgent = typeChoice === 2;

      const tok = await collectToken();
      const hash = await bcrypt.hash(tok, 12);
      var userObj = { username: uname, hash: hash };
      if (isAdmin) userObj.isAdmin = true;
      if (isAgent) userObj.isAgent = true;
      users.push(userObj);
      ok('User "' + uname + '" added (' + (isAdmin ? 'admin' : isAgent ? 'agent' : 'human') + ').');

      console.log('');
      const another = await askChoice('Add another user?', ['Add another', 'Done']);
      if (another === 1) break;
    }

    saveUsers(users);
    ok('data/users.json updated (' + users.length + ' user' + (users.length !== 1 ? 's' : '') + ')');

    // Pre-create columns for new users
    if (fs.existsSync(DB_PATH)) {
      users.forEach(function(user) {
        var name = user.username.replace(/'/g, "''");
        var colCheck = runSql("SELECT id FROM \"Column\" WHERE ownerUsername = '" + name + "' LIMIT 1");
        if (colCheck.ok && colCheck.out) return;
        var maxOrder = runSql('SELECT COALESCE(MAX("order"), -1) FROM "Column"');
        var nextOrder = maxOrder.ok ? (parseInt(maxOrder.out, 10) + 1) : 0;
        var slug = user.username.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
        runSql("INSERT INTO \"Column\" (name, slug, \"order\", ownerUsername, locked, createdAt) VALUES ('" + name + "', '" + slug + "', " + nextOrder + ", '" + name + "', 0, datetime('now'))");
        var colId = runSql("SELECT id FROM \"Column\" WHERE slug = '" + slug + "' LIMIT 1");
        if (colId.ok && colId.out) {
          runSql("INSERT INTO \"List\" (columnId, name, \"order\", createdAt) VALUES (" + colId.out + ", 'Project', 0, datetime('now'))");
        }
        ok('Column pre-created for ' + user.username);
      });
    }

    ensureCerts();
    const addRestartCmd = getRestartCommand();
    console.log('\n  ' + C.bold + (isDocker() ? 'Restart the container:' : 'Restart the server:') + C.reset + '  ' + addRestartCmd);
    if (isDocker()) {
      info('Wait ~30s after restart for Next.js to initialise.');
    }
    console.log('');
    rl.close();
    return;
  }

  const cfg = {};   // will be merged into .env.local at the end
  const users = []; // will be written to data/users.json

  // ── Server port ───────────────────────────────────────────────────
  const existingPort = existing.PORT || '3000';
  const portChoice = await askChoice(
    `Server port (change if ${existingPort} is already in use on this machine):`,
    [`${existingPort === '3000' ? '3000 (default)' : existingPort}`, '4000', '8080', 'Enter a different port']
  );
  let chosenPort;
  if (portChoice === 3) {
    const custom = await ask('Port number', existingPort);
    chosenPort = custom.trim() || existingPort;
  } else {
    chosenPort = [existingPort === '3000' ? '3000' : existingPort, '4000', '8080'][portChoice] || existingPort;
    if (portChoice === 0) chosenPort = existingPort; // keep existing / default
  }
  cfg.PORT = chosenPort;
  ok(`Server port: ${chosenPort}`);
  if (chosenPort !== '3000') {
    const httpPort = String(parseInt(chosenPort, 10) + 1);
    warn(`Using port ${chosenPort}. If running Docker, also update docker-compose.yml:`);
    info(`  Change  "3000:3000"  →  "${chosenPort}:${chosenPort}"`);
    info(`  Change  "3001:3001"  →  "${httpPort}:${httpPort}"`);
  }

  // ── [1/5] Identity & Access ──────────────────────────────────────
  step(1, 3, 'Identity & Access');
  info('Set up the first user — this will be your admin account.\n');

  const firstUsername = await ask('Username', 'admin');
  cfg.AUTH_USERNAME = firstUsername;

  const firstToken = await collectToken(existing);
  cfg.AUTH_TOKEN = firstToken; // kept for legacy single-user mode fallback

  users.push({ username: firstUsername, hash: await bcrypt.hash(firstToken, 12), isAdmin: true });

  // Ask about additional human users
  while (true) {
    console.log('');
    const addChoice = await askChoice(
      'Add a teammate account?',
      ['Add human user', 'Done (add more users later from the admin panel)']
    );
    if (addChoice === 1) break;

    const uname = await ask('Username');
    if (!uname) { warn('Username cannot be empty — skipping.'); continue; }
    if (users.some(u => u.username.toLowerCase() === uname.toLowerCase())) {
      warn(`User "${uname}" already exists — skipping.`);
      continue;
    }
    const tok = await collectToken();
    users.push({ username: uname, hash: await bcrypt.hash(tok, 12) });
    ok(`User "${uname}" added.`);
  }

  if (users.length > 1) {
    info(`${users.length} users configured. Each gets their own column on first login.`);
  }

  // ── [2/4] Backups ────────────────────────────────────────────────
  step(2, 3, 'Database Backups');
  info('Daily snapshots of your database will be saved automatically.');
  info(`Backup folder: ${path.join(ROOT, 'backups')}  (14-day retention)\n`);
  info('You can point backups to Google Drive or another cloud destination later');
  info('by editing the generated script at scripts/backup-db.sh.\n');

  let effectiveDest = 'local';

  // ── [4/5] Encryption ─────────────────────────────────────────────
  step(3, 3, 'Backup Encryption');
  let encrypt = false;

  if (effectiveDest !== 'none') {
    info('AES-256 encryption means nobody can read your backups without your key.');
    info('⚠  If you lose the key, the backups cannot be decrypted — save it safely.\n');

    const encChoice = await ask('Encrypt backups? (y/n)');
    encrypt = encChoice.toLowerCase() === 'y';

    if (encrypt) {
      const key = crypto.randomBytes(32).toString('base64');
      fs.writeFileSync(KEY_FILE, key + '\n', { mode: 0o600 });

      console.log(`\n  ${C.bold}${C.yellow}⚠  SAVE THIS KEY IN YOUR PASSWORD MANAGER NOW${C.reset}`);
      console.log(`\n  ${C.bold}  ${key}  ${C.reset}\n`);
      info(`(right-click → Copy to copy the key — Ctrl+C will exit the wizard)`);
      info(`Also written to: ${KEY_FILE}  (chmod 600)`);
      info('Lose this key = lose your backups. There is no recovery path.');
      await ask('Press Enter once the key is safely stored');
      ok(`Encryption key written to ${KEY_FILE}`);
    }

    // Write backup script + cron
    writeBackupScript(effectiveDest, encrypt);
    ok(`Backup script written to ${BACKUP_SCRIPT}`);

    if (installCron()) {
      ok('Cron job installed — backups run daily at 3am');
    } else {
      warn('Could not install cron job automatically. Add this manually:');
      info(`  0 3 * * * ${BACKUP_SCRIPT}`);
    }
  } else {
    info('Backups skipped. You can re-run this wizard any time to enable them.');
  }

  // ── Generate TLS certs (if missing) ──────────────────────────────
  ensureCerts();

  // ── Write config ──────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(44));

  // Write data/users.json
  saveUsers(users);
  ok(`data/users.json written (${users.length} user${users.length !== 1 ? 's' : ''})`);

  // ── Clean up orphaned columns from previous wizard runs ───────────
  // Columns whose ownerUsername no longer matches any user are deleted
  // (cascades to all lists and tasks inside them).
  if (fs.existsSync(DB_PATH)) {
    var currentUsernames = users.map(function(u) { return u.username; });
    var allCols = runSql('SELECT id, name, ownerUsername FROM "Column" WHERE ownerUsername IS NOT NULL');
    if (allCols.ok && allCols.out) {
      allCols.out.split('\n').filter(Boolean).forEach(function(row) {
        var parts = row.split('|');
        if (parts.length < 3) return;
        var colId = parts[0].trim();
        var colOwner = parts[2].trim();
        if (currentUsernames.indexOf(colOwner) === -1) {
          runSql('DELETE FROM "Column" WHERE id = ' + colId);
          warn("Deleted column for '" + colOwner + "' (user no longer exists)");
        }
      });
    }
  }

  // ── Pre-create columns for all users ──────────────────────────────
  // Without this, columns only appear after each user's first login.
  if (fs.existsSync(DB_PATH)) {
    users.forEach(function(user) {
      var name = user.username.replace(/'/g, "''");
      var existing = runSql("SELECT id FROM \"Column\" WHERE ownerUsername = '" + name + "' LIMIT 1");
      if (existing.ok && existing.out) return; // column already exists
      var maxOrder = runSql('SELECT COALESCE(MAX("order"), -1) FROM "Column"');
      var nextOrder = maxOrder.ok ? (parseInt(maxOrder.out, 10) + 1) : 0;
      var slug = user.username.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
      runSql("INSERT INTO \"Column\" (name, slug, \"order\", ownerUsername, locked, createdAt) VALUES ('" + name + "', '" + slug + "', " + nextOrder + ", '" + name + "', 0, datetime('now'))");
      var colId = runSql("SELECT id FROM \"Column\" WHERE slug = '" + slug + "' LIMIT 1");
      if (colId.ok && colId.out) {
        runSql("INSERT INTO \"List\" (columnId, name, \"order\", createdAt) VALUES (" + colId.out + ", 'Project', 0, datetime('now'))");
      }
      ok("Column pre-created for " + user.username);
    });
  }

  // Write .env.local (preserves legacy AUTH_TOKEN for backward compat)
  const final = { ...existing, ...cfg };
  // Remove legacy INVITE_CODE if present (replaced by per-invite admin panel flow)
  delete final.INVITE_CODE;
  writeEnv(ENV_LOCAL, final);
  ok('.env.local written (chmod 600)');

  // ── Done ──────────────────────────────────────────────────────────
  const port = final.PORT || '3000';
  const userList = users.map(u => `    • ${u.username}`).join('\n');
  const certDir = path.join(ROOT, 'certs');
  const hasCerts = fs.existsSync(path.join(certDir, 'server.key')) && fs.existsSync(path.join(certDir, 'server.crt'));
  const protocol = hasCerts ? 'https' : 'http';
  const url = protocol + '://localhost:' + port;

  console.log('\n' + C.bold + C.green + '  ✓ Setup complete!' + C.reset + '\n');
  console.log('  Users     :');
  console.log(userList);
  console.log('  Backups   : ' + C.bold + path.join(ROOT, 'backups') + (encrypt ? ' — AES-256 encrypted' : '') + C.reset);
  console.log('');
  console.log('  ' + C.bold + 'Next steps:' + C.reset);
  console.log('    • Add teammates  — ⚙ admin panel → Generate setup code');
  console.log('    • Add AI agents  — ⚙ admin panel → + Agent');
  console.log('    • Remote access  — install Tailscale + DuckDNS (see README)');
  console.log('');

  if (isDocker()) {
    // Docker: user must restart the container from the host
    console.log('  ' + C.bold + C.yellow + 'YOU MUST restart the container now (run this on your host):' + C.reset);
    console.log('    docker compose restart');
    console.log('  ' + C.dim + 'Wait ~30s after restart for Next.js to initialise before opening.' + C.reset);
    console.log('');
    console.log('  ' + C.bold + 'Then open:' + C.reset);
    console.log('    ' + url);
    if (hasCerts) {
      console.log('');
      console.log('  ' + C.dim + 'First visit: browser will warn about the self-signed cert.' + C.reset);
    }
    console.log('');
    rl.close();
    return;
  }

  // Non-Docker: build and start automatically
  var restartCmd = getRestartCommand();
  var isService = restartCmd !== 'npm start';

  // ── Build ────────────────────────────────────────────────────────
  console.log('');
  console.log('  ' + C.bold + 'Building 2DoBetter...' + C.reset);
  console.log('  ' + C.dim + '─'.repeat(40) + C.reset);

  var buildCode = await new Promise(function(resolve) {
    var buildProc = spawn('bash', [path.join(ROOT, 'scripts', 'build.sh')], {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    buildProc.stdout.on('data', function(chunk) {
      chunk.toString().split('\n').forEach(function(line) {
        if (line.trim()) console.log('  ' + C.dim + line + C.reset);
      });
    });
    buildProc.stderr.on('data', function(chunk) {
      chunk.toString().split('\n').forEach(function(line) {
        if (line.trim()) console.log('  ' + C.dim + line + C.reset);
      });
    });
    buildProc.on('close', function(code) { resolve(code); });
  });

  console.log('  ' + C.dim + '─'.repeat(40) + C.reset);

  if (buildCode !== 0) {
    console.log('  ' + C.red + '✗' + C.reset + '  Build failed.');
    console.log('');
    console.log('  ' + C.bold + 'Run manually:' + C.reset);
    console.log('    npm run build && npm start');
    console.log('');
    rl.close();
    return;
  }
  ok('Build complete.');

  // ── Start ────────────────────────────────────────────────────────
  if (isService) {
    // Service-managed: just restart it
    process.stdout.write('  Restarting service...');
    var svcResult = spawnSync('bash', ['-c', restartCmd], { stdio: 'pipe', encoding: 'utf8' });
    if (svcResult.status === 0) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      ok('Service restarted.');
    } else {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      warn('Service restart failed. Try:  ' + restartCmd);
    }
  } else {
    // No service — launch server in the background
    info('Starting server...');
    var serverProc = spawn('node', [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      stdio: 'ignore',
      detached: true
    });
    serverProc.unref();
  }

  // ── Wait for server to respond ────────────────────────────────────
  var http2 = protocol === 'https' ? require('https') : require('http');
  var spinFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  var waitFrameIdx = 0;
  var waitSpinner = setInterval(function() {
    process.stdout.write('\r  ' + C.cyan + spinFrames[waitFrameIdx] + C.reset + '  Waiting for server...');
    waitFrameIdx = (waitFrameIdx + 1) % spinFrames.length;
  }, 80);

  var attempts = 0;
  var maxAttempts = 60; // 30 seconds
  function checkServer() {
    attempts++;
    var opts = { hostname: 'localhost', port: parseInt(port, 10), path: '/', method: 'GET', timeout: 2000 };
    if (protocol === 'https') opts.rejectUnauthorized = false;
    var req = http2.request(opts, function(res) {
      clearInterval(waitSpinner);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      // 200 or 302 (redirect to login) both mean it's up
      if (res.statusCode < 500) {
        ok('Server is running!');
        console.log('');
        console.log('  ' + C.bold + C.green + '  Open: ' + url + C.reset);
        if (hasCerts) {
          console.log('');
          console.log('  ' + C.dim + 'First visit: browser will warn about the self-signed cert.' + C.reset);
        }
      } else {
        console.log('  ' + C.yellow + '!' + C.reset + '  Server returned ' + res.statusCode + ' — it may still be initialising.');
        console.log('  ' + C.bold + 'Open: ' + url + C.reset);
      }
      console.log('');
      rl.close();
    });
    req.on('error', function() {
      if (attempts >= maxAttempts) {
        clearInterval(waitSpinner);
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        warn('Server not responding yet — it may need more time.');
        console.log('  ' + C.bold + 'Open when ready: ' + url + C.reset);
        console.log('');
        rl.close();
      } else {
        setTimeout(checkServer, 500);
      }
    });
    req.on('timeout', function() { req.abort(); });
    req.end();
  }
  checkServer();
}

main().catch(err => {
  console.error(`\n  ${C.red}Setup failed:${C.reset}`, err.message);
  rl.close();
  process.exit(1);
});
