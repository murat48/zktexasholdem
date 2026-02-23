/**
 * POST /api/end-game
 *
 * Called via navigator.sendBeacon (page unload) or fetch.
 * Sends end_game to the Game Hub contract server-side so it completes
 * even after the browser tab is closed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { notifyGameEnd } from '@/lib/zk-contract';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { gameId, winnerAddress, p1Score, p2Score, p1Address } = await req.json();

    if (!gameId || !winnerAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('[end-game beacon] gameId:', gameId, 'winner:', winnerAddress);

    // Fire-and-forget — we return 200 immediately; the contract call runs in background
    notifyGameEnd(gameId, winnerAddress, p1Score ?? 0, p2Score ?? 0, p1Address)
      .then(() => console.log('[end-game beacon] ✅ sent'))
      .catch(err => console.error('[end-game beacon] ❌', err?.message));

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[end-game beacon] parse error:', err?.message);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
