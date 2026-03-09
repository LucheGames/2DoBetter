#!/usr/bin/env node
// 2Do Better — Uninstall / nuke script
// Usage: npm run uninstall
//
// Removes all 2Do Better footprint from this machine EXCEPT shared tools
// (npm, node, git, Tailscale) and the app directory itself (can't delete the
// floor you're standing on — a final rm -rf command is printed at the end).
//
// Safe to run on EITHER Mac (launchd) or Linux/Ubuntu (systemd).
// Does NOT touch the other machine — run it there separately if needed.
'use strict';

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const readline      = require('readline');
const { spawnSync } = require('child_process');

const ROOT      = path.join(__dirname, '..');
const HOME      = os.homedir();
const PLATFORM  = process.platform; // 'darwin' | 'linux'

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green:  '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m',
};
const ok   = msg => console.log(`  ${C.green}✓${C.reset}  ${msg}`);
const warn = msg => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const info = msg => console.log(`  ${C.dim}${msg}${C.reset}`);
const fail = msg => console.log(`  ${C.red}✗${C.reset}  ${msg}`);

// ── Readline helper ───────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise(resolve => rl.question(`  ${question}: `, a => resolve(a.trim())));
}

// ── Platform detection ────────────────────────────────────────────────────────
const isMac   = PLATFORM === 'darwin';
const isLinux = PLATFORM === 'linux';

// Known paths
const LAUNCHAGENT_PLIST  = path.join(HOME, 'Library/LaunchAgents/com.luchegames.2dobetter.plist');
const SYSTEMD_UNIT       = path.join(HOME, '.config/systemd/user/2dobetter.service');
const LOG_GLOB_DIR       = path.join(HOME, 'Library/Logs');
const BACKUP_KEY_FILE    = path.join(HOME, '.2dobetter_backup_key');
const CLAUDE_JSON        = path.join(HOME, '.claude.json');
const CRON_MARKER        = '2dobetter';   // catches backup + any other 2dobetter cron entries
const DB_FILE            = path.join(ROOT, 'prisma', 'dev.db');

// ── Inventory — figure out what exists on THIS machine ───────────────────────
function buildInventory() {
  const inv = [];

  if (isMac && fs.existsSync(LAUNCHAGENT_PLIST)) {
    inv.push({ label: 'launchd service  (stopped + LaunchAgent plist removed)', key: 'launchd' });
  }
  if (isLinux && fs.existsSync(SYSTEMD_UNIT)) {
    inv.push({ label: 'systemd user service  (stopped, disabled, unit file removed)', key: 'systemd' });
  }

  // Check crontab for 2dobetter entries
  const crontab = spawnSync('crontab', ['-l'], { stdio: 'pipe', encoding: 'utf8' });
  const cronLines = (crontab.stdout || '').split('\n').filter(l => l.includes(CRON_MARKER));
  if (cronLines.length) {
    inv.push({ label: `cron job(s)  (${cronLines.length} entry/entries matching "${CRON_MARKER}")`, key: 'cron' });
  }

  if (isMac) {
    const logs = fs.existsSync(LOG_GLOB_DIR)
      ? fs.readdirSync(LOG_GLOB_DIR).filter(f => f.startsWith('2dobetter'))
      : [];
    if (logs.length) {
      inv.push({ label: `log files  (${logs.map(f => `~/Library/Logs/${f}`).join(', ')})`, key: 'logs' });
    }
  }

  if (fs.existsSync(BACKUP_KEY_FILE)) {
    inv.push({ label: `backup encryption key  (~/.2dobetter_backup_key)`, key: 'backupkey' });
  }

  if (fs.existsSync(CLAUDE_JSON)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8'));
      if (cfg.mcpServers && cfg.mcpServers['2dobetter']) {
        inv.push({ label: 'MCP server entry in ~/.claude.json', key: 'mcp' });
      }
    } catch (_) { /* not valid JSON — skip */ }
  }

  return inv;
}

// ── Backup DB ─────────────────────────────────────────────────────────────────
function backupDb() {
  if (!fs.existsSync(DB_FILE)) {
    warn('No database file found — nothing to back up.');
    return null;
  }
  const date    = new Date().toISOString().split('T')[0];
  const outPath = path.join(HOME, `Desktop/2dobetter-backup-${date}.db`);
  // Fall back to HOME if no Desktop
  const dest = fs.existsSync(path.join(HOME, 'Desktop')) ? outPath : path.join(HOME, `2dobetter-backup-${date}.db`);
  try {
    fs.copyFileSync(DB_FILE, dest);
    const kb = (fs.statSync(dest).size / 1024).toFixed(1);
    ok(`Database backed up → ${dest}  (${kb} KB)`);
    info('Import later with:  npm run import-data <file>  (after reinstall)');
    return dest;
  } catch (e) {
    fail(`Backup failed: ${e.message}`);
    return null;
  }
}

// ── Removal steps ─────────────────────────────────────────────────────────────
function stopAndRemoveLaunchd() {
  // Unload (stop + disable)
  const unload = spawnSync('launchctl', ['unload', LAUNCHAGENT_PLIST], { stdio: 'pipe' });
  if (unload.status !== 0) {
    // Try the older bootout path for macOS Ventura+
    spawnSync('launchctl', ['bootout', `gui/${process.getuid()}`, LAUNCHAGENT_PLIST], { stdio: 'pipe' });
  }
  // Remove plist from LaunchAgents
  try { fs.unlinkSync(LAUNCHAGENT_PLIST); } catch (_) {}
  ok('launchd service unloaded and plist removed');
}

function stopAndRemoveSystemd() {
  spawnSync('systemctl', ['--user', 'stop',    '2dobetter.service'], { stdio: 'pipe' });
  spawnSync('systemctl', ['--user', 'disable', '2dobetter.service'], { stdio: 'pipe' });
  try { fs.unlinkSync(SYSTEMD_UNIT); } catch (_) {}
  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });
  ok('systemd service stopped, disabled, unit file removed');
}

function removeCronEntries() {
  const current = spawnSync('crontab', ['-l'], { stdio: 'pipe', encoding: 'utf8' });
  const lines   = (current.stdout || '').split('\n');
  const cleaned = lines.filter(l => !l.includes(CRON_MARKER));
  if (cleaned.length === lines.length) {
    info('No cron entries to remove.');
    return;
  }
  const result = spawnSync('crontab', ['-'], { input: cleaned.join('\n') + '\n', stdio: 'pipe' });
  if (result.status === 0) {
    ok(`Removed ${lines.length - cleaned.length} cron entry/entries`);
  } else {
    warn('Could not update crontab automatically — remove 2dobetter entries manually with:  crontab -e');
  }
}

function removeLogs() {
  if (!fs.existsSync(LOG_GLOB_DIR)) return;
  const logs = fs.readdirSync(LOG_GLOB_DIR).filter(f => f.startsWith('2dobetter'));
  if (!logs.length) { info('No log files found.'); return; }
  logs.forEach(f => {
    try { fs.unlinkSync(path.join(LOG_GLOB_DIR, f)); } catch (_) {}
  });
  ok(`Removed ${logs.length} log file(s) from ~/Library/Logs/`);
}

function removeBackupKey() {
  try { fs.unlinkSync(BACKUP_KEY_FILE); ok('Removed ~/.2dobetter_backup_key'); }
  catch (_) { info('No backup key file found.'); }
}

function removeMcpEntry() {
  try {
    const raw = fs.readFileSync(CLAUDE_JSON, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg.mcpServers && cfg.mcpServers['2dobetter']) {
      delete cfg.mcpServers['2dobetter'];
      fs.writeFileSync(CLAUDE_JSON, JSON.stringify(cfg, null, 2));
      ok('Removed 2dobetter entry from ~/.claude.json');
    } else {
      info('No 2dobetter MCP entry found in ~/.claude.json');
    }
  } catch (e) {
    warn(`Could not update ~/.claude.json: ${e.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.red}  ╔══════════════════════════════════════╗
  ║   2 Do Better — Uninstall / Nuke    ║
  ╚══════════════════════════════════════╝${C.reset}\n`);

  const inventory = buildInventory();

  console.log(`  ${C.bold}This will permanently remove the following from this machine:${C.reset}\n`);
  inventory.forEach(i => console.log(`    ${C.yellow}•${C.reset}  ${i.label}`));
  console.log(`    ${C.yellow}•${C.reset}  App directory  ${C.dim}(${ROOT})${C.reset}  — you run this step manually\n`);

  console.log(`  ${C.dim}Will NOT touch: npm, node, git, Tailscale, other apps, remote machines${C.reset}\n`);

  if (isMac) {
    console.log(`  ${C.dim}CA cert in Keychain requires manual removal — instructions printed at end${C.reset}\n`);
  }
  if (isLinux) {
    console.log(`  ${C.dim}CA cert in system store requires manual removal — instructions printed at end${C.reset}\n`);
  }

  // ── Offer data backup ───────────────────────────────────────────────────────
  if (fs.existsSync(DB_FILE)) {
    const backup = await ask('Back up your data before deleting? (Y/n)');
    if (backup.toLowerCase() !== 'n') {
      console.log('');
      backupDb();
      console.log('');
    }
  }

  // ── Confirm ─────────────────────────────────────────────────────────────────
  console.log(`  ${C.bold}${C.red}This cannot be undone.${C.reset}`);
  const confirm = await ask(`Type ${C.bold}DELETE${C.reset} to confirm`);
  if (confirm !== 'DELETE') {
    console.log(`\n  Aborted — nothing was changed.\n`);
    rl.close();
    process.exit(0);
  }
  console.log('');

  // ── Execute ──────────────────────────────────────────────────────────────────
  const keys = inventory.map(i => i.key);

  if (keys.includes('launchd'))  stopAndRemoveLaunchd();
  if (keys.includes('systemd'))  stopAndRemoveSystemd();
  if (keys.includes('cron'))     removeCronEntries();
  if (keys.includes('logs'))     removeLogs();
  if (keys.includes('backupkey'))removeBackupKey();
  if (keys.includes('mcp'))      removeMcpEntry();

  // ── Final manual steps ───────────────────────────────────────────────────────
  console.log(`\n  ${C.bold}${C.green}Done.${C.reset}  One step left — delete the app directory:\n`);
  console.log(`  ${C.bold}${C.cyan}    rm -rf ${ROOT}${C.reset}\n`);

  if (isMac) {
    console.log(`  ${C.bold}To remove the CA cert from Keychain:${C.reset}`);
    info('  Open Keychain Access → search "2DoBetter" or "2dobetter" → right-click → Delete');
    console.log('');
  }
  if (isLinux) {
    console.log(`  ${C.bold}To remove the CA cert from system trust store:${C.reset}`);
    info('  sudo rm /usr/local/share/ca-certificates/2dobetter*.crt');
    info('  sudo update-ca-certificates --fresh');
    console.log('');
  }

  rl.close();
}

main().catch(e => {
  console.error(`\n  ${C.red}Error:${C.reset}`, e.message);
  rl.close();
  process.exit(1);
});
