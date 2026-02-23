// Game validation utilities
// Ensures all game actions follow Texas Hold'em rules as per texas.md

import { TexasHoldemState } from '@/hooks/useTexasHoldem';

/**
 * Validate if a bet amount is legal according to Texas Hold'em rules
 * As per texas.md:
 * - Opening bet: 1× Big Blind minimum
 * - After a bet: 2× previous bet minimum
 * - After a raise: 2× previous raise minimum
 */
export function validateBetAmount(
  state: TexasHoldemState,
  playerIndex: number,
  betAmount: number
): { valid: boolean; error?: string; minBet?: number } {
  const player = state.players[playerIndex];
  const currentBet = state.roundBets[player.address] || 0;
  const additionalAmount = betAmount - currentBet;

  // Check if player has enough chips
  if (additionalAmount > player.chips) {
    return {
      valid: false,
      error: 'Insufficient chips',
    };
  }

  // Check if amount is positive
  if (betAmount <= currentBet) {
    return {
      valid: false,
      error: 'Bet must be higher than current bet',
    };
  }

  // Opening bet (no one has bet yet)
  if (state.highestBet === 0 || state.highestBet === state.bigBlindAmount) {
    const minBet = state.bigBlindAmount;
    if (betAmount < minBet) {
      return {
        valid: false,
        error: `Minimum opening bet is ${minBet} chips (1× Big Blind)`,
        minBet,
      };
    }
  } else {
    // Raising an existing bet - must be at least 2× the previous bet
    const minRaise = state.highestBet * 2;
    if (betAmount < minRaise) {
      return {
        valid: false,
        error: `Minimum raise is ${minRaise} chips (2× current bet)`,
        minBet: minRaise,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate if a call action is legal
 */
export function validateCall(
  state: TexasHoldemState,
  playerIndex: number
): { valid: boolean; error?: string; callAmount?: number } {
  const player = state.players[playerIndex];
  const currentBet = state.roundBets[player.address] || 0;
  const callAmount = state.highestBet - currentBet;

  if (callAmount === 0) {
    return {
      valid: false,
      error: 'Nothing to call - use check instead',
    };
  }

  if (callAmount > player.chips) {
    // All-in situation
    return {
      valid: true,
      callAmount: player.chips, // Go all-in with remaining chips
    };
  }

  return {
    valid: true,
    callAmount,
  };
}

/**
 * Validate if a check action is legal
 */
export function validateCheck(
  state: TexasHoldemState,
  playerIndex: number
): { valid: boolean; error?: string } {
  const player = state.players[playerIndex];
  const currentBet = state.roundBets[player.address] || 0;

  if (currentBet < state.highestBet) {
    return {
      valid: false,
      error: 'Cannot check - must call, raise, or fold',
    };
  }

  return { valid: true };
}

/**
 * Validate if betting round is complete
 * All players must have bet the same amount, or folded
 */
export function isBettingRoundComplete(state: TexasHoldemState): boolean {
  const activePlayers = state.players.filter(p => !p.hasFolded);
  
  if (activePlayers.length <= 1) {
    return true; // Round ends if only one player remains
  }

  // Check if all active players have bet the same amount
  const allBetsEqual = activePlayers.every(player => {
    const playerBet = state.roundBets[player.address] || 0;
    return playerBet === state.highestBet;
  });

  return allBetsEqual;
}

/**
 * Calculate pot odds for decision making
 * Pot odds = (amount to call) / (pot after call)
 */
export function calculatePotOdds(
  state: TexasHoldemState,
  playerIndex: number
): number {
  const player = state.players[playerIndex];
  const currentBet = state.roundBets[player.address] || 0;
  const amountToCall = state.highestBet - currentBet;
  const potAfterCall = state.pot + amountToCall;

  if (potAfterCall === 0) return 0;
  return amountToCall / potAfterCall;
}

/**
 * Format chip amount for display
 */
export function formatChips(amount: number): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toString();
}

/**
 * Get betting round name for display
 */
export function getBettingRoundName(
  round: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'handover'
): string {
  const names: Record<typeof round, string> = {
    preflop: 'Pre-Flop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
    handover: 'Hand Over',
  };
  return names[round];
}

/**
 * Validate game state consistency
 * Ensures pot matches sum of all bets
 */
export function validateGameState(state: TexasHoldemState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check chip conservation
  const totalChips = state.players.reduce((sum, p) => sum + p.chips, 0) + state.pot;
  const expectedTotal = 1000 * state.players.length; // Starting chips per player
  
  if (Math.abs(totalChips - expectedTotal) > 0.01) {
    errors.push(`Chip count mismatch: ${totalChips} vs expected ${expectedTotal}`);
  }

  // Check pot is non-negative
  if (state.pot < 0) {
    errors.push('Pot cannot be negative');
  }

  // Check player chips are non-negative
  state.players.forEach((player, idx) => {
    if (player.chips < 0) {
      errors.push(`Player ${idx} has negative chips: ${player.chips}`);
    }
  });

  // Check betting round consistency
  if (state.currentBettingRound === 'showdown' && state.pot === 0) {
    errors.push('Showdown with empty pot');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get minimum raise amount for current game state
 */
export function getMinimumRaise(state: TexasHoldemState): number {
  if (state.highestBet === 0 || state.highestBet === state.bigBlindAmount) {
    return state.bigBlindAmount; // Opening bet
  }
  return state.highestBet * 2; // 2× current bet
}

/**
 * Check if action would result in all-in
 */
export function wouldBeAllIn(
  state: TexasHoldemState,
  playerIndex: number,
  betAmount: number
): boolean {
  const player = state.players[playerIndex];
  const currentBet = state.roundBets[player.address] || 0;
  const additionalAmount = betAmount - currentBet;
  
  return additionalAmount >= player.chips;
}
