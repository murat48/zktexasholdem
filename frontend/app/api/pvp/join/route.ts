/**
 * POST /api/pvp/join
 * Body: { code: string; walletAddress: string; sessionPub: string }
 * Response: { p1Address: string }
 *
 * Joins an existing room. Broadcasts 'game_start' to both players.
 */

import { NextRequest, NextResponse } from 'next/server';
import { rooms, broadcast } from '../store';

export async function POST(req: NextRequest) {
  try {
    const { code, walletAddress, sessionPub } = await req.json();
    const room = rooms.get(code?.toUpperCase());

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    if (room.p2) {
      return NextResponse.json({ error: 'Room is full' }, { status: 409 });
    }
    if (room.p1.walletAddress === walletAddress) {
      return NextResponse.json({ error: 'Cannot join your own room' }, { status: 400 });
    }

    room.p2 = { walletAddress, sessionPub: sessionPub ?? '' };

    // Tell both players the game can start.
    // Player 1 (host) will deal cards, set initial state, then broadcast it.
    broadcast(room, {
      type: 'game_start',
      p1: room.p1,
      p2: room.p2,
      initialState: null, // host will send state_update shortly
    });

    return NextResponse.json({ p1Address: room.p1.walletAddress });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
