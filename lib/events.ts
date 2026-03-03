// Server-Sent Events broadcast
// Calls the global broadcast function set by server.js
// This bridges Next.js API routes → server.js SSE clients

declare global {
  // eslint-disable-next-line no-var
  var __sseBroadcast: (() => void) | undefined;
}

export function broadcast() {
  if (typeof global.__sseBroadcast === "function") {
    global.__sseBroadcast();
  }
}
