/**
 * GET /api/pvp/pending/[code]
 *
 * HOST polls this to pick up the latest unprocessed action from GUEST.
 * Returns { action } and clears it atomically so it is only consumed once.
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
    // Room not in memory (e.g. server restart) — return empty action, not 404,
    // so the HOST poll loop stays silent instead of flooding the dev log.
    return NextResponse.json({ action: null });
  }

  const action = room.pendingGuestAction ?? null;
  if (action) room.pendingGuestAction = null; // consume it

  return NextResponse.json({ action });
}
