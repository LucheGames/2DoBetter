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
const { spawnSync } = require('child_process');

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
  const a = await ask(`Choice [1–${choices.length}]`, '1');
  const n = parseInt(a, 10);
  return (n >= 1 && n <= choices.length) ? n - 1 : 0;
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
    token = crypto.randomBytes(24).toString('hex');
    console.log(`\n  ${C.bold}${C.yellow}Generated token — save this in your password manager:${C.reset}`);
    console.log(`\n  ${C.bold}  ${token}  ${C.reset}\n`);
    info('They\'ll paste this into the "Access token" field on the login screen.');
    await ask('Press Enter once you\'ve saved it');
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

  const token = await collectToken();

  users.push({ username, token });
  saveUsers(users);
  ok(`User "${username}" added to data/users.json`);
  info('They\'ll get their own column automatically on first login.');
  info('Restart the server to pick up the new user: npm start');

  console.log('');
  rl.close();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Subcommand: npm run setup add-user
  if (process.argv[2] === 'add-user') {
    await addUser();
    return;
  }

  console.log(`
${C.bold}${C.cyan}  ╔════════════════════════════════════╗
  ║    2Do Better — Setup Wizard  v2   ║
  ╚════════════════════════════════════╝${C.reset}
`);

  // Load existing config so we can preserve / show current values
  const existing = { ...parseEnv(ENV_FILE), ...parseEnv(ENV_LOCAL) };
  const existingUsers = loadUsers();

  if (existing.AUTH_TOKEN || existingUsers.length > 0) {
    warn('Existing configuration detected.');
    const redo = await ask('Reconfigure from scratch? (y/N)', 'N');
    if (redo.toLowerCase() !== 'y') {
      console.log('\n  Nothing changed. Existing config preserved.\n');
      info(`  To add more users: ${C.bold}npm run setup add-user${C.reset}`);
      console.log('');
      rl.close(); return;
    }
  }

  const cfg = {};   // will be merged into .env.local at the end
  const users = []; // will be written to data/users.json

  // ── [1/4] Identity & Access ──────────────────────────────────────
  step(1, 4, 'Identity & Access');
  info('Set up the first user — this will be your admin account.\n');

  const firstUsername = await ask('Username', existing.AUTH_USERNAME || os.userInfo().username);
  cfg.AUTH_USERNAME = firstUsername;

  const firstToken = await collectToken(existing);
  cfg.AUTH_TOKEN = firstToken;

  users.push({ username: firstUsername, token: firstToken });

  // Ask about additional users
  console.log('');
  let addMore = await ask('Add more users now? (y/N)', 'N');
  while (addMore.toLowerCase() === 'y') {
    console.log('');
    const uname = await ask('New username');
    if (!uname) { warn('Skipping — username cannot be empty.'); break; }
    if (users.some(u => u.username.toLowerCase() === uname.toLowerCase())) {
      warn(`User "${uname}" already exists — skipping.`);
    } else {
      const tok = await collectToken();
      users.push({ username: uname, token: tok });
      ok(`User "${uname}" added.`);
    }
    addMore = await ask('Add another user? (y/N)', 'N');
  }

  if (users.length > 1) {
    info(`${users.length} users configured. Each gets their own column on first login.`);
  }

  // ── [2/4] Backups ────────────────────────────────────────────────
  step(2, 4, 'Database Backups');
  info('Daily snapshots protect you if the server dies or data gets corrupted.\n');

  const backupChoice = await askChoice(
    'Where should backups be saved?',
    ['Google Drive  (via rclone)', 'Local folder only', 'Skip for now']
  );
  const backupDest = ['gdrive', 'local', 'none'][backupChoice];

  let effectiveDest = backupDest;

  if (backupDest === 'gdrive') {
    const rcloneOk = spawnSync('which', ['rclone']).status === 0;
    if (!rcloneOk) {
      warn('rclone is not installed.');
      info('Install it: curl https://rclone.org/install.sh | sudo bash');
      info('Then re-run: npm run setup');
      effectiveDest = 'local';
      ok('Falling back to local-only backups.');
    } else {
      const remotes = spawnSync('rclone', ['listremotes']).stdout?.toString() || '';
      if (!remotes.includes('gdrive:')) {
        warn('No rclone "gdrive" remote found.');
        info('On a machine with a browser, run:  rclone authorize "drive"');
        info('Copy the token to this server:     rclone config  →  name: gdrive, type: drive');
        info('Then re-run:                       npm run setup');
        effectiveDest = 'local';
        ok('Falling back to local-only backups.');
      } else {
        ok('rclone gdrive remote found — backups will go to Google Drive.');
      }
    }
  }

  // ── [3/4] Encryption ─────────────────────────────────────────────
  step(3, 4, 'Backup Encryption');
  let encrypt = false;

  if (effectiveDest !== 'none') {
    info('AES-256 encryption means nobody can read your backups without your key.');
    info('⚠  If you lose the key, the backups cannot be decrypted — save it safely.\n');

    const encChoice = await ask('Encrypt backups? (Y/n)', 'Y');
    encrypt = encChoice.toLowerCase() !== 'n';

    if (encrypt) {
      const key = crypto.randomBytes(32).toString('base64');
      fs.writeFileSync(KEY_FILE, key + '\n', { mode: 0o600 });

      console.log(`\n  ${C.bold}${C.yellow}⚠  SAVE THIS KEY IN YOUR PASSWORD MANAGER NOW${C.reset}`);
      console.log(`\n  ${C.bold}  ${key}  ${C.reset}\n`);
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

  // ── [4/4] External Access ─────────────────────────────────────────
  step(4, 4, 'External Access (Tailscale)');
  info('Tailscale lets you reach 2Do Better from any device — no firewall ports needed.\n');

  const tsInstalled = spawnSync('which', ['tailscale']).status === 0;
  if (tsInstalled) {
    const tsIp = spawnSync('tailscale', ['ip', '-4']).stdout?.toString().trim();
    ok(`Tailscale is installed. Your Tailscale IP: ${tsIp || 'unknown'}`);
    if (tsIp) {
      const port = existing.PORT || '3000';
      info(`Access from other Tailscale devices: https://${tsIp}:${port}`);
      info(`Set APP_DOMAIN=${tsIp} in .env.local for accurate cert generation.`);
    }
  } else {
    info('Tailscale is not installed on this machine.');
    info('  Install:  https://tailscale.com/download');
    info('  Enable:   sudo tailscale up');
    info('  Then set APP_DOMAIN=<tailscale-ip> in .env.local and restart.');
  }

  // ── Write config ──────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(44));

  // Write data/users.json
  saveUsers(users);
  ok(`data/users.json written (${users.length} user${users.length !== 1 ? 's' : ''})`);

  // Write .env.local (preserves legacy AUTH_TOKEN for backward compat)
  const final = { ...existing, ...cfg };
  writeEnv(ENV_LOCAL, final);
  ok('.env.local written (chmod 600)');

  // ── Done ──────────────────────────────────────────────────────────
  const port = final.PORT || '3000';
  const userList = users.map(u => `    • ${u.username}`).join('\n');
  console.log(`
${C.bold}${C.green}  ✓ Setup complete!${C.reset}

  Users     :
${userList}
  Backups   : ${C.bold}${effectiveDest}${encrypt ? ' + AES-256 encryption' : ''}${C.reset}
  Tailscale : ${C.bold}${tsInstalled ? 'installed' : 'not installed'}${C.reset}

  ${C.bold}Add more users any time:${C.reset}
    npm run setup add-user

  ${C.bold}Start the server:${C.reset}
    npm start

  ${C.bold}Then open:${C.reset}
    https://localhost:${port}

  ${C.dim}First visit: browser will warn about the self-signed cert.
  Install the CA cert once: https://localhost:${port}/download-ca-cert${C.reset}
`);

  rl.close();
}

main().catch(err => {
  console.error(`\n  ${C.red}Setup failed:${C.reset}`, err.message);
  rl.close();
  process.exit(1);
});
