#!/usr/bin/env node
/**
 * claude-runner — polls a 2DoBetter "Queue" list and fires Claude Code tasks.
 *
 * Config: ~/.claude-runner.json  (or dispatch/.claude-runner.json)
 * See runner/config-example.json for the full config reference.
 *
 * ── Task syntax (task title in 2DoBetter) ────────────────────────────────────
 *   "check deploy logs"                      → fresh session, defaultRepo
 *   "--continue check deploy logs"           → continue most recent CLI session
 *   "--resume abc1234 check deploy logs"     → resume specific session by ID
 *   "~/Repos/Lazear: run evals"              → fresh session, different repo
 *   "--resume abc1234 ~/Repos/Foo: fix bug"  → resume + different repo
 *
 * ── Result format ─────────────────────────────────────────────────────────────
 *   A completed task appears in the Results list:
 *   "✓ [abc12345] One-sentence summary of Claude's response"
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
 *   2. Create ~/Library/LaunchAgents/com.2dobetter.runner.plist:
 *
 *      <?xml version="1.0" encoding="UTF-8"?>
 *      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 *        "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
 *      <plist version="1.0"><dict>
 *        <key>Label</key><string>com.2dobetter.runner</string>
 *        <key>ProgramArguments</key><array>
 *          <string>/Users/YOU/.nvm/versions/node/v20.X.Y/bin/node</string>
 *          <string>/Users/YOU/_Repos/ToDoBetter/runner/daemon.js</string>
 *        </array>
 *        <key>EnvironmentVariables</key><dict>
 *          <key>HOME</key><string>/Users/YOU</string>
 *          <key>PATH</key><string>/Users/YOU/.nvm/versions/node/v20.X.Y/bin:/usr/local/bin:/usr/bin:/bin</string>
 *        </dict>
 *        <key>RunAtLoad</key><true/>
 *        <key>KeepAlive</key><true/>
 *        <key>StandardOutPath</key><string>/tmp/claude-runner.log</string>
 *        <key>StandardErrorPath</key><string>/tmp/claude-runner.err</string>
 *      </dict></plist>
 *
 *   3. Load it:
 *        launchctl load ~/Library/LaunchAgents/com.2dobetter.runner.plist
 *
 *   4. Tail logs:
 *        tail -f /tmp/claude-runner.log
 */

'use strict';

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');

// Native fetch landed in Node 18. Polyfill for older versions.
if (typeof fetch === 'undefined') {
  try {
    // node-fetch v2 is CommonJS-compatible
    global.fetch = require('node-fetch');
  } catch (e) {
    console.error(
      'Error: fetch is not available. Run with Node 18+ or install node-fetch:\n' +
      '  npm install node-fetch@2\n' +
      'Or start with nvm node:\n' +
      '  ~/.nvm/versions/node/v20.*/bin/node runner/daemon.js'
    );
    process.exit(1);
  }
}

// ── Config loading ────────────────────────────────────────────────────────────
// Priority: ~/.claude-runner.json overrides auto-detected values.
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
  path.join(os.homedir(), '.claude-runner.json'),
  path.join(__dirname, '..', '.claude-runner.json'),
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
  pollMs          = 30000,
  model           = 'sonnet',
} = config;

const MAX_CAP_RETRIES = 5;  // 5h windows in a week — give up after this many

if (!apiBase || !agentToken) {
  console.error(
    'Cannot find API URL or auth token.\n' +
    'Either configure the 2dobetter MCP server in Claude Code, or create\n' +
    '~/.claude-runner.json with apiBase and agentToken fields.'
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

// shortId (8-char) → full UUID session mapping — persisted across restarts
const SESSION_MAP_PATH = path.join(os.homedir(), '.claude-runner-sessions.json');

function loadSessionMap() {
  try { return JSON.parse(fs.readFileSync(SESSION_MAP_PATH, 'utf8')); } catch { return {}; }
}
function saveSessionMap(map) {
  fs.writeFileSync(SESSION_MAP_PATH, JSON.stringify(map, null, 2));
}
const sessionMap = loadSessionMap();

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
    await api('PATCH', `/api/tasks/${t.id}`, { listId: queueListId });
    log(`Rescued orphaned task: "${t.title}"`);
  }
}

// ── Task parsing ──────────────────────────────────────────────────────────────

function parseTask(title) {
  // Returns { resumeId, continueSession, repo, prompt }
  let text = title.trim();
  let resumeId = null;
  let continueSession = false;
  let repo = path.resolve(defaultRepo.replace(/^~/, os.homedir()));

  // --continue (continue most recent CLI session)
  if (/^--continue\b\s*/.test(text)) {
    continueSession = true;
    text = text.replace(/^--continue\s*/, '');
  }

  // --resume [<id>] <prompt>
  // If no hex ID follows --resume, set resumeId to 'last' (resolved later)
  const resumeMatch = text.match(/^--resume\b\s*/);
  if (resumeMatch) {
    text = text.slice(resumeMatch[0].length);
    const idMatch = text.match(/^([0-9a-f-]{6,36})\s+/i);
    if (idMatch) {
      resumeId = idMatch[1];
      text = text.slice(idMatch[0].length);
    } else {
      resumeId = 'last';  // resolved to latest Results session ID at run time
    }
  }

  // ~/path/to/repo: prompt  OR  /abs/path: prompt
  const repoMatch = text.match(/^([~\/]\S+?):\s+/);
  if (repoMatch) {
    repo = path.resolve(repoMatch[1].replace(/^~/, os.homedir()));
    text = text.slice(repoMatch[0].length);
  }

  return { resumeId, continueSession, repo, prompt: text };
}

// ── Claude runner ─────────────────────────────────────────────────────────────

function runClaude({ resumeId, continueSession, repo, prompt }) {
  return new Promise((resolve, reject) => {
    // Fresh session by default. Prefixes in the task title control session handling:
    //   --resume <id> <prompt>   → resume a specific session
    //   --continue <prompt>      → continue the most recent CLI session
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--model', model,
      '--max-turns', '10',
      '--dangerously-skip-permissions',
    ];
    if (resumeId) {
      args.push('--resume', resumeId);
    } else if (continueSession) {
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
      path.join(os.homedir(), '.local', 'bin'),   // Claude Code CLI lives here
      nvmBin,
      path.join(os.homedir(), '.nvm', 'versions', 'node', 'v20', 'bin'),  // fallback
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
      '/bin',
      process.env.PATH || '',
    ].filter(Boolean).join(':');

    const TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes max per task

    // Strip CLAUDECODE env var — otherwise Claude Code refuses to start
    // when the daemon is launched from inside a Claude Code terminal
    const spawnEnv = { ...process.env, HOME: os.homedir(), PATH };
    delete spawnEnv.CLAUDECODE;

    const proc = spawn('claude', args, {
      cwd: repo,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],  // close stdin — claude hangs if it's open
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    // Kill the process if it exceeds the timeout
    const timer = setTimeout(() => {
      if (!finished) {
        log('⏰ Timeout — killing claude process');
        proc.kill('SIGTERM');
        setTimeout(() => { if (!finished) proc.kill('SIGKILL'); }, 5000);
      }
    }, TIMEOUT_MS);

    // Stream stderr live so terminal shows what claude is doing
    proc.stderr.on('data', d => {
      stderr += d;
      process.stderr.write(d);
    });
    proc.stdout.on('data', d => {
      stdout += d;
      process.stdout.write(`[stdout chunk] ${d.toString().slice(0, 200)}\n`);
    });

    proc.on('error', err => {
      finished = true;
      clearTimeout(timer);
      reject({ isCapHit: false, message: `spawn failed: ${err.message}`, stderr: '' });
    });

    proc.on('close', (code, signal) => {
      finished = true;
      clearTimeout(timer);
      log(`claude exited  code=${code}  signal=${signal}  stdout=${stdout.length}B  stderr=${stderr.length}B`);
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        reject({ isCapHit: false, message: `Timed out after ${TIMEOUT_MS / 1000}s`, stderr });
      } else if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          log(`⚠ stdout was not JSON: ${stdout.slice(0, 300)}`);
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

// Returns the session ID from the most recent Results entry, or null
async function lastSessionId() {
  const tasks = await api('GET', `/api/lists/${resultsListId}/tasks`);
  for (const t of [...tasks].reverse()) {
    const m = t.title.match(/\[([0-9a-f]{8})\]/i);
    if (m) return m[1];
  }
  return null;
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
        const minsLeft = Math.ceil((capState.retryAfter - Date.now()) / 60000);
        log(`Skipping "${task.title}" — cap retry in ${minsLeft}m (attempt ${capState.count}/${MAX_CAP_RETRIES})`);
        continue;
      }

      log(`Processing: "${task.title}"`);
      const parsed = parseTask(task.title);

      // Resolve --resume 'last' → actual session ID from most recent Results entry
      if (parsed.resumeId === 'last') {
        // Try session map first (has full UUID), then fall back to Results list
        const last = sessionMap['latest'] || await lastSessionId();
        if (!last) {
          log(`✗ --resume: no previous session found`);
          await api('POST', `/api/lists/${resultsListId}/tasks`, {
            title: `[error] --resume: no previous session found`,
          });
          await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
          continue;
        }
        parsed.resumeId = last;
        log(`--resume defaulting to last session: ${last}`);
      }

      // Validate --resume ID before burning a Claude invocation
      if (parsed.resumeId && !/^[0-9a-f-]{6,36}$/i.test(parsed.resumeId)) {
        log(`✗ Invalid session ID: "${parsed.resumeId}"`);
        await api('POST', `/api/lists/${resultsListId}/tasks`, {
          title: `[error] invalid session ID "${parsed.resumeId}" — copy the hex ID from a Results entry`,
        });
        await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
        continue;
      }

      // Expand short ID → full UUID from session map (claude --resume needs full UUID)
      if (parsed.resumeId && parsed.resumeId.length < 36) {
        const fullId = sessionMap[parsed.resumeId];
        if (fullId) {
          log(`Expanded ${parsed.resumeId} → ${fullId}`);
          parsed.resumeId = fullId;
        } else {
          log(`✗ No full UUID found for short ID "${parsed.resumeId}"`);
          await api('POST', `/api/lists/${resultsListId}/tasks`, {
            title: `[error] session "${parsed.resumeId}" not found — only sessions run by this daemon can be resumed`,
          });
          await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
          continue;
        }
      }

      await api('PATCH', `/api/tasks/${task.id}`, { listId: activeListId });

      try {
        const result = await runClaude(parsed);

        const sessionId   = result.session_id || result.sessionId || 'unknown';
        const shortId     = String(sessionId).slice(0, 8);

        // Persist shortId → full UUID mapping so --resume works with short IDs
        if (sessionId && sessionId !== 'unknown') {
          sessionMap[shortId] = sessionId;
          sessionMap['latest'] = sessionId;
          saveSessionMap(sessionMap);
        }

        // Detect error subtypes before touching the text (e.g. error_max_turns)
        if (result.subtype && result.subtype !== 'success') {
          const note = result.subtype === 'error_max_turns'
            ? `hit turn limit (${result.num_turns || '?'} turns)`
            : result.subtype;
          await api('POST', `/api/lists/${resultsListId}/tasks`, {
            title: `⚠ [${shortId}] ${note}`,
          });
          await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
          log(`⚠ Subtype: ${result.subtype}  session=${sessionId}`);
          continue;
        }

        const responseText = (result.result || result.response || '').trim()
          || JSON.stringify(result);

        // Build a compact summary: strip markdown, grab first meaningful line/sentence
        const stripped = responseText
          .replace(/```[\s\S]*?```/g, '[code]')  // replace code blocks
          .replace(/\*\*|__|\*|_|~~|`/g, '')      // strip inline markdown
          .replace(/^#+\s*/gm, '')                 // strip headings
          .replace(/^\s*[-*>]\s*/gm, '')           // strip bullets/blockquotes
          .replace(/\n{2,}/g, '\n')                // collapse blank lines
          .trim();
        // First sentence (up to 120 chars), else first line, else hard truncate
        const sentenceMatch = stripped.match(/^.{10,120}?[.!?]/);
        const lineMatch = stripped.split('\n')[0].trim();
        const summary = (sentenceMatch ? sentenceMatch[0] : lineMatch).slice(0, 120);

        // Post result as a completed task with session ID
        await api('POST', `/api/lists/${resultsListId}/tasks`, {
          title: `✓ [${shortId}] ${summary}`,
        });

        // Complete the original task
        await api('PATCH', `/api/tasks/${task.id}`, { completed: true });

        log(`✓ Done  session=${sessionId}  summary="${summary}"`);

      } catch (err) {
        try {
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
            const msg = err.message || err.code || String(err);
            log(`✗ Error: ${msg}`);
            const errorPreview = String(msg).slice(0, 380);
            await api('POST', `/api/lists/${resultsListId}/tasks`, {
              title: `[error] ${errorPreview}`,
            });
            await api('PATCH', `/api/tasks/${task.id}`, { completed: true });
          }
        } catch (innerErr) {
          // Last resort — don't leave tasks stuck in Active
          log(`✗ Error handler failed: ${innerErr.message}`);
          try {
            await api('PATCH', `/api/tasks/${task.id}`, { listId: queueListId });
            log('  → Moved task back to Queue for retry');
          } catch { log('  → Could not move task back to Queue'); }
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
  log('claude-runner starting');
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
