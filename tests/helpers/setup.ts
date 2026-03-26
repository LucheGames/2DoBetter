/**
 * Global test setup — runs once before all test files.
 *
 * 1. Creates a temp SQLite DB and runs Prisma migrations
 * 2. Creates a temp data/users.json with test users
 * 3. Points the Prisma client at the test DB
 * 4. Tears everything down after tests complete
 *
 * IMPORTANT: DATABASE_URL must be set at the top level (not in beforeAll)
 * because lib/prisma.ts is imported at module-load time by test files,
 * which happens AFTER setupFiles are loaded but BEFORE beforeAll runs.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(__dirname, '../..');
const REAL_USERS_FILE = path.join(ROOT, 'data', 'users.json');

// ── Create test DB at module-load time (before test file imports) ───────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '2dobetter-test-'));
const testDbPath = path.join(tmpDir, 'test.db');
const testDbUrl = `file:${testDbPath}`;

// Set DATABASE_URL NOW so that when lib/prisma.ts is imported by test files,
// the PrismaClient it creates will connect to our test DB, not dev.db.
process.env.DATABASE_URL = testDbUrl;

// Push schema to create tables
execSync('npx prisma db push --skip-generate', {
  cwd: ROOT,
  env: { ...process.env, DATABASE_URL: testDbUrl },
  stdio: 'pipe',
});

// Pre-set the Prisma global so lib/prisma.ts uses our test client
const testClient = new PrismaClient({
  datasources: { db: { url: testDbUrl } },
  log: ['error'],
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = testClient;

// ── End of module-load-time setup ───────────────────────────────────────────

// Test user credentials
export const TEST_ADMIN = { username: 'TestAdmin', password: 'adminpass123' };
export const TEST_USER = { username: 'TestUser', password: 'userpass1234' };
export const TEST_READONLY = { username: 'TestReader', password: 'readerpass1' };
export const TEST_AGENT = { username: 'TestAgent', password: 'agentpass12', agentToken: 'test-agent-token-hex-64chars-padded-to-be-long-enough-for-valid' };

let backupUsersJson: string | null = null;

beforeAll(async () => {
  // Backup real users.json if it exists, then write test users
  if (fs.existsSync(REAL_USERS_FILE)) {
    backupUsersJson = fs.readFileSync(REAL_USERS_FILE, 'utf8');
  }

  const testUsers = [
    {
      username: TEST_ADMIN.username,
      hash: bcrypt.hashSync(TEST_ADMIN.password, 4), // fast rounds for tests
      isAdmin: true,
      sessions: [] as string[],
    },
    {
      username: TEST_USER.username,
      hash: bcrypt.hashSync(TEST_USER.password, 4),
      sessions: [] as string[],
    },
    {
      username: TEST_READONLY.username,
      hash: bcrypt.hashSync(TEST_READONLY.password, 4),
      readOnly: true,
      sessions: [] as string[],
    },
    {
      username: TEST_AGENT.username,
      hash: bcrypt.hashSync(TEST_AGENT.password, 4),
      isAgent: true,
      agentToken: TEST_AGENT.agentToken,
      sessions: [] as string[],
    },
  ];

  fs.mkdirSync(path.dirname(REAL_USERS_FILE), { recursive: true });
  fs.writeFileSync(REAL_USERS_FILE, JSON.stringify(testUsers, null, 2));
  process.env.AUTH_USERS_JSON = JSON.stringify(testUsers);
});

afterAll(async () => {
  // Disconnect Prisma from test DB
  await testClient.$disconnect();

  // Restore real users.json
  if (backupUsersJson !== null) {
    fs.writeFileSync(REAL_USERS_FILE, backupUsersJson);
  } else if (fs.existsSync(REAL_USERS_FILE)) {
    fs.unlinkSync(REAL_USERS_FILE);
  }

  // Clean up temp DB
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
