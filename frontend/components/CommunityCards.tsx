'use client';

import { Card, cardToString } from '@/lib/poker';
import { cn } from '@/lib/utils';

interface CommunityCardsProps {
  cards: Card[];
  round: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'handover';
}

export function CommunityCards({ cards, round }: CommunityCardsProps) {
  const displayCards = [...cards];
  
  // Pad with empty cards based on round
  while (displayCards.length < 5) {
    displayCards.push(-1); // -1 represents empty/unrevealed card
  }
  
  return (
    <div className="flex gap-3 p-6 bg-green-800 rounded-xl justify-center">
      {displayCards.slice(0, 5).map((card, index) => {
        const isRevealed = card !== -1;
        const shouldShow = 
          (round === 'flop' && index < 3) ||
          (round === 'turn' && index < 4) ||
          (round === 'river' && index < 5) ||
          (round === 'showdown' && index < 5) ||
          (round === 'handover' && index < 5); // Also show all cards in handover
        
        return (
          <div
            key={index}
            className={cn(
              'w-20 h-28 rounded-lg border-2 flex items-center justify-center text-3xl font-bold transition-all',
              shouldShow && isRevealed
                ? 'bg-white border-gray-300 text-gray-900'
                : 'bg-green-700 border-green-600 text-green-600 opacity-50'
            )}
          >
            {shouldShow && isRevealed ? cardToString(card) : ''}
          </div>
        );
      })}
    </div>
  );
}
