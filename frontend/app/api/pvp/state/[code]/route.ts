/**
 * GET /api/pvp/state/[code]
 *
 * Direct HTTP fallback: returns the latest persisted game state for a room.
 * GUEST uses this to pull initial state when SSE delivery may be delayed
 * (race condition during simultaneous navigation from lobby → game page).
 */

import { NextRequest, NextResponse } from 'next/server';
import { rooms } from '../../store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const room = rooms.get(code.toUpperCase());

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  return NextResponse.json({
    gameState:    room.gameState ?? null,
    p1Address:    room.p1.walletAddress,
    p2Address:    room.p2?.walletAddress ?? null,
    hasP2:        !!room.p2,
  });
}
