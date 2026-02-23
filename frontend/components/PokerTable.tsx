'use client';

import { ReactNode } from 'react';
import { formatChips } from '@/lib/utils';

interface PokerTableProps {
  children: ReactNode;
  pot: number;
}

export function PokerTable({ children, pot }: PokerTableProps) {
  return (
    <div className="relative w-full max-w-6xl mx-auto p-8">
      {/* Poker table felt */}
      <div className="relative bg-gradient-to-br from-green-700 to-green-900 rounded-[200px] p-12 shadow-2xl border-8 border-amber-900">
        {/* Table border detail */}
        <div className="absolute inset-0 rounded-[200px] border-4 border-amber-700 opacity-50" />
        
        {/* Pot display - moved to right side */}
        <div className="absolute top-1/2 right-8 transform -translate-y-1/2 z-10">
          <div className="bg-gray-900 bg-opacity-80 px-6 py-3 rounded-lg border-2 border-yellow-500">
            <div className="text-yellow-500 text-sm font-medium">POT</div>
            <div className="text-white text-2xl font-bold">
              {formatChips(pot)}
            </div>
          </div>
        </div>
        
        {/* Game content */}
        <div className="relative z-0">
          {children}
        </div>
      </div>
    </div>
  );
}
