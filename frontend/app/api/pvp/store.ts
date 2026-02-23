/**
 * PvP Room Store — global singleton kept alive across hot-reloads in dev.
 *
 * In production this lives in a single Node process (no Redis needed for demo).
 * Rooms expire after 2 hours of inactivity.
 */

export type PvPPlayer = {
  walletAddress: string;
  sessionPub: string; // ephemeral keypair public key for message authN
};

export type PvPMessage =
  | { type: 'room_waiting'; code: string }
  | { type: 'game_start'; p1: PvPPlayer; p2: PvPPlayer; initialState?: unknown }
  | { type: 'state_update'; state: unknown }          // host → guest
  | { type: 'action_request'; action: unknown }        // guest → host
  | { type: 'chat'; from: string; text: string; ts: number } // in-game chat
  | { type: 'opponent_disconnected' }
  | { type: 'ping' };

export interface PvPRoom {
  code: string;
  p1: PvPPlayer;
  p2?: PvPPlayer;
  /** latest authoritative game state — maintained by Player 1 (host) */
  gameState: unknown | null;
  /** latest unprocessed action from GUEST — HOST polls this via HTTP */
  pendingGuestAction: unknown | null;
  createdAt: number;
  /** SSE controller per subscriber, keyed by walletAddress */
  subscribers: Map<string, ReadableStreamDefaultController<Uint8Array>>;
}

// ── Global singleton ────────────────────────────────────────────────────────
const key = '__pvpRooms';
if (!(global as Record<string, unknown>)[key]) {
  (global as Record<string, unknown>)[key] = new Map<string, PvPRoom>();
}
export const rooms = (global as Record<string, unknown>)[key] as Map<string, PvPRoom>;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random 6-char uppercase room code. */
export function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Evict rooms older than 2 hours. */
export function evictStale(): void {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > TWO_HOURS) {
      rooms.delete(code);
    }
  }
}

/** Encode a PvPMessage as an SSE data frame. */
export function encodeSSE(msg: PvPMessage): Uint8Array {
  const json = JSON.stringify(msg);
  return new TextEncoder().encode(`data: ${json}\n\n`);
}

/** Broadcast a message to all subscribers of a room. */
export function broadcast(room: PvPRoom, msg: PvPMessage): void {
  const frame = encodeSSE(msg);
  for (const ctrl of room.subscribers.values()) {
    try { ctrl.enqueue(frame); } catch { /* subscriber gone */ }
  }
}

/** Send a message to a single subscriber (by walletAddress). */
export function sendTo(room: PvPRoom, walletAddress: string, msg: PvPMessage): void {
  const ctrl = room.subscribers.get(walletAddress);
  if (!ctrl) return;
  try { ctrl.enqueue(encodeSSE(msg)); } catch { /* gone */ }
}
