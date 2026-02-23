/**
 * GET /api/pvp/room/[code]?wallet=ADDRESS
 *
 * Server-Sent Events stream.  Each connected client receives:
 *   - 'room_waiting'         — still waiting for P2 (only to P1 right after create)
 *   - 'game_start'           — both players connected
 *   - 'state_update'         — authoritative state from P1 (host)
 *   - 'action_request'       — action forwarded from P2 to P1
 *   - 'opponent_disconnected'— opponent left
 *   - 'ping'                 — keepalive every 25 s
 */

import { NextRequest } from 'next/server';
import { rooms, encodeSSE } from '../../store';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const wallet = req.nextUrl.searchParams.get('wallet') ?? '';
  const room = rooms.get(code.toUpperCase());

  if (!room) {
    return new Response('Room not found', { status: 404 });
  }

  let ctrl!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      room.subscribers.set(wallet, ctrl);

      if (!room.p2) {
        // Still waiting for P2
        ctrl.enqueue(encodeSSE({ type: 'room_waiting', code: room.code }));
      } else {
        // Both players are in — always replay game_start so client
        // can restore opponentAddress even after page navigation.
        ctrl.enqueue(encodeSSE({ type: 'game_start', p1: room.p1, p2: room.p2 }));

        if (room.gameState) {
          // Push latest known state immediately (GUEST catches up)
          ctrl.enqueue(encodeSSE({ type: 'state_update', state: room.gameState }));
        } else {
          // No state yet — ask HOST to broadcast current state
          const hostCtrl = room.p1.walletAddress !== wallet
            ? room.subscribers.get(room.p1.walletAddress)
            : undefined;
          if (hostCtrl) {
            try {
              hostCtrl.enqueue(encodeSSE({ type: 'action_request', action: { type: 'requestState' } }));
            } catch {}
          }
        }
      }
    },
    cancel() {
      // Only act if OUR controller is still the active one for this wallet.
      // If the client reconnected (new EventSource) before this old connection
      // closed, the map already holds the NEW controller — don't delete it and
      // don't falsely tell the opponent that their partner disconnected.
      if (room.subscribers.get(wallet) !== ctrl) return;

      room.subscribers.delete(wallet);

      // Notify the other subscriber that opponent left
      for (const [addr, other] of room.subscribers) {
        if (addr !== wallet) {
          try { other.enqueue(encodeSSE({ type: 'opponent_disconnected' })); } catch {}
        }
      }
    },
  });

  // Keepalive ping every 25 s to prevent proxy timeouts
  const pingInterval = setInterval(() => {
    if (!room.subscribers.has(wallet)) {
      clearInterval(pingInterval);
      return;
    }
    try { ctrl.enqueue(encodeSSE({ type: 'ping' })); } catch {}
  }, 25_000);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
