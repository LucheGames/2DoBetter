// Next.js requires this file to be named middleware.ts at the project root.
// Auth logic lives in proxy.ts — this just wires it in.
import { proxy } from './proxy';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  return proxy(request);
}
