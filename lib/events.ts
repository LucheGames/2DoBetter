// Server-Sent Events broadcast
// Calls the global broadcast function set by server.js
// This bridges Next.js API routes → server.js SSE clients

declare global {
  // eslint-disable-next-line no-var
  var __sseBroadcast: (() => void) | undefined;
  // eslint-disable-next-line no-var
  var __sseBroadcastReload: (() => void) | undefined;
}

export function broadcast() {
  if (typeof global.__sseBroadcast === "function") {
    global.__sseBroadcast();
  }
}

/** Forces all connected clients to hard-reload. Use after destructive schema
 *  changes like column deletion so stale PWA caches don't show ghost columns. */
export function broadcastReload() {
  if (typeof global.__sseBroadcastReload === "function") {
    global.__sseBroadcastReload();
  }
}
