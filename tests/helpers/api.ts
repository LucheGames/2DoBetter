/**
 * Test API helper — calls Next.js route handlers directly.
 *
 * Instead of spinning up an HTTP server, we import the route handler functions
 * and call them with constructed Request objects. The proxy (middleware) is
 * bypassed — we set x-auth-user directly, simulating what the proxy would do
 * after validating tokens.
 *
 * This keeps tests fast (~ms per call) and avoids port conflicts.
 */

import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000'; // only used for URL parsing, no actual server

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface CallOptions {
  method?: Method;
  body?: unknown;
  authUser?: string;   // simulates x-auth-user header (set by proxy after auth)
  headers?: Record<string, string>;
}

/**
 * Call a Next.js route handler directly.
 *
 * @param handler - The exported route handler function (GET, POST, PATCH, DELETE)
 * @param path - URL path (used for param extraction), e.g. '/api/tasks/42'
 * @param params - Route params object, e.g. { id: '42' }
 * @param options - Method, body, auth user
 */
export async function callHandler(
  handler: Function,
  path: string,
  params: Record<string, string> = {},
  options: CallOptions = {},
) {
  const { method = 'GET', body, authUser, headers: extraHeaders } = options;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...extraHeaders,
  };

  if (authUser) {
    headers['x-auth-user'] = authUser;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const req = new NextRequest(new URL(path, BASE_URL), init);

  // Route handlers with dynamic segments receive params as a Promise (Next.js 16)
  const paramsPromise = Promise.resolve(params);
  const response = await handler(req, { params: paramsPromise });

  // Parse the response
  const status = response.status;
  let data: unknown = null;

  if (status !== 204) {
    try {
      data = await response.json();
    } catch {
      // No JSON body (e.g. 204, empty responses)
    }
  }

  return { status, data, response };
}

/**
 * Convenience wrappers for common HTTP methods.
 */
export function api(authUser?: string) {
  return {
    get: (handler: Function, path = '/', params = {}) =>
      callHandler(handler, path, params, { method: 'GET', authUser }),

    post: (handler: Function, path = '/', params = {}, body?: unknown) =>
      callHandler(handler, path, params, { method: 'POST', body, authUser }),

    patch: (handler: Function, path = '/', params = {}, body?: unknown) =>
      callHandler(handler, path, params, { method: 'PATCH', body, authUser }),

    delete: (handler: Function, path = '/', params = {}) =>
      callHandler(handler, path, params, { method: 'DELETE', authUser }),
  };
}
