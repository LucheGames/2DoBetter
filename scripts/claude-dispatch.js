#!/usr/bin/env node
/**
 * claude-dispatch — polls a 2DoBetter "Queue" list and fires Claude Code tasks.
 *
 * Config: ~/.claude-dispatch.json  (or .claude-dispatch.json next to this script)
 * See scripts/claude-dispatch-example.json for the full config reference.
 *
 * ── Task syntax (task title in 2DoBetter) ────────────────────────────────────
 *   "check deploy logs"                      → --continue -p "..." in defaultRepo
 *   "--resume abc1234 check deploy logs"     → --resume <id> -p "..."
 *   "~/Repos/Lazear: run evals"              → --continue in that repo
 *   "--resume abc1234 ~/Repos/Foo: fix bug"  → --resume + custom repo
 *
 * ── Result format ─────────────────────────────────────────────────────────────
 *   A new task appears in the Results list:
 *   "[abc12345] First 400 chars of Claude's response..."
 *   The session ID prefix lets you --resume the session interactively.
 *
 * ── Usage cap handling ────────────────────────────────────────────────────────
 *   When Claude hits a usage/rate-limit error the task stays in Queue and the
 *   daemon backs off for retryCapMs (default 5 min) before retrying.
 *
 * ── LaunchAgent (Mac) ─────────────────────────────────────────────────────────
 *   Install once to keep the daemon alive across reboots:
 *
 *   1. Find your node binary:
 *        which node    (or: ~/.nvm/versions/node/v20.*/bin/node)
 *
 *   2. Create ~/Library/LaunchAgents/com.2dobetter.dispatch.plist:
 *
 *      <?xml version="1.0" encoding="UTF-8"?>
 *      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 *        "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
 *      <plist version="1.0"><dict>
 *        <key>Label</key><string>com.2dobetter.dispatch</string>
 *        <key>ProgramArguments</key><array>
 *          <string>/Users/YOU/.nvm/versions/node/v20.X.Y/bin/node</string>
 *          <string>/Users/YOU/_Repos/ToDoBetter/scripts/claude-dispatch.js</string>
 *        </array>
 *        <key>EnvironmentVariables</key><dict>
 *          <key>HOME</key><string>/Users/YOU</string>
 *          <key>PATH</key><string>/Users/YOU/.nvm/versions/node/v20.X.Y/bin:/usr/local/bin:/usr/bin:/bin</string>
 *        </dict>
 *        <key>RunAtLoad</key><true/>
 *        <key>KeepAlive</key><true/>
 *        <key>StandardOutPath</key><string>/tmp/claude-dispatch.log</string>
 *        <key>StandardErrorPath</key><string>/tmp/claude-dispatch.err</string>
 *      </dict></plist>
 *
 *   3. Load it:
 *        launchctl load ~/Library/LaunchAgents/com.2dobetter.dispatch.plist
 *
 *   4. Tail logs:
 *        tail -f /tmp/claude-dispatch.log
 */

'use strict';

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');

// ── Config loading ────────────────────────────────────────────────────────────

const CONFIG_PATHS = [
  path.join(os.homedir(), '.claude-dispatch.json'),
  path.join(__dirname, '..', '.claude-dispatch.json'),
];

let config;
for (const p of CONFIG_PATHS) {
  if (fs.existsSync(p)) {
    config = JSON.parse(fs.readFileSync(p, 'utf8'));
    log(`Config loaded from ${p}`);
    break;
  }
}
if (!config) {
  console.error('No config found. Create ~/.claude-dispatch.json (see scripts/claude-dispatch-example.json)');
  process.exit(1);
}

const {
  apiBase,
  agentToken,
  columnSlug      = 'claude',
  queueListName   = 'Queue',
  activeListName  = 'Active',
  resultsListName = 'Results',
  defaultRepo,
  pollMs          = 30_000,
  retryCapMs      = 300_000,  // 5 min back-off after usage cap
} = config;

if (!apiBase || !agentToken || !defaultRepo) {
  console.error('Config must include apiBase, agentToken, and defaultRepo');
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────────────────────────

let queueListId   = null;
let activeListId  = null;
let resultsListId = null;
let capUntil      = 0;   // epoch ms — skip queue until cap window clears

// ── API helpers ───────────────────────────────────────────────────────────────

async function api(method, route, body) {
  const url  = `${apiBase}${route}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${agentToken}`,
      'Content-Type':  'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${method} ${route} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ── List bootstrapping ────────────────────────────────────────────────────────

async function ensureLists() {
  const { columns } = await api('GET', '/api/overview');

  // Find Claude's column by slug or ownerUsername
  const col = columns.find(c => c.slug === columnSlug || c.ownerUsername === columnSlug);
  if (!col) throw new Error(`Column '${columnSlug}' not found — check columnSlug in config`);

  for (const name of [queueListName, activeListName, resultsListName]) {
    let list = col.lists.find(l => l.name === name);
    if (!list) {
      list = await api('POST', '/api/lists', { name, columnId: col.id });
      log(`Created list: "${name}" (id ${list.id})`);
    }
    if (name === queueListName)   queueListId   = list.id;
    if (name === activeListName)  activeListId  = list.id;
    if (name === resultsListName) resultsListId = list.id;
  }
  log(`Queue=${queueListId}  Active=${activeListId}  Results=${resultsListId}`);
}

// ── Task parsing ──────────────────────────────────────────────────────────────

function parseTask(title) {
  // Returns { resumeId, repo, prompt }
  let text = title.trim();
  let resumeId = null;
  let repo = path.resolve(defaultRepo.replace(/^~/, os.homedir()));

  // --resume <id>
  const resumeMatch = text.match(/^--resume\s+(\S+)\s*/);
  if (resumeMatch) {
    resumeId = resumeMatch[1];
    text = text.slice(resumeMatch[0].length);
  }

  // ~/path/to/repo: prompt  OR  /abs/path: prompt
  const repoMatch = text.match(/^([~\/]\S+?):\s+/);
  if (repoMatch) {
    repo = path.resolve(repoMatch[1].replace(/^~/, os.homedir()));
    text = text.slice(repoMatch[0].length);
  }

  return { resumeId, repo, prompt: text };
}

// ── Claude runner ─────────────────────────────────────────────────────────────

function runClaude({ resumeId, repo, prompt }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json'];
    if (resumeId) {
      args.push('--resume', resumeId);
    } else {
      args.push('--continue');
    }

    log(`▶ claude ${args.join(' ')}`);
    log(`  cwd: ${repo}`);

    // Build a PATH that includes nvm node + common bin dirs
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
    const nvmBin = (() => {
      try {
        const alias = path.join(nvmDir, 'alias', 'default');
        if (fs.existsSync(alias)) {
          const ver = fs.readFileSync(alias, 'utf8').trim().replace(/^v/, '');
          return path.join(nvmDir, 'versions', 'node', `v${ver}`, 'bin');
        }
      } catch {}
      return '';
    })();

    const PATH = [
      nvmBin,
      path.join(os.homedir(), '.nvm', 'versions', 'node', 'v20', 'bin'),  // fallback
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      process.env.PATH || '',
    ].filter(Boolean).join(':');

    const proc = spawn('claude', args, {
      cwd: repo,
      env: { ...process.env, HOME: os.homedir(), PATH },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('error', err => {
      reject({ isCapHit: false, message: `spawn failed: ${err.message}`, stderr: '' });
    });

    proc.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          // Non-JSON output (e.g. --output-format text fallback)
          resolve({ result: stdout.trim(), session_id: null });
        }
      } else {
        const combined = (stdout + stderr).toLowerCase();
        const isCapHit = /usage limit|rate.?limit|quota|capacity|overloaded/i.test(combined);
        reject({ isCapHit, code, message: stderr.trim() || stdout.trim() });
      }
    });
  });
}

// ── Queue processor ───────────────────────────────────────────────────────────

let processing = false;

async function processQueue() {
  if (processing) return;

  if (Date.now() < capUntil) {
    const secsLeft = Math.ceil((capUntil - Date.now()) / 1000);
    log(`Usage cap back-off: ${secsLeft}s remaining`);
    return;
  }

  processing = true;
  try {
    const tasks = await api('GET', `/api/lists/${queueListId}/tasks`);
    const pending = tasks.filter(t => !t.completed);

    if (pending.length === 0) return;
    log(`${pending.length} task(s) in queue`);

    for (const task of pending) {
      log(`Processing: "${task.title}"`);
      const parsed = parseTask(task.title);

      // Move to Active so mobile shows it's running
      await api('PATCH', `/api/tasks/${task.id}`, { listId: activeListId });

      try {
        const result = await runClaude(parsed);

        const sessionId   = result.session_id || result.sessionId || 'unknown';
        const shortId     = String(sessionId).slice(0, 8);
        const responseText = (result.result || result.response || JSON.stringify(result)).trim();
        const preview     = responseText.length > 400
          ? responseText.slice(0, 397) + '...'
          : responseText;

        // Post result
        await api('POST', `/api/lists/${resultsListId}/tasks`, {
          title: `[${shortId}] ${preview}`,
        });

        // Complete the original task
        await api('PATCH', `/api/tasks/${task.id}`, { completed: true });

        log(`✓ Done  session=${sessionId}`);

      } catch (err) {
        if (err.isCapHit) {
          capUntil = Date.now() + retryCapMs;
          log(`⏸ Usage cap hit — retry after ${retryCapMs / 1000}s`);
          // Move task back to Queue so it retries
          await api('PATCH', `/api/tasks/${task.id}`, { listId: queueListId });
          // Leave a breadcrumb in Results
          await api('POST', `/api/lists/${resultsListId}/tasks`, {
            title: `[cap] retrying in ${retryCapMs / 60_000}m: "${task.title.slice(0, 200)}"`,
          });
          break; // stop processing more tasks this cycle
        } else {
          log(`✗ Error: ${err.message}`);
          const errorPreview = (err.message || 'unknown error').slice(0, 380);
          await api('POST', `/api/lists/${resultsListId}/tasks`, {
            title: `[error] ${errorPreview}`,
          });
          await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
        }
      }
    }
  } catch (err) {
    log(`Poll error: ${err.message}`);
  } finally {
    processing = false;
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('claude-dispatch starting');
  await ensureLists();
  log(`Polling every ${pollMs / 1000}s  •  Cap back-off ${retryCapMs / 1000}s`);
  log(`Default repo: ${defaultRepo}`);

  await processQueue();
  setInterval(processQueue, pollMs);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
