/**
 * POST /api/pvp/action
 * Body: { code: string; from: 'p1'|'p2'; payload: unknown }
 *
 * Message relay between the two players:
 *
 * • p1 sends 'state_update'   → persisted + forwarded to p2
 * • p2 sends 'action_request' → forwarded to p1
 */

import { NextRequest, NextResponse } from 'next/server';
import { rooms, sendTo, broadcast } from '../store';

export async function POST(req: NextRequest) {
  try {
    const { code, from, payload } = await req.json() as {
      code: string;
      from: 'p1' | 'p2' | 'chat';
      payload: unknown;
    };

    const room = rooms.get(code?.toUpperCase());
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (!room.p2)  return NextResponse.json({ error: 'Game not started' }, { status: 400 });

    if (from === 'p1') {
      // Host sends updated game state → persist + forward to guest
      room.gameState = payload;
      sendTo(room, room.p2.walletAddress, { type: 'state_update', state: payload });
    } else if (from === 'chat') {
      // Chat message → broadcast to both players
      const msg = payload as { from: string; text: string; ts: number };
      broadcast(room, { type: 'chat', from: msg.from, text: msg.text, ts: msg.ts });
    } else {
      // Guest sends action request → persist for HOST HTTP poll + try SSE push
      room.pendingGuestAction = payload;
      sendTo(room, room.p1.walletAddress, { type: 'action_request', action: payload });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
