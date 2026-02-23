'use client';

import { Card, cardToString } from '@/lib/poker';
import { cn } from '@/lib/utils';

interface PlayerHandProps {
  cards: Card[];
  position: 'top' | 'bottom';
  isHidden?: boolean;
}

export function PlayerHand({ cards, position, isHidden = false }: PlayerHandProps) {
  return (
    <div
      className={cn(
        'flex gap-2 p-4',
        position === 'top' && 'justify-center',
        position === 'bottom' && 'justify-center'
      )}
    >
      {cards.map((card, index) => (
        <div
          key={index}
          className={cn(
            'w-16 h-24 rounded-lg border-2 flex items-center justify-center text-2xl font-bold',
            isHidden
              ? 'bg-blue-900 border-blue-700 text-blue-700'
              : 'bg-white border-gray-300 text-gray-900'
          )}
        >
          {isHidden ? '🂠' : cardToString(card)}
        </div>
      ))}
    </div>
  );
}
