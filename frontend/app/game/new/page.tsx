'use client';

import { useRouter } from 'next/navigation';
import { OpponentSelector } from '@/components/OpponentSelector';
import type { AIOpponent } from '@/lib/ai-opponents';

export default function NewGamePage() {
  const router = useRouter();

  function handleOpponentSelected(opponent: AIOpponent) {
    // Opponent already saved to localStorage by OpponentSelector
    // Generate a unique game ID and go to game
    const gameId = `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    router.push(`/game/${gameId}`);
  }

  return (
    <main>
      <OpponentSelector onSelect={handleOpponentSelected} />
    </main>
  );
}
