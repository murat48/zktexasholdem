'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface BettingControlsProps {
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: number) => void;
  canCheck: boolean;
  callAmount: number;
  minBet: number;
  maxBet: number;
  disabled?: boolean;
}

export function BettingControls({ 
  onFold, 
  onCheck,
  onCall,
  onBet, 
  canCheck,
  callAmount,
  minBet,
  maxBet,
  disabled = false
}: BettingControlsProps) {
  // Ensure valid numbers, fallback to defaults
  const safeMinBet = Number.isFinite(minBet) ? minBet : 10;
  const safeMaxBet = Number.isFinite(maxBet) ? maxBet : 1000;
  const [betAmount, setBetAmount] = useState(Math.min(safeMinBet, safeMaxBet));
  
  // "Raise" label when there's already a bet to beat, "Bet" when opening
  const betLabel = callAmount > 0 ? 'Raise' : 'Bet';

  return (
    <div className="flex flex-col gap-4 p-6 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex gap-4">
        <button 
          onClick={() => {
            console.log('🎬 FOLD button clicked');
            onFold();
          }}
          disabled={disabled}
          className={cn(
            "px-8 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          Fold
        </button>
        
        {canCheck ? (
          <button 
            onClick={() => {
              console.log('🎬 CHECK button clicked');
              onCheck();
            }}
            disabled={disabled}
            className={cn(
              "px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            Check
          </button>
        ) : (
          <button 
            onClick={() => {
              console.log('🎬 CALL button clicked, amount:', callAmount);
              onCall();
            }}
            disabled={disabled}
            className={cn(
              "px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg font-bold transition-colors",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            Call {callAmount}
          </button>
        )}
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={safeMinBet}
            max={safeMaxBet}
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
            disabled={disabled}
            className="flex-1"
          />
          <span className="text-white font-medium w-24 text-right">
            {Number.isFinite(betAmount) ? betAmount : safeMinBet} chips
          </span>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setBetAmount(safeMinBet)}
            disabled={disabled}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Min
          </button>
          <button 
            onClick={() => setBetAmount(Math.floor((safeMinBet + safeMaxBet) / 2))}
            disabled={disabled}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            1/2 Pot
          </button>
          <button 
            onClick={() => setBetAmount(safeMaxBet)}
            disabled={disabled}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            All-in
          </button>
        </div>
        
        <button 
          onClick={() => {
            console.log('🎬 BET/RAISE button clicked, amount:', betAmount);
            onBet(betAmount);
          }}
          disabled={disabled || safeMaxBet < safeMinBet}
          className={cn(
            "px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors",
            (disabled || safeMaxBet < safeMinBet) && "opacity-50 cursor-not-allowed"
          )}
        >
          {betLabel} {betAmount}
        </button>
      </div>
    </div>
  );
}
