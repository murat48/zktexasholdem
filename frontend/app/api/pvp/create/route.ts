/**
 * POST /api/pvp/create
 * Body: { walletAddress: string; sessionPub: string }
 * Response: { code: string }
 *
 * Creates a new PvP room and returns the 6-char join code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { rooms, generateCode, evictStale, type PvPRoom } from '../store';

export async function POST(req: NextRequest) {
  try {
    evictStale();
    const { walletAddress, sessionPub } = await req.json();
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress required' }, { status: 400 });
    }

    let code = generateCode();
    // Collisions are extremely unlikely but guard anyway
    while (rooms.has(code)) code = generateCode();

    const room: PvPRoom = {
      code,
      p1: { walletAddress, sessionPub: sessionPub ?? '' },
      gameState: null,
      pendingGuestAction: null,
      createdAt: Date.now(),
      subscribers: new Map(),
    };
    rooms.set(code, room);

    return NextResponse.json({ code });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
