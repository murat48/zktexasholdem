'use client';

import { useState, useEffect } from 'react';
import { PokerGameState, Card } from '@/lib/poker';
import { placeBet, foldHand, POKER_CONTRACT } from '@/lib/stellar';

export function useGameState(gameId: string, walletAddress?: string | null, signTransaction?: (xdr: string) => Promise<string>) {
  const [state, setState] = useState<PokerGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Fetch game state from blockchain
    const fetchGameState = async () => {
      try {
        setIsLoading(true);
        // TODO: Implement actual blockchain fetch using POKER_CONTRACT
        // For now, create mock state with actual contract info
        
        // Initial blinds: Small blind = 5, Big blind = 10
        const smallBlind = 5;
        const bigBlind = 10;
        const yourAddress = walletAddress || 'GCXOW6524GWIAGUCZVEMA73BEMCASW56AKCHTPGF6I7IJJ6Q6NRTG7XR';
        const opponentAddress = 'GAJQWJVTIMVGKWZNVQLGLSRKLU5CBHUVVQAGHUONZH74LKXHZ4NJWQTI';
        
        const mockState: PokerGameState = {
          gameId,
          players: [
            {
              address: yourAddress,
              chips: 985,
              commitment: '',
              currentBet: 10,
              hasFolded: false,
            },
            {
              address: opponentAddress,
              chips: 995,
              commitment: '',
              currentBet: 5,
              hasFolded: false,
            },
          ],
          pot: 15,
          communityCards: [],
          currentRound: 'preflop',
          dealerButton: 1,
          currentPlayer: 0,
        };
        
        console.log('Game State Loaded:', {
          yourAddress,
          gameId,
          myPlayerIndex: mockState.players.findIndex(p => p.address === yourAddress),
          isMyTurn: mockState.currentPlayer === mockState.players.findIndex(p => p.address === yourAddress),
        });
        
        setState(mockState);
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    };

    fetchGameState();
  }, [gameId, walletAddress]);

  const actions = {
    bet: async (amount: number) => {
      console.log('🎯 Bet action called:', amount);
      if (!walletAddress || !signTransaction) {
        console.error('❌ Wallet not connected:', { walletAddress, hasSignTx: !!signTransaction });
        throw new Error('Wallet not connected');
      }
      
      try {
        console.log('💰 Placing bet:', amount);
        // Uncomment when contract is ready
        // await placeBet(walletAddress, amount, walletAddress, signTransaction);
        
        setState(prev => {
          if (!prev) return prev;
          const playerIndex = prev.players.findIndex(p => p.address === walletAddress);
          const updated = {
            ...prev,
            pot: prev.pot + amount,
            currentPlayer: (playerIndex + 1) % 2 as 0 | 1, // Switch to opponent
            players: prev.players.map(p => 
              p.address === walletAddress 
                ? { ...p, chips: Math.max(0, p.chips - amount), currentBet: p.currentBet + amount }
                : p
            ),
          };
          console.log('✅ Bet state updated:', { newPot: updated.pot, nextPlayer: updated.currentPlayer });
          return updated;
        });
      } catch (err) {
        console.error('❌ Bet failed:', err);
        throw err;
      }
    },
    
    fold: async () => {
      console.log('🎯 Fold action called');
      if (!walletAddress || !signTransaction) {
        console.error('❌ Wallet not connected');
        throw new Error('Wallet not connected');
      }
      
      try {
        console.log('🚫 Folding hand');
        // Uncomment when contract is ready
        // await foldHand(walletAddress, walletAddress, signTransaction);
        
        setState(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            // Fold = opponent wins immediately, move to next hand
            players: prev.players.map(p => 
              p.address === walletAddress 
                ? { ...p, hasFolded: true }
                : p
            ),
            currentPlayer: (prev.currentPlayer + 1) % 2 as 0 | 1,
          };
          console.log('✅ Fold state updated - opponent wins!');
          return updated;
        });
      } catch (err) {
        console.error('❌ Fold failed:', err);
        throw err;
      }
    },
    
    check: async () => {
      console.log('🎯 Check action called');
      if (!walletAddress || !signTransaction) {
        console.error('❌ Wallet not connected');
        throw new Error('Wallet not connected');
      }
      
      try {
        console.log('✅ Checking');
        // No contract call needed for check, just move to next player
        setState(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            currentPlayer: (prev.currentPlayer + 1) % 2 as 0 | 1,
          };
          console.log('✅ Check state updated, next player:', updated.currentPlayer);
          return updated;
        });
      } catch (err) {
        console.error('❌ Check failed:', err);
        throw err;
      }
    },
  };

  return { state, isLoading, error, actions };
}

// Opponent AI - makes random moves on its turn
export function useOpponentAI(state: PokerGameState | null, actions: any) {
  useEffect(() => {
    if (!state || state.currentPlayer !== 1) return;
    
    const opponent = (state.players[1] as any);
    if (!opponent || opponent.hasFolded || !opponent.isAI) return;
    
    // Random delay 1-3 seconds for realistic gameplay
    const delay = Math.random() * 2000 + 1000;
    
    const timer = setTimeout(async () => {
      const rand = Math.random();
      
      try {
        // Get betting amounts
        const myBet = state.players[0].currentBet;
        const oppBet = opponent.currentBet;
        const callAmount = Math.max(0, myBet - oppBet);
        
        if (rand < 0.2) {
          // Fold (20%)
          console.log('🤖 Opponent: Fold');
          await actions.fold();
        } else if (rand < 0.5) {
          // Check/Call (30%)
          if (callAmount === 0) {
            console.log('🤖 Opponent: Check');
            await actions.check();
          } else {
            console.log('🤖 Opponent: Call', callAmount);
            await actions.bet(callAmount);
          }
        } else if (rand < 0.75) {
          // Call slightly more (25%)
          const callWithExtra = Math.min(callAmount + 10, opponent.chips);
          console.log('🤖 Opponent: Bet', callWithExtra);
          await actions.bet(callWithExtra);
        } else {
          // Aggressive raise (25%)
          const minRaise = Math.max(10, callAmount + 20);
          const maxRaise = Math.min(minRaise + 50, opponent.chips);
          const raiseAmount = Math.round(Math.random() * (maxRaise - minRaise) + minRaise);
          console.log('🤖 Opponent: Aggressive Bet', raiseAmount);
          await actions.bet(raiseAmount);
        }
      } catch (err) {
        console.error('🤖 Opponent action failed:', err);
      }
    }, delay);
    
    return () => clearTimeout(timer);
  }, [state, actions]);
}
