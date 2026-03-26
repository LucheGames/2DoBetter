/**
 * Board CRUD integration tests.
 *
 * Tests the core workflow: create columns → create lists → create tasks →
 * complete tasks → delete tasks. All operations go through the real route
 * handlers against a real (test) SQLite database.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { api } from '../helpers/api';
import { TEST_ADMIN, TEST_USER } from '../helpers/setup';
import { prisma } from '@/lib/prisma';

// Route handlers — imported directly
import { GET as getColumns, POST as createColumn } from '@/app/api/columns/route';
import { POST as createList } from '@/app/api/columns/[columnId]/lists/route';
import { GET as getTasks, POST as createTask } from '@/app/api/lists/[id]/tasks/route';
import { PATCH as updateTask, DELETE as deleteTask } from '@/app/api/tasks/[id]/route';

const admin = api(TEST_ADMIN.username);
const user = api(TEST_USER.username);

let testColumnId: number;
let testListId: number;
let testTaskId: number;

describe('Board CRUD', () => {
  // ── Columns ──────────────────────────────────────────────────────────────────

  describe('Columns', () => {
    it('GET /api/columns returns empty board initially', async () => {
      const { status, data } = await admin.get(getColumns);
      expect(status).toBe(200);
      expect(data).toEqual([]);
    });

    it('POST /api/columns creates a column (admin only)', async () => {
      const { status, data } = await admin.post(createColumn, '/api/columns', {}, { name: 'Test Column' });
      expect(status).toBe(201);
      expect(data).toMatchObject({ name: 'Test Column', slug: 'test-column' });
      expect(data.lists).toHaveLength(1); // auto-created "Project" list
      expect(data.lists[0].name).toBe('Project');
      testColumnId = data.id;
      testListId = data.lists[0].id;
    });

    it('POST /api/columns rejects non-admin', async () => {
      const { status } = await user.post(createColumn, '/api/columns', {}, { name: 'Nope' });
      expect(status).toBe(403);
    });

    it('POST /api/columns rejects empty name', async () => {
      const { status } = await admin.post(createColumn, '/api/columns', {}, { name: '' });
      expect(status).toBe(400);
    });

    it('POST /api/columns handles slug collisions', async () => {
      const { data: col2 } = await admin.post(createColumn, '/api/columns', {}, { name: 'Test Column' });
      expect(col2.slug).toBe('test-column-1'); // collision → appends counter
    });

    it('GET /api/columns returns created columns in order', async () => {
      const { data } = await admin.get(getColumns);
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('Test Column');
      expect(data[1].name).toBe('Test Column');
      expect(data[1].slug).toBe('test-column-1');
    });
  });

  // ── Lists ────────────────────────────────────────────────────────────────────

  describe('Lists', () => {
    it('POST /api/columns/:id/lists creates a list', async () => {
      const { status, data } = await admin.post(
        createList,
        `/api/columns/${testColumnId}/lists`,
        { columnId: String(testColumnId) },
        { name: 'Bugs' },
      );
      expect(status).toBe(201);
      expect(data).toMatchObject({ name: 'Bugs', columnId: testColumnId });
    });
  });

  // ── Tasks ────────────────────────────────────────────────────────────────────

  describe('Tasks', () => {
    it('POST /api/lists/:id/tasks creates a task', async () => {
      const { status, data } = await user.post(
        createTask,
        `/api/lists/${testListId}/tasks`,
        { id: String(testListId) },
        { title: 'Fix the login bug' },
      );
      expect(status).toBe(201);
      expect(data).toMatchObject({
        title: 'Fix the login bug',
        completed: false,
        listId: testListId,
        createdBy: TEST_USER.username,
      });
      testTaskId = data.id;
    });

    it('POST /api/lists/:id/tasks rejects empty title', async () => {
      const { status } = await user.post(
        createTask,
        `/api/lists/${testListId}/tasks`,
        { id: String(testListId) },
        { title: '' },
      );
      expect(status).toBe(400);
    });

    it('POST /api/lists/:id/tasks rejects title > 500 chars', async () => {
      const { status } = await user.post(
        createTask,
        `/api/lists/${testListId}/tasks`,
        { id: String(testListId) },
        { title: 'x'.repeat(501) },
      );
      expect(status).toBe(400);
    });

    it('POST /api/lists/:id/tasks deduplicates rapid submits', async () => {
      const { status, data } = await user.post(
        createTask,
        `/api/lists/${testListId}/tasks`,
        { id: String(testListId) },
        { title: 'Fix the login bug' }, // same title as above
      );
      expect(status).toBe(200); // returns existing, not 201
      expect(data.id).toBe(testTaskId);
    });

    it('GET /api/lists/:id/tasks returns tasks', async () => {
      const { status, data } = await user.get(
        getTasks,
        `/api/lists/${testListId}/tasks`,
        { id: String(testListId) },
      );
      expect(status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe('Fix the login bug');
    });

    it('PATCH /api/tasks/:id renames a task', async () => {
      const { status, data } = await user.patch(
        updateTask,
        `/api/tasks/${testTaskId}`,
        { id: String(testTaskId) },
        { title: 'Fix the auth bug' },
      );
      expect(status).toBe(200);
      expect(data.title).toBe('Fix the auth bug');
    });

    it('PATCH /api/tasks/:id completes a task', async () => {
      const { status, data } = await user.patch(
        updateTask,
        `/api/tasks/${testTaskId}`,
        { id: String(testTaskId) },
        { completed: true },
      );
      expect(status).toBe(200);
      expect(data.completed).toBe(true);
      expect(data.completedAt).toBeTruthy();
      expect(data.completedBreadcrumb).toBeTruthy();
    });

    it('PATCH /api/tasks/:id uncompletes a task', async () => {
      const { status, data } = await user.patch(
        updateTask,
        `/api/tasks/${testTaskId}`,
        { id: String(testTaskId) },
        { completed: false },
      );
      expect(status).toBe(200);
      expect(data.completed).toBe(false);
      expect(data.completedAt).toBeNull();
    });

    it('DELETE /api/tasks/:id deletes a task', async () => {
      const { status } = await user.delete(
        deleteTask,
        `/api/tasks/${testTaskId}`,
        { id: String(testTaskId) },
      );
      expect(status).toBe(204);

      // Verify it's gone
      const count = await prisma.task.count({ where: { id: testTaskId } });
      expect(count).toBe(0);
    });
  });
});
