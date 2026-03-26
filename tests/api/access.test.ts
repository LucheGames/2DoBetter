/**
 * Access control tests.
 *
 * Verifies that readOnly users can't write, unauthenticated requests are
 * handled correctly, and lane guards enforce column ownership.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { api } from '../helpers/api';
import { TEST_ADMIN, TEST_USER, TEST_READONLY } from '../helpers/setup';
import { prisma } from '@/lib/prisma';

import { POST as createColumn } from '@/app/api/columns/route';
import { POST as createTask } from '@/app/api/lists/[id]/tasks/route';
import { PATCH as updateTask, DELETE as deleteTask } from '@/app/api/tasks/[id]/route';

const admin = api(TEST_ADMIN.username);
const reader = api(TEST_READONLY.username);
const noAuth = api(); // no auth user

let lockedColumnId: number;
let lockedListId: number;
let taskInLockedColumn: number;

describe('Access Control', () => {
  beforeAll(async () => {
    // Create a locked column owned by admin
    const col = await prisma.column.create({
      data: {
        name: 'Admin Locked',
        slug: `admin-locked-${Date.now()}`,
        order: 100,
        ownerUsername: TEST_ADMIN.username,
        locked: true,
        lists: { create: [{ name: 'Admin Tasks', order: 0 }] },
      },
      include: { lists: true },
    });
    lockedColumnId = col.id;
    lockedListId = col.lists[0].id;

    // Create a task in the locked column
    const task = await prisma.task.create({
      data: {
        listId: lockedListId,
        title: 'Admin only task',
        order: 0,
      },
    });
    taskInLockedColumn = task.id;
  });

  // ── Read-only user ─────────────────────────────────────────────────────────

  describe('Read-only user', () => {
    it('cannot create tasks', async () => {
      const { status, data } = await reader.post(
        createTask,
        `/api/lists/${lockedListId}/tasks`,
        { id: String(lockedListId) },
        { title: 'Should fail' },
      );
      expect(status).toBe(403);
      expect(data.error).toMatch(/read-only/i);
    });

    it('cannot update tasks', async () => {
      const { status, data } = await reader.patch(
        updateTask,
        `/api/tasks/${taskInLockedColumn}`,
        { id: String(taskInLockedColumn) },
        { title: 'Renamed by reader' },
      );
      expect(status).toBe(403);
      expect(data.error).toMatch(/read-only/i);
    });

    it('cannot delete tasks', async () => {
      const { status, data } = await reader.delete(
        deleteTask,
        `/api/tasks/${taskInLockedColumn}`,
        { id: String(taskInLockedColumn) },
      );
      expect(status).toBe(403);
      expect(data.error).toMatch(/read-only/i);
    });
  });

  // ── Locked columns ────────────────────────────────────────────────────────

  describe('Locked columns', () => {
    it('non-owner cannot rename tasks in locked column', async () => {
      const userApi = api(TEST_USER.username);
      const { status, data } = await userApi.patch(
        updateTask,
        `/api/tasks/${taskInLockedColumn}`,
        { id: String(taskInLockedColumn) },
        { title: 'Hijacked!' },
      );
      expect(status).toBe(403);
      expect(data.error).toMatch(/locked/i);
    });

    it('non-owner CAN toggle completion on locked column task (cross-column ack)', async () => {
      const userApi = api(TEST_USER.username);
      const { status, data } = await userApi.patch(
        updateTask,
        `/api/tasks/${taskInLockedColumn}`,
        { id: String(taskInLockedColumn) },
        { completed: true },
      );
      expect(status).toBe(200);
      expect(data.completed).toBe(true);

      // Uncomplete it back
      await userApi.patch(
        updateTask,
        `/api/tasks/${taskInLockedColumn}`,
        { id: String(taskInLockedColumn) },
        { completed: false },
      );
    });

    it('owner CAN modify tasks in their locked column', async () => {
      const { status, data } = await admin.patch(
        updateTask,
        `/api/tasks/${taskInLockedColumn}`,
        { id: String(taskInLockedColumn) },
        { title: 'Admin updated this' },
      );
      expect(status).toBe(200);
      expect(data.title).toBe('Admin updated this');
    });
  });

  // ── Column creation authorization ─────────────────────────────────────────

  describe('Column creation', () => {
    it('non-admin cannot create columns', async () => {
      const userApi = api(TEST_USER.username);
      const { status } = await userApi.post(createColumn, '/api/columns', {}, { name: 'Nope' });
      expect(status).toBe(403);
    });

    it('admin can create columns', async () => {
      const { status, data } = await admin.post(createColumn, '/api/columns', {}, { name: 'Admin Col' });
      expect(status).toBe(201);
      expect(data.name).toBe('Admin Col');
    });
  });
});
