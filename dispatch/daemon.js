#!/usr/bin/env node
/**
 * claude-dispatch — polls a 2DoBetter "Queue" list and fires Claude Code tasks.
 *
 * Config: ~/.claude-dispatch.json  (or dispatch/.claude-dispatch.json)
 * See dispatch/config-example.json for the full config reference.
 *
 * ── Task syntax (task title in 2DoBetter) ────────────────────────────────────
 *   "check deploy logs"                      → fresh session, defaultRepo
 *   "--resume abc1234 check deploy logs"     → resume specific session
 *   "~/Repos/Lazear: run evals"              → fresh session, different repo
 *   "--resume abc1234 ~/Repos/Foo: fix bug"  → resume + different repo
 *
 * ── Result format ─────────────────────────────────────────────────────────────
 *   A new task appears in the Results list:
 *   "[abc12345] First 400 chars of Claude's response..."
 *   The session ID prefix lets you --resume the session interactively.
 *
 * ── Usage cap handling ────────────────────────────────────────────────────────
 *   Claude Code limits reset every 5 hours. On a cap hit the task is held
 *   until :01 past the next hour, then retried. After 5 failures the task is
 *   posted to Results as [weekly-cap] — weekly limit likely exhausted.
 *
 * ── LaunchAgent (Mac) ─────────────────────────────────────────────────────────
 *   Install once to keep the daemon alive across reboots:
 *
 *   1. Find your node binary:
 *        which node    (or: ~/.nvm/versions/node/v20.X.Y/bin/node)
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
 *          <string>/Users/YOU/_Repos/ToDoBetter/dispatch/daemon.js</string>
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
// Priority: ~/.claude-dispatch.json overrides auto-detected values.
// Auto-detection reads API_BASE_URL + AUTH_TOKEN from the 2dobetter MCP entry
// in ~/.claude.json — the same values the MCP server already uses.

function loadClaudeJson() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
    const servers = raw.mcpServers || {};
    const entry = Object.values(servers).find(s =>
      (s.env || {}).API_BASE_URL && (s.env || {}).AUTH_TOKEN
    );
    if (entry) return entry.env;
  } catch {}
  return {};
}

const claudeEnv = loadClaudeJson();

const CONFIG_PATHS = [
  path.join(os.homedir(), '.claude-dispatch.json'),
  path.join(__dirname, '..', '.claude-dispatch.json'),
];

let userConfig = {};
for (const p of CONFIG_PATHS) {
  if (fs.existsSync(p)) {
    userConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
    log(`Config loaded from ${p}`);
    break;
  }
}

const config = { ...userConfig };

// Fill in from MCP config if not set manually
const apiBase    = config.apiBase    || claudeEnv.API_BASE_URL;
const agentToken = config.agentToken || claudeEnv.AUTH_TOKEN;
const defaultRepo = config.defaultRepo || path.resolve(__dirname, '..');

const {
  columnSlug      = 'claude',
  queueListName   = 'Queue',
  activeListName  = 'Active',
  resultsListName = 'Results',
  pollMs          = 30_000,
  model           = 'sonnet',
} = config;

const MAX_CAP_RETRIES = 5;  // 5h windows in a week — give up after this many

if (!apiBase || !agentToken) {
  console.error(
    'Cannot find API URL or auth token.\n' +
    'Either configure the 2dobetter MCP server in Claude Code, or create\n' +
    '~/.claude-dispatch.json with apiBase and agentToken fields.'
  );
  process.exit(1);
}

// 2DoBetter uses a self-signed cert — bypass TLS verification (same as MCP server)
if (!apiBase.includes('localhost')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// ── State ─────────────────────────────────────────────────────────────────────

let queueListId   = null;
let activeListId  = null;
let resultsListId = null;
// taskId → { count: number, retryAfter: epochMs }
const capRetries = new Map();

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

  // Rescue any tasks left in Active from a previous crashed run
  const stuck = await api('GET', `/api/lists/${activeListId}/tasks`);
  const orphans = stuck.filter(t => !t.completed);
  for (const t of orphans) {
    // Strip any timestamp prefix we may have added before moving back
    const cleanTitle = t.title.replace(/^\[\d{2}:\d{2} ▶\] /, '');
    await api('PATCH', `/api/tasks/${t.id}`, { listId: queueListId, title: cleanTitle });
    log(`Rescued orphaned task: "${cleanTitle}"`);
  }
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
    // Fresh session by default — avoids loading huge prior context.
    // Use "--resume <id>" prefix in the task title to continue a specific session.
    const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--max-turns', '10'];
    if (resumeId) {
      args.push('--resume', resumeId);
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

// Returns epoch ms for :01 past the next top-of-hour (when 5h cap resets)
function nextHourPlusOne() {
  const d = new Date();
  d.setMinutes(1, 0, 0);
  if (new Date().getMinutes() >= 1) d.setHours(d.getHours() + 1);
  return d.getTime();
}

// Completes Results tasks older than 24h — keeps the list from ballooning
async function culResults() {
  const tasks = await api('GET', `/api/lists/${resultsListId}/tasks`);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const t of tasks) {
    if (!t.completed && new Date(t.createdAt).getTime() < cutoff) {
      await api('PATCH', `/api/tasks/${t.id}`, { completed: true });
    }
  }
}

// ── Queue processor ───────────────────────────────────────────────────────────

let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    await culResults();
    const tasks = await api('GET', `/api/lists/${queueListId}/tasks`);
    const pending = tasks.filter(t => !t.completed);

    if (pending.length === 0) return;
    log(`${pending.length} task(s) in queue`);

    for (const task of pending) {
      // Skip tasks still waiting for their hourly retry window
      const capState = capRetries.get(task.id);
      if (capState && Date.now() < capState.retryAfter) {
        const minsLeft = Math.ceil((capState.retryAfter - Date.now()) / 60_000);
        log(`Skipping "${task.title}" — cap retry in ${minsLeft}m (attempt ${capState.count}/${MAX_CAP_RETRIES})`);
        continue;
      }

      log(`Processing: "${task.title}"`);
      const parsed = parseTask(task.title);

      // Move to Active with a timestamp so mobile shows what's running and when it started
      const startTime = new Date().toISOString().slice(11, 16);
      await api('PATCH', `/api/tasks/${task.id}`, {
        listId: activeListId,
        title: `[${startTime} ▶] ${task.title}`,
      });

      try {
        const result = await runClaude(parsed);

        // Restore clean title before completing (strip the [HH:MM ▶] prefix)
        await api('PATCH', `/api/tasks/${task.id}`, { title: task.title });

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
          const prev = capRetries.get(task.id) || { count: 0 };
          const count = prev.count + 1;
          if (count < MAX_CAP_RETRIES) {
            const retryAfter = nextHourPlusOne();
            capRetries.set(task.id, { count, retryAfter });
            const retryTime = new Date(retryAfter).toISOString().slice(11, 16);
            log(`⏸ Cap hit (${count}/${MAX_CAP_RETRIES}) — will retry at ${retryTime} UTC`);
            await api('PATCH', `/api/tasks/${task.id}`, { listId: queueListId });
          } else {
            log(`✗ Cap hit ${MAX_CAP_RETRIES} times — weekly limit likely exhausted`);
            capRetries.delete(task.id);
            await api('POST', `/api/lists/${resultsListId}/tasks`, {
              title: `[weekly-cap] gave up after ${MAX_CAP_RETRIES} attempts: "${task.title.slice(0, 180)}"`,
            });
            await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
          }
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
  log(`Polling every ${pollMs / 1000}s  •  Model: ${model}  •  Cap retry: hourly x${MAX_CAP_RETRIES}`);
  log(`Default repo: ${defaultRepo}`);

  await processQueue();
  setInterval(processQueue, pollMs);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
