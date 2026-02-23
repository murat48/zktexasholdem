'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/lib/poker';
import { calculateHandRank, generateHandRankProof, generateSalt, generateCommitment } from '@/lib/zkproof';
import { validateBetAmount, validateCall, validateCheck, validateGameState } from '@/lib/validation';
import {
  notifyGameStart,
  notifyGameEnd,
  resolveShowdownWithZK,
  initPokerGame,
  sendFold,
  sendPlaceBet,
  sendRevealCommunityCards,
  submitCardCommitment,
  submitBotCardCommitment,
} from '@/lib/zk-contract';
import { loadSelectedOpponent, getAIDecision } from '@/lib/ai-opponents';

// Secret keys are server-side only (handled by /api/sign-transaction).

// Hand evaluation
function getRank(card: number): number {
  return card % 13; // 0-12: 2-A
}

function getSuit(card: number): number {
  return Math.floor(card / 13); // 0-3: clubs, diamonds, hearts, spades
}

function getCardName(card: number): string {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits = ['♣', '♦', '♥', '♠'];
  const rank = ranks[getRank(card)];
  const suit = suits[getSuit(card)];
  return `${rank}${suit}`;
}

interface HandRanking {
  rank: number; // 0=high card, 9=royal flush
  values: number[]; // For tiebreaker
}

function evaluateHand(cards: number[]): HandRanking {
  if (cards.length !== 5) throw new Error('Hand must be 5 cards');
  
  const ranks = cards.map(getRank).sort((a, b) => b - a);
  const suits = cards.map(getSuit);
  const isFlush = suits.every(s => s === suits[0]);
  
  // Check straight
  const rankSet = new Set(ranks);
  let isStraight = false;
  let straightHigh = 0;
  
  if (rankSet.size === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    }
    // Ace-low straight (A-2-3-4-5)
    if (ranks.includes(12) && ranks.includes(3) && ranks[0] === 3) {
      isStraight = true;
      straightHigh = 4; // In ace-low straight, 5 is high
    }
  }
  
  // Count ranks
  const rankCounts: { [key: number]: number } = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  
  const counts = Object.entries(rankCounts)
    .map(([r, c]) => [parseInt(r), c] as [number, number])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  
  // Determine hand rank
  if (isFlush && isStraight) {
    return { rank: straightHigh === 12 ? 9 : 8, values: [straightHigh] }; // Royal/Straight flush
  }
  if (counts[0][1] === 4) {
    return { rank: 7, values: [counts[0][0], counts[1][0]] }; // Four of a kind
  }
  if (counts[0][1] === 3 && counts[1][1] === 2) {
    return { rank: 6, values: [counts[0][0], counts[1][0]] }; // Full house
  }
  if (isFlush) {
    return { rank: 5, values: ranks }; // Flush
  }
  if (isStraight) {
    return { rank: 4, values: [straightHigh] }; // Straight
  }
  if (counts[0][1] === 3) {
    return { rank: 3, values: [counts[0][0], counts[1][0], counts[2][0]] }; // Three of a kind
  }
  if (counts[0][1] === 2 && counts[1][1] === 2) {
    const pairs = [counts[0][0], counts[1][0]].sort((a, b) => b - a);
    return { rank: 2, values: [...pairs, counts[2][0]] }; // Two pair
  }
  if (counts[0][1] === 2) {
    return { rank: 1, values: [counts[0][0], counts[1][0], counts[2][0], counts[3][0]] }; // One pair
  }
  return { rank: 0, values: ranks }; // High card
}

function compareHands(hand1: HandRanking, hand2: HandRanking): number {
  if (hand1.rank !== hand2.rank) return hand1.rank > hand2.rank ? 1 : -1;
  
  for (let i = 0; i < hand1.values.length; i++) {
    if (hand1.values[i] !== hand2.values[i]) {
      return hand1.values[i] > hand2.values[i] ? 1 : -1;
    }
  }
  return 0; // Tie
}

function bestFiveCardHand(sevenCards: number[]): { cards: number[]; ranking: HandRanking } {
  let best = { cards: sevenCards.slice(0, 5), ranking: evaluateHand(sevenCards.slice(0, 5)) };
  
  // Try all 5-card combinations from 7 cards
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const hand = sevenCards.filter((_, idx) => idx !== i && idx !== j);
      const ranking = evaluateHand(hand);
      if (compareHands(ranking, best.ranking) > 0) {
        best = { cards: hand, ranking };
      }
    }
  }
  
  return best;
}

// Shuffle deck
function shuffleDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface TexasHoldemState {
  gameId: string;
  deck: number[];
  
  // Players
  players: {
    address: string;
    holeCards: [number, number];
    chips: number;
    hasFolded: boolean;
    isAI: boolean;
  }[];
  
  // Community cards
  communityCards: Card[];
  
  // Betting
  pot: number;
  dealerButton: 0 | 1; // Who is dealer
  smallBlindAmount: number;
  bigBlindAmount: number;
  
  // Betting round state
  currentBettingRound: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'handover';
  highestBet: number; // Highest bet in current round
  roundBets: { [address: string]: number }; // Bets contributed in current round
  currentPlayer: 0 | 1; // Whose turn
  
  // Game status
  bettingRoundComplete: boolean;
  
  // Timeout tracking (30 seconds per action as per texas.md)
  actionStartTime?: number;
  actionTimeoutSeconds: number;
  
  // Winner information
  lastHandWinner?: 0 | 1 | 'tie';
  lastHandWinAmount?: number;
  
  // Game over state
  isGameOver?: boolean;
  gameOverWinner?: 0 | 1;
  nextHandCountdown?: number; // Countdown in seconds before next hand
}

interface GameActions {
  fold: () => void;
  check: () => void;
  call: () => void;
  bet: (amount: number) => void;
  startNewHand: () => void;
  restartGame: () => void;
  /** PvP only: immediately end the game with the given player index as winner */
  forfeit: (winnerIndex: 0 | 1) => void;
}

export function useTexasHoldem(
  gameId: string, 
  walletAddress?: string | null,
  signTransaction?: (xdr: string) => Promise<string>,
  /** PvP: pass P2's wallet address to replace AI bot opponent */
  pvpOpponentAddress?: string | null,
) {
  // PvP mode: player 1 is a real human (GUEST) — use deployer signer for
  // their on-chain calls (fold/call/bet) since AI_BOT_SECRET can't sign for them.
  const isPvP = !!pvpOpponentAddress;

  const [state, setState] = useState<TexasHoldemState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restartTrigger, setRestartTrigger] = useState(0);

  // Guard against double-call in React Strict Mode for start_game.
  // A Set keyed by `gameId + restartTrigger` survives the double-invoke because
  // the second call sees the key already present and skips.
  const gameStartNotifiedRef = useRef<Set<string>>(new Set());

  // Guard for end_game — simple boolean, reset on restartGame
  const gameEndNotifiedRef = useRef<boolean>(false);

  // Track whether ZK proof + resolve_showdown is in-flight
  // (gates end_game and page countdown)
  const [isZkPending, setIsZkPending] = useState(false);

  // Synchronous guard: prevents startNewHand from firing multiple times
  // (setIsLoading is async/batched by React, so rapid calls bypass it).
  const newHandInFlightRef = useRef(false);

  // Initialize game
  useEffect(() => {
    setIsLoading(true);
    
    const deck = shuffleDeck();
    const yourAddress = walletAddress || 'GCXOW6524GWIAGUCZVEMA73BEMCASW56AKCHTPGF6I7IJJ6Q6NRTG7XR';
    // PvP mode: use real opponent address; AI mode: use bot address
    const opponentAddress = pvpOpponentAddress
      || process.env.NEXT_PUBLIC_AI_BOT_ADDRESS
      || 'GAJXYRRBECPQVCOCCLBCCZ2KGGNEHL32TLJRT2JWLNVE4HJ35OAKAPH2';
    const isOpponentAI = !pvpOpponentAddress;
    
    const smallBlindAmount = 10;
    const bigBlindAmount = 20;
    
    // Deal 2 cards to each player
    const card1You = deck[0];
    const card2You = deck[1];
    const card1Opp = deck[2];
    const card2Opp = deck[3];
    
    const gameState: TexasHoldemState = {
      gameId,
      deck: deck.slice(4),
      
      players: [
        {
          address: yourAddress,
          holeCards: [card1You, card2You],
          chips: 1000 - smallBlindAmount, // Posted small blind
          hasFolded: false,
          isAI: false,
        },
        {
          address: opponentAddress,
          holeCards: [card1Opp, card2Opp],
          chips: 1000 - bigBlindAmount, // Posted big blind
          hasFolded: false,
          isAI: isOpponentAI,
        },
      ],
      
      communityCards: [],
      pot: smallBlindAmount + bigBlindAmount,
      dealerButton: 1, // Opponent is dealer
      smallBlindAmount,
      bigBlindAmount,
      
      currentBettingRound: 'preflop',
      highestBet: bigBlindAmount, // Big blind is highest at start
      roundBets: {
        [yourAddress]: smallBlindAmount,
        [opponentAddress]: bigBlindAmount,
      },
      currentPlayer: 0, // Small blind acts first preflop
      bettingRoundComplete: false,
      
      // Timeout configuration (as per texas.md: 30 seconds per action)
      actionStartTime: Date.now(),
      actionTimeoutSeconds: 30,
    };
    
    console.log('🎮 Game initialized:', {
      yourCards: [getCardName(card1You), getCardName(card2You)],
      oppCards: ['?', '?'],
      pot: gameState.pot,
      yourChips: gameState.players[0].chips,
      oppChips: gameState.players[1].chips,
      smallBlind: smallBlindAmount,
      bigBlind: bigBlindAmount,
      currentPlayer: 'You (small blind)',
    });
    
    // IMPORTANT: initPokerGame MUST complete (await + ledger confirmation) before
    // notifyGameStart fires — both use the deployer account; sending both without
    // waiting causes tx_bad_seq (same sequence number grabbed by the second call).
    const startKey = `${gameId}-${restartTrigger}`;
    if (!gameStartNotifiedRef.current.has(startKey)) {
      gameStartNotifiedRef.current.add(startKey);
      (async () => {
        try {
          // 1. init_game first — waits for on-chain confirmation so seq advances
          await initPokerGame(gameId, yourAddress, opponentAddress, 1000000);
          // 2. Submit P1 (human) card commitment — before any community cards
          await submitCardCommitment([card1You, card2You], yourAddress);
          // 3. Submit P2 (bot) card commitment — before any community cards
          //    MUST happen here (not at showdown) to preserve commit-reveal security:
          //    the bot cannot be allowed to commit AFTER seeing community cards.
          await submitBotCardCommitment([card1Opp, card2Opp], opponentAddress, gameId);
          // 4. start_game after — deployer seq is now N+3, no collision
          notifyGameStart(gameId, yourAddress, opponentAddress, signTransaction)
            .catch(err => console.error('start_game error:', err));
          // 5. ALL deployer txs are confirmed — safe to allow betting/place_bet
          console.log('✅ On-chain setup complete: init_game + 2×commit + start_game');
        } catch (err) {
          console.error('❌ On-chain setup failed — game may not work correctly:', err);
        } finally {
          setIsLoading(false);
        }
      })();
    }
    
    setState(gameState);
    // NOTE: setIsLoading(false) is called INSIDE the async block above,
    // after all deployer txs confirm — this prevents place_bet from firing
    // while submit_commitment is still in-flight (which caused tx_bad_seq,
    // leaving commitments at zero and crashing resolve_showdown).
    
    return () => {};
  }, [walletAddress, restartTrigger, gameId, pvpOpponentAddress]);

  // When the game ends, notify Game Hub exactly once.
  // Gate on isZkPending=false: ZK proof + resolve_showdown must confirm first
  // so end_game never races with in-flight DEPLOYER txs (no tx_bad_seq).
  useEffect(() => {
    if (!state?.isGameOver) return;
    if (gameEndNotifiedRef.current) return; // already sent

    // Capture values before async delay (avoid stale closure)
    const winner = state.gameOverWinner;
    const winnerAddress = winner !== undefined
      ? state.players[winner].address
      : state.players[0].address; // fallback: both bust, player0 wins
    const p1Score = state.players[0].chips;
    const p2Score = state.players[1].chips;
    const p1Address = state.players[0].address;
    const gameId = state.gameId;

    const fire = () => {
      if (gameEndNotifiedRef.current) return;
      gameEndNotifiedRef.current = true;
      console.log('🏁 Sending end_game to Game Hub — winner:', winnerAddress);
      notifyGameEnd(gameId, winnerAddress, p1Score, p2Score, p1Address)
        .catch(err => console.error('end_game error:', err));
    };

    if (!isZkPending) {
      // ZK already confirmed — fire after small buffer
      console.log('🏁 end_game scheduled in 3s (ZK confirmed) — winner:', winnerAddress);
      const t = setTimeout(fire, 3000);
      return () => clearTimeout(t);
    } else {
      // ZK still in-flight — hard fallback at 45s so end_game is never skipped
      console.log('🏁 end_game hard fallback scheduled in 45s — winner:', winnerAddress);
      const t = setTimeout(fire, 45000);
      return () => clearTimeout(t);
    }
  }, [state?.isGameOver, isZkPending]);

  // Always-up-to-date ref — used by the beforeunload handler (closure can't see state)
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  // Send end_game when the user navigates away / closes the tab,
  // even if the game isn't formally over (chips haven't hit 0 yet).
  // Uses navigator.sendBeacon so the request survives page unload.
  useEffect(() => {
    const sendBeacon = () => {
      if (gameEndNotifiedRef.current) return; // already sent
      const s = latestStateRef.current;
      if (!s) return;
      gameEndNotifiedRef.current = true; // mark to prevent double-send

      const winner = s.isGameOver && s.gameOverWinner !== undefined
        ? s.players[s.gameOverWinner].address
        : s.players[0].chips >= s.players[1].chips
          ? s.players[0].address   // whoever has more chips at unload wins
          : s.players[1].address;

      const body = JSON.stringify({
        gameId:        s.gameId,
        winnerAddress: winner,
        p1Score:       s.players[0].chips,
        p2Score:       s.players[1].chips,
        p1Address:     s.players[0].address,
      });

      // sendBeacon survives tab close; fallback to fetch for other cases
      const beaconSent = typeof navigator !== 'undefined' &&
        navigator.sendBeacon('/api/end-game', new Blob([body], { type: 'application/json' }));

      if (!beaconSent) {
        // Fallback: regular fetch (works on component unmount, not on hard tab close)
        fetch('/api/end-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true, // hint browser to complete even after unload
        }).catch(() => {});
      }

      console.log('🏁 end_game beacon sent — winner:', winner);
    };

    window.addEventListener('beforeunload', sendBeacon);
    window.addEventListener('pagehide', sendBeacon);

    // Also fire on component unmount (React navigation, SPA route changes)
    return () => {
      window.removeEventListener('beforeunload', sendBeacon);
      window.removeEventListener('pagehide', sendBeacon);
      sendBeacon(); // fire immediately on unmount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally fires once

  const prevCommunityCardsRef = useRef<number[]>([]);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state) return;
    const cards = state.communityCards as unknown as number[];
    const prev = prevCommunityCardsRef.current;

    // New hand started — community cards reset to [] → reset the ref so
    // the next flop/all-in deal triggers the reveal correctly.
    if (cards.length === 0) {
      prevCommunityCardsRef.current = [];
      return;
    }

    // Only send reveal when cards were actually added this update.
    // Skip if all 5 cards appeared at once (all-in) — resolveShowdownWithZK
    // will send reveal_community_cards itself before resolve_showdown.
    if (cards.length > prev.length) {
      prevCommunityCardsRef.current = cards; // update immediately to prevent duplicates
      const isAllInDeal = prev.length === 0 && cards.length === 5;
      const isRiver = cards.length === 5;
      if (isAllInDeal || isRiver) {
        console.log(`🃏 ${isAllInDeal ? 'All-in deal (0→5)' : 'River (4→5)'} — skipping fire-and-forget reveal, resolveShowdownWithZK step 5c will handle it with waitConfirm=true`);
        return;
      }
      const playerAddress = state.players[0].address; // capture before async delay
      // ⏳ Delay 6s: if this is a normal round, a place_bet tx (DEPLOYER_ADDRESS) is
      // in-flight. reveal_community_cards also uses DEPLOYER_ADDRESS — waiting lets the
      // place_bet confirm so both get distinct sequence numbers (no tx_bad_seq).
      // Store timer ID so it can be canceled when showdown triggers (prevents
      // a stale 4-card reveal from overwriting step 5c's confirmed 5-card reveal).
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        console.log(`🃏 Sending reveal_community_cards (${prev.length}→${cards.length} cards)`);
        sendRevealCommunityCards(cards, playerAddress)
          .catch(err => console.error('reveal_community_cards error:', err));
      }, 6000);
    }
  }, [state?.communityCards]);

  // When showdown is reached (normal OR all-in), generate ZK proof and submit to contract
  const zkShowdownDoneRef = useRef<string>('');
  // Monotonically-increasing hand counter — ensures each hand gets a unique dedup key
  // even if the same player wins consecutive hands (same gameId+winner+cards combo).
  const handNumberRef = useRef<number>(0);
  useEffect(() => {
    if (!state) return;
    if (!walletAddress) return;

    // Fire on 'showdown' (normal river completion) OR 'handover' (all-in path)
    // In all-in: currentBettingRound is 'handover' but communityCards.length === 5
    const isShowdown = state.currentBettingRound === 'showdown';
    const isHandoverWithCards = state.currentBettingRound === 'handover' &&
      state.communityCards.length === 5 &&
      !state.players.some(p => p.hasFolded); // skip fold hands

    if (!isShowdown && !isHandoverWithCards) return;

    // Deduplicate: key uses handNumber so the same player winning consecutive hands
    // never re-uses the same key — each hand always gets its own ZK proof.
    const key = `${state.gameId}-hand${handNumberRef.current}`;
    if (zkShowdownDoneRef.current === key) return;
    zkShowdownDoneRef.current = key;

    const communityCards = state.communityCards as unknown as number[];
    if (communityCards.length < 5) return;

    console.log(`🔐 ZK proof trigger: ${state.currentBettingRound} (communityCards: ${communityCards.length})`);

    // Cancel any pending fire-and-forget reveal_community_cards (e.g. turn's 4-card reveal)
    // to prevent it from racing with step 5c's confirmed 5-card reveal.
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
      console.log('🃏 Canceled pending fire-and-forget reveal — step 5c will handle all 5 cards');
    }

    // ⏳ Wait 8s before resolve_showdown so that:
    //   1. Any pending place_bet txs (fire-and-forget, DEPLOYER_ADDRESS) land in a ledger
    //   2. reveal_community_cards tx (fire-and-forget, DEPLOYER_ADDRESS) lands
    //   → Avoids tx_bad_seq / sequence number collision between concurrent txs
    const zkInput = {
      gameId:            state.gameId,
      myHoleCards:       state.players[0].holeCards as [number, number],
      opponentHoleCards: state.players[1].holeCards as [number, number],
      communityCards:    communityCards.slice(0, 5) as [number, number, number, number, number],
      myAddress:         state.players[0].address,
      opponentAddress:   state.players[1].address,
      localWinner:       state.lastHandWinner,
      mySalt:            localStorage.getItem(`card_salt_${state.players[0].holeCards[0]}_${state.players[0].holeCards[1]}`)
                         || localStorage.getItem('card_salt')
                         || undefined,
      pot:               state.pot,
    };
    setIsZkPending(true);
    // Safety net: if ZK proves or tx hangs, force-clear after 90s so end_game
    // and the countdown are never permanently blocked.
    const zkMaxTimer = setTimeout(() => {
      console.warn('⚠️ ZK pending timeout (90s) — forcing isZkPending false');
      setIsZkPending(false);
    }, 90000);
    setTimeout(() => {
      resolveShowdownWithZK(zkInput, signTransaction)
        .catch(err => console.error('ZK showdown error:', err))
        .finally(() => { clearTimeout(zkMaxTimer); setIsZkPending(false); });
    }, 8000); // 8s: enough for fire-and-forget place_bet + reveal_community_cards to land
  }, [state?.currentBettingRound, state?.lastHandWinner, state?.communityCards?.length]);

  // Actions
  const actions: GameActions = {
    fold: () => {
      setState(prev => {
        if (!prev) return prev;
        const foldingPlayer = prev.currentPlayer;
        const winningPlayer = 1 - foldingPlayer; // The other player
        const potAmount = prev.pot;
        
        // Send fold to contract — both players use keypair auto-signing (no Freighter popup)
        if (foldingPlayer === 0 && walletAddress) {
          sendFold(walletAddress, undefined, 'deployer').catch(err => console.error('fold error:', err));
        } else if (foldingPlayer === 1) {
          const p1Address = prev.players[1].address;
          const signer = isPvP ? 'deployer' : 'ai_bot';
          sendFold(p1Address, undefined, signer).catch(err => console.error('p1 fold error:', err));
        }
        
        // Create new players array with updated values
        const newPlayers = prev.players.map((p, i) => {
          if (i === foldingPlayer) {
            return { ...p, hasFolded: true };
          } else if (i === winningPlayer) {
            return { ...p, chips: p.chips + potAmount };
          }
          return { ...p };
        });
        
        console.log('🚫 Player', foldingPlayer, 'folded! Player', winningPlayer, 'wins pot:', potAmount);
        
        const updated = {
          ...prev,
          players: newPlayers as [typeof prev.players[0], typeof prev.players[1]],
          lastHandWinner: winningPlayer as 0 | 1,
          lastHandWinAmount: potAmount,
          pot: 0,
          currentBettingRound: 'handover' as const,
        };
        
        return updated;
      });
    },

    check: () => {
      setState(prev => {
        if (!prev) return prev;
        const playerIndex = prev.currentPlayer;
        const nextPlayer = (prev.currentPlayer + 1) % 2 as 0 | 1;
        
        console.log('✓ Checked');
        
        // Check if both players have bet same amount
        const allBetEqual = Object.values(prev.roundBets).every(b => b === prev.highestBet);
        
        if (allBetEqual) {
          // Check if any player is all-in (0 chips)
          const anyPlayerAllIn = prev.players.some(p => p.chips === 0);
          if (anyPlayerAllIn) {
            console.log('🎲 Player is ALL-IN! Going to showdown...');
            return progressToShowdown(prev);
          }
          // Post-flop: if this is the first actor this round and no bets have been
          // made yet (highestBet=0), the opponent still needs a chance to act.
          // Only advance when the SECOND actor checks (closes the action).
          const firstActor = ((prev.dealerButton + 1) % 2) as 0 | 1;
          if (prev.highestBet === 0 && playerIndex === firstActor) {
            console.log('✓ First actor checked — giving opponent a turn before advancing');
            return { ...prev, currentPlayer: nextPlayer };
          }
          // Second actor checked (or preflop BB option) — round is complete
          return progressToNextPhase(prev);
        } else {
          // Give opponent turn
          return {
            ...prev,
            currentPlayer: nextPlayer,
          };
        }
      });
    },

    call: () => {
      setState(prev => {
        if (!prev) return prev;
        const playerIndex = prev.currentPlayer;
        const callAmount = prev.highestBet - prev.roundBets[prev.players[playerIndex].address];
        
        if (callAmount <= 0) {
          // Nothing to call — treat as a check inline (no nested setState side-effect)
          const nextPlayer = ((prev.currentPlayer + 1) % 2) as 0 | 1;
          const allBetEqual = Object.values(prev.roundBets).every(b => b === prev.highestBet);
          if (allBetEqual) {
            const anyPlayerAllIn = prev.players.some(p => p.chips === 0);
            if (anyPlayerAllIn) return progressToShowdown(prev);
            const firstActor = ((prev.dealerButton + 1) % 2) as 0 | 1;
            if (prev.highestBet === 0 && playerIndex === firstActor) {
              return { ...prev, currentPlayer: nextPlayer };
            }
            return progressToNextPhase(prev);
          }
          return { ...prev, currentPlayer: nextPlayer };
        }
        
        // Limit call amount to available chips (all-in) - prevent negative balance
        const actualCallAmount = Math.min(callAmount, Math.max(0, prev.players[playerIndex].chips));
        const isAllIn = actualCallAmount === prev.players[playerIndex].chips;
        
        // Send call (as place_bet) to contract — both players use keypair auto-signing (no Freighter popup)
        if (playerIndex === 0 && walletAddress && actualCallAmount > 0) {
          sendPlaceBet(walletAddress, actualCallAmount, undefined, 'deployer').catch(err => console.error('call error:', err));
        } else if (playerIndex === 1 && actualCallAmount > 0) {
          const p1Address = prev.players[1].address;
          const signer = isPvP ? 'deployer' : 'ai_bot';
          sendPlaceBet(p1Address, actualCallAmount, undefined, signer).catch(err => console.error('p1 call error:', err));
        }
        
        // Create new players array with updated chips - ensure non-negative
        const newPlayers = prev.players.map((p, i) => {
          if (i === playerIndex) {
            const newChips = Math.max(0, p.chips - actualCallAmount);
            return { ...p, chips: newChips };
          }
          return { ...p };
        }) as [typeof prev.players[0], typeof prev.players[1]];
        
        const updated = {
          ...prev,
          players: newPlayers,
          roundBets: {
            ...prev.roundBets,
            [prev.players[playerIndex].address]: prev.roundBets[prev.players[playerIndex].address] + actualCallAmount,
          },
          pot: prev.pot + actualCallAmount,
          currentPlayer: ((prev.currentPlayer + 1) % 2) as 0 | 1,
        };
        
        console.log('📞 Called:', actualCallAmount, isAllIn ? '(ALL-IN!)' : '');
        console.log('Roundbets after call:', updated.roundBets);
        console.log('Highest bet:', updated.highestBet);
        console.log('Player chips after call:', updated.players.map(p => p.chips));
        
        // If either player has 0 chips after this call → all-in showdown.
        // This also handles the short-stack case where caller can't match the
        // full bet (roundBets won't be equal but hand must still be played out).
        const anyPlayerAllIn = updated.players.some(p => p.chips === 0);
        if (anyPlayerAllIn) {
          console.log('🎲 All-in detected after call — going to showdown automatically');
          // Heads-up: return any uncallable excess chips to the over-bettor
          const p0Addr = updated.players[0].address;
          const p1Addr = updated.players[1].address;
          const p0Committed = updated.roundBets[p0Addr];
          const p1Committed = updated.roundBets[p1Addr];
          const effectiveBet = Math.min(p0Committed, p1Committed);
          if (p0Committed !== p1Committed) {
            const overBettor = p0Committed > p1Committed ? 0 : 1;
            const excess = Math.abs(p0Committed - p1Committed);
            const fixedPlayers = updated.players.map((p, i) =>
              i === overBettor ? { ...p, chips: p.chips + excess } : { ...p }
            ) as [typeof updated.players[0], typeof updated.players[1]];
            return progressToShowdown({
              ...updated,
              players: fixedPlayers,
              pot: updated.pot - excess,
              roundBets: { [p0Addr]: effectiveBet, [p1Addr]: effectiveBet },
            });
          }
          return progressToShowdown(updated);
        }

        // Check if both players have bet same amount
        const allBetEqual = Object.values(updated.roundBets).every(b => b === updated.highestBet);
        console.log('All bets equal?', allBetEqual);

        if (allBetEqual) {
          // ONLY exception: preflop SB limp (SB calls the big blind without raising).
          // In this case BB hasn't had a voluntary action yet → give BB the option.
          // All other calls CLOSE the action → go to next street immediately.
          const isPreflopSBLimp =
            prev.currentBettingRound === 'preflop' &&
            playerIndex === 0 && // SB just called
            prev.highestBet === prev.bigBlindAmount; // nobody raised

          if (isPreflopSBLimp) {
            console.log('✅ Preflop SB limp — giving BB option (check/raise)');
            return updated; // BB (player1/AI) gets to act
          }

          // All other scenarios: call closes the action → advance to next street.
          console.log('✅ Call closes action → next phase / showdown');
          return progressToNextPhase(updated);
        }
        
        return updated;
      });
    },

    bet: (amount: number) => {
      setState(prev => {
        if (!prev) return prev;
        const playerIndex = prev.currentPlayer;
        const currentBet = prev.roundBets[prev.players[playerIndex].address];
        const raiseAmount = amount - currentBet;
        
        // Limit raise amount to available chips (all-in) - prevent negative balance
        const actualRaiseAmount = Math.min(raiseAmount, Math.max(0, prev.players[playerIndex].chips));
        const actualTotalBet = currentBet + actualRaiseAmount;
        const isAllIn = actualRaiseAmount === prev.players[playerIndex].chips;
        
        // Send bet to contract — both players use keypair auto-signing (no Freighter popup)
        if (playerIndex === 0 && walletAddress && actualRaiseAmount > 0) {
          sendPlaceBet(walletAddress, actualRaiseAmount, undefined, 'deployer').catch(err => console.error('bet error:', err));
        } else if (playerIndex === 1 && actualRaiseAmount > 0) {
          const p1Address = prev.players[1].address;
          const signer = isPvP ? 'deployer' : 'ai_bot';
          sendPlaceBet(p1Address, actualRaiseAmount, undefined, signer).catch(err => console.error('p1 bet error:', err));
        }
        
        // Create new players array with updated chips - ensure non-negative
        const newPlayers = prev.players.map((p, i) => {
          if (i === playerIndex) {
            const newChips = Math.max(0, p.chips - actualRaiseAmount);
            return { ...p, chips: newChips };
          }
          return { ...p };
        }) as [typeof prev.players[0], typeof prev.players[1]];
        
        const updated = {
          ...prev,
          players: newPlayers,
          roundBets: {
            ...prev.roundBets,
            [prev.players[playerIndex].address]: actualTotalBet,
          },
          pot: prev.pot + actualRaiseAmount,
          highestBet: Math.max(prev.highestBet, actualTotalBet),
          currentPlayer: ((prev.currentPlayer + 1) % 2) as 0 | 1,
        };
        
        console.log('💰 Bet:', actualTotalBet, 'Total in pot:', updated.pot, isAllIn ? '(ALL-IN!)' : '');
        
        // If BOTH players have 0 chips after this bet (edge case: opponent was already
        // all-in from a previous action), skip the opponent turn and go to showdown.
        const bothAllIn = updated.players.every(p => p.chips === 0);
        if (bothAllIn) {
          console.log('🎲 Both players all-in — going to showdown automatically');
          return progressToShowdown(updated);
        }

        return updated;
      });
    },

    startNewHand: () => {
      // Synchronous dedup: prevent double-firing from countdown + Skip button race
      if (newHandInFlightRef.current) {
        console.log('⚠️ startNewHand already in-flight, skipping duplicate call');
        return;
      }
      newHandInFlightRef.current = true;

      // Increment hand counter BEFORE setState so the new ZK dedup key is fresh
      // when the showdown useEffect fires for this hand.
      handNumberRef.current += 1;
      // Gate UI: disable betting buttons while deployer txs (init_game + 2×commit)
      // are in-flight — prevents place_bet from colliding with submit_commitment
      // (both use deployer signer → same sequence number → tx_bad_seq).
      setIsLoading(true);
      setState(prev => {
        if (!prev) return prev;
        
        // Check if any player has insufficient chips to continue
        const minChipsRequired = prev.smallBlindAmount + prev.bigBlindAmount;
        const player0CanPlay = prev.players[0].chips >= prev.smallBlindAmount;
        const player1CanPlay = prev.players[1].chips >= prev.bigBlindAmount;
        
        if (!player0CanPlay || !player1CanPlay) {
          // Game over - someone can't afford the blinds
          const winner = player0CanPlay ? 0 : (player1CanPlay ? 1 : undefined);
          console.log('🏁 GAME OVER! Winner:', winner);
          // notifyGameEnd is handled by the useEffect watching state.isGameOver
          return {
            ...prev,
            isGameOver: true,
            gameOverWinner: winner as 0 | 1 | undefined,
            currentBettingRound: 'handover',
          };
        }
        
        console.log('🎲 Starting new hand...');
        
        // Shuffle new deck
        const deck = shuffleDeck();
        
        // Deal new cards
        const card1P0 = deck[0];
        const card2P0 = deck[1];
        const card1P1 = deck[2];
        const card2P1 = deck[3];
        
        // Keep current chips (they were already updated from last hand)
        const newState: TexasHoldemState = {
          ...prev,
          deck: deck.slice(4),
          
          players: [
            {
              ...prev.players[0],
              holeCards: [card1P0, card2P0],
              hasFolded: false,
              chips: prev.players[0].chips - prev.smallBlindAmount, // Deduct small blind
            },
            {
              ...prev.players[1],
              holeCards: [card1P1, card2P1],
              hasFolded: false,
              chips: prev.players[1].chips - prev.bigBlindAmount, // Deduct big blind
            },
          ],
          
          communityCards: [],
          pot: prev.smallBlindAmount + prev.bigBlindAmount,
          
          currentBettingRound: 'preflop',
          highestBet: prev.bigBlindAmount,
          roundBets: {
            [prev.players[0].address]: prev.smallBlindAmount,
            [prev.players[1].address]: prev.bigBlindAmount,
          },
          currentPlayer: 0, // Small blind acts first preflop
          bettingRoundComplete: false,
          
          actionStartTime: Date.now(),
          
          // Clear winner info
          lastHandWinner: undefined,
          lastHandWinAmount: undefined,
        };
        
        console.log('🎮 New hand started:', {
          player0Cards: [getCardName(card1P0), getCardName(card2P0)],
          player1Cards: [getCardName(card1P1), getCardName(card2P1)],
          pot: newState.pot,
          player0Chips: newState.players[0].chips,
          player1Chips: newState.players[1].chips,
        });

        // Re-initialize contract for new hand (is_active was set to false by previous resolve_showdown)
        // Then submit new commitment — all sequential so seq numbers don't collide
        const p0Addr = newState.players[0].address;
        const p1Addr = newState.players[1].address;
        const hGameId = newState.gameId;
        const newCards: [number, number] = [card1P0, card2P0];
        const botCards: [number, number] = [card1P1, card2P1];
        ;(async () => {
          try {
            await initPokerGame(hGameId, p0Addr, p1Addr, 1000000);
            // Submit P1 commitment before community cards
            await submitCardCommitment(newCards, p0Addr);
            // Submit bot commitment before community cards
            await submitBotCardCommitment(botCards, p1Addr, hGameId);
            // ALL deployer txs confirmed — safe to allow betting/place_bet
            console.log('✅ New hand on-chain setup complete: init_game + 2×commit');
          } catch (err) {
            console.error('❌ New hand on-chain setup failed:', err);
          } finally {
            setIsLoading(false);
            newHandInFlightRef.current = false;
          }
        })();

        return newState;
      });
    },
    
    restartGame: () => {
      console.log('🔄 Restarting game...');
      gameEndNotifiedRef.current = false; // reset so end_game fires for next session
      zkShowdownDoneRef.current = '';     // reset so ZK proof fires for next session
      handNumberRef.current = 0;          // reset hand counter for new session
      newHandInFlightRef.current = false; // reset so startNewHand can fire
      setRestartTrigger(prev => prev + 1);
    },
    forfeit: (winnerIndex: 0 | 1) => {
      console.log('🏳️  Forfeit — winner player index:', winnerIndex);
      setState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p, i) => ({
            ...p,
            chips: i === winnerIndex ? (p.chips + prev.pot) : p.chips,
          })) as [typeof prev.players[0], typeof prev.players[1]],
          pot: 0,
          currentBettingRound: 'handover' as const,
          isGameOver: true,
          gameOverWinner: winnerIndex,
          lastHandWinner: winnerIndex,
          lastHandWinAmount: 0,
        };
      });
    },
  };

  return { state, isLoading, actions, isZkPending };
}

// Fast-forward to showdown (used when player goes all-in)
function progressToShowdown(state: TexasHoldemState): TexasHoldemState {
  // Create proper deep copy for immutability
  const updated: TexasHoldemState = {
    ...state,
    players: state.players.map(p => ({ ...p })) as [typeof state.players[0], typeof state.players[1]],
    communityCards: [...state.communityCards],
    deck: [...state.deck],
    roundBets: { ...state.roundBets },
  };
  
  console.log('⚡ Fast-forwarding to showdown (all-in)...');
  console.log('Current community cards:', updated.communityCards.map(getCardName).join(', '));
  
  // Deal remaining community cards if needed
  if (updated.currentBettingRound === 'preflop') {
    // Deal flop, turn, river
    const newCards = [
      updated.deck[0], updated.deck[1], updated.deck[2], // Flop
      updated.deck[3], // Turn
      updated.deck[4], // River
    ];
    updated.communityCards = newCards;
    updated.deck = updated.deck.slice(5);
    console.log('🃏 Dealt all remaining cards:', updated.communityCards.map(getCardName));
  } else if (updated.currentBettingRound === 'flop') {
    // Deal turn, river
    const turn = updated.deck[0];
    const river = updated.deck[1];
    updated.communityCards = [...updated.communityCards, turn, river];
    updated.deck = updated.deck.slice(2);
    console.log('🃏 Dealt turn & river:', [getCardName(turn), getCardName(river)].join(', '));
  } else if (updated.currentBettingRound === 'turn') {
    // Deal river
    const river = updated.deck[0];
    updated.communityCards = [...updated.communityCards, river];
    updated.deck = updated.deck.slice(1);
    console.log('🃏 Dealt river:', getCardName(river));
  }
  
  console.log('Final community cards:', updated.communityCards.map(getCardName).join(', '));
  console.log('Community cards count:', updated.communityCards.length);
  
  // Now evaluate showdown
  console.log('🎯 SHOWDOWN');
  
  // Get all 7 cards for each player
  const player0Cards = [...updated.players[0].holeCards, ...updated.communityCards];
  const player1Cards = [...updated.players[1].holeCards, ...updated.communityCards];
  
  // Find best 5-card hand for each player
  const player0Best = bestFiveCardHand(player0Cards);
  const player1Best = bestFiveCardHand(player1Cards);
  
  console.log('🔐 Player 0 hole cards:', updated.players[0].holeCards.map(getCardName).join(', '));
  console.log('   Best hand:', player0Best.cards.map(getCardName).join(', '), 'Rank:', player0Best.ranking.rank);
  console.log('🔐 Player 1 hole cards:', updated.players[1].holeCards.map(getCardName).join(', '));
  console.log('   Best hand:', player1Best.cards.map(getCardName).join(', '), 'Rank:', player1Best.ranking.rank);
  
  // Compare hands
  const comparison = compareHands(player0Best.ranking, player1Best.ranking);
  
  // Distribute pot based on winner
  const potAmount = updated.pot;
  let winnerPlayers: [typeof updated.players[0], typeof updated.players[1]];
  let winner: 0 | 1 | 'tie';
  
  if (comparison > 0) {
    winnerPlayers = [
      { ...updated.players[0], chips: updated.players[0].chips + updated.pot },
      { ...updated.players[1] }
    ];
    winner = 0;
    console.log('🎉 Player 0 WINS!', potAmount, 'chips');
  } else if (comparison < 0) {
    winnerPlayers = [
      { ...updated.players[0] },
      { ...updated.players[1], chips: updated.players[1].chips + updated.pot }
    ];
    winner = 1;
    console.log('🎉 Player 1 WINS!', potAmount, 'chips');
  } else {
    const halfPot = Math.floor(updated.pot / 2);
    winnerPlayers = [
      { ...updated.players[0], chips: updated.players[0].chips + halfPot },
      { ...updated.players[1], chips: updated.players[1].chips + (updated.pot - halfPot) }
    ];
    winner = 'tie';
    console.log('🤝 SPLIT POT! Each gets:', halfPot, 'chips');
  }
  
  console.log('✅ Showdown complete');
  
  // Return completely new state object to ensure React detects the change
  return {
    ...updated,
    players: winnerPlayers,
    pot: 0,
    currentBettingRound: 'handover' as const,
    lastHandWinner: winner,
    lastHandWinAmount: potAmount,
  };
}

// Move to next phase
function progressToNextPhase(state: TexasHoldemState): TexasHoldemState {
  const updated = { ...state };
  
  switch (state.currentBettingRound) {
    case 'preflop':
      // Deal flop (3 cards)
      updated.communityCards = [
        state.deck[0],
        state.deck[1],
        state.deck[2],
      ];
      updated.deck = state.deck.slice(3);
      updated.currentBettingRound = 'flop';
      console.log('🃏 Flop dealt:', updated.communityCards.map(getCardName));
      break;
      
    case 'flop':
      // Deal turn (1 card)
      updated.communityCards = [...state.communityCards, state.deck[0]];
      updated.deck = state.deck.slice(1);
      updated.currentBettingRound = 'turn';
      console.log('🃏 Turn dealt:', getCardName(state.deck[0]));
      break;
      
    case 'turn':
      // Deal river (1 card)
      updated.communityCards = [...state.communityCards, state.deck[0]];
      updated.deck = state.deck.slice(1);
      updated.currentBettingRound = 'river';
      console.log('🃏 River dealt:', getCardName(state.deck[0]));
      break;
      
    case 'river':
      // Showdown - Evaluate best hands and determine winner
      updated.currentBettingRound = 'showdown';
      
      console.log('🎯 SHOWDOWN');
      
      // Get all 7 cards for each player
      const player0Cards = [...updated.players[0].holeCards, ...updated.communityCards];
      const player1Cards = [...updated.players[1].holeCards, ...updated.communityCards];
      
      // Find best 5-card hand for each player
      const player0Best = bestFiveCardHand(player0Cards);
      const player1Best = bestFiveCardHand(player1Cards);
      
      console.log('🔐 Player 0 hole cards:', updated.players[0].holeCards.map(getCardName).join(', '));
      console.log('   Best hand:', player0Best.cards.map(getCardName).join(', '), 'Rank:', player0Best.ranking.rank, 'Values:', player0Best.ranking.values);
      console.log('🔐 Player 1 hole cards:', updated.players[1].holeCards.map(getCardName).join(', '));
      console.log('   Best hand:', player1Best.cards.map(getCardName).join(', '), 'Rank:', player1Best.ranking.rank, 'Values:', player1Best.ranking.values);
      
      // Compare hands (returns 1 if player0 wins, -1 if player1 wins, 0 for tie)
      const comparison = compareHands(player0Best.ranking, player1Best.ranking);
      
      // Distribute pot based on winner
      const potAmount = updated.pot;
      if (comparison > 0) {
        // Player 0 wins - Create new player objects
        updated.players = [
          { ...updated.players[0], chips: updated.players[0].chips + updated.pot },
          { ...updated.players[1] }
        ];
        updated.lastHandWinner = 0;
        updated.lastHandWinAmount = potAmount;
        console.log('🎉 Player 0 WINS!', potAmount, 'chips. New balance:', updated.players[0].chips);
      } else if (comparison < 0) {
        // Player 1 wins - Create new player objects
        updated.players = [
          { ...updated.players[0] },
          { ...updated.players[1], chips: updated.players[1].chips + updated.pot }
        ];
        updated.lastHandWinner = 1;
        updated.lastHandWinAmount = potAmount;
        console.log('🎉 Player 1 WINS!', potAmount, 'chips. New balance:', updated.players[1].chips);
      } else {
        // Split pot (tie) - Create new player objects
        const halfPot = Math.floor(updated.pot / 2);
        updated.players = [
          { ...updated.players[0], chips: updated.players[0].chips + halfPot },
          { ...updated.players[1], chips: updated.players[1].chips + (updated.pot - halfPot) }
        ];
        updated.lastHandWinner = 'tie';
        updated.lastHandWinAmount = potAmount;
        console.log('🤝 SPLIT POT! Each gets:', halfPot, 'chips');
      }
      
      updated.pot = 0;
      updated.currentBettingRound = 'handover';
      console.log('✅ Showdown complete');
      break;
  }
  
  if (state.currentBettingRound !== 'river') {
    // Reset betting for new round
    updated.roundBets = {
      [updated.players[0].address]: 0,
      [updated.players[1].address]: 0,
    };
    updated.highestBet = 0;
    updated.currentPlayer = (updated.dealerButton + 1) % 2 as 0 | 1; // Big blind acts first post-flop
    updated.bettingRoundComplete = false;
  }
  
  return updated;
}

// Opponent AI
export function useOpponentAI(state: TexasHoldemState | null, actions: GameActions): { isAIThinking: boolean } {
  const isFiringRef = useRef(false);
  const [isAIThinking, setIsAIThinking] = useState(false);

  useEffect(() => {
    if (!state ||
        state.currentPlayer !== 1 ||
        state.currentBettingRound === 'showdown' ||
        state.currentBettingRound === 'handover' ||
        state.isGameOver) {
      return;
    }

    const opponent = state.players[1];
    if (opponent.hasFolded || !opponent.isAI) return;

    // Guard against double-fire
    if (isFiringRef.current) return;

    // Load selected AI opponent from localStorage
    const aiOpponent = loadSelectedOpponent();
    console.log(`🤖 ${aiOpponent.name} (${aiOpponent.providerLabel}) is thinking...`);

    // Reaction delay — provider-based personality feel
    const baseDelay = aiOpponent.provider === 'openai' ? 700
      : aiOpponent.provider === 'claude'  ? 1600
      : aiOpponent.provider === 'gemini'  ? 1100
      : 400;
    const delay = baseDelay + Math.random() * 1000;

    isFiringRef.current = true;
    setIsAIThinking(true);

    const timer = setTimeout(async () => {
      try {
        const callAmount = state.highestBet - state.roundBets[opponent.address];
        const oppCurrentRoundBet = state.roundBets[opponent.address];
        const myPlayer   = state.players[0];

        const decision = await getAIDecision(aiOpponent, {
          myCards: [0, 0] as [number, number], // ZK-hidden — AI reasons from board/pot
          communityCards: state.communityCards ?? [],
          myChips: opponent.chips,
          opponentChips: myPlayer.chips,
          pot: state.pot,
          callAmount,
          round: state.currentBettingRound,
        });

        try {
          switch (decision.type) {
            case 'fold':
              actions.fold();
              break;
            case 'check':
              actions.check();
              break;
            case 'call':
              actions.call();
              break;
            case 'bet':
            case 'raise': {
              // AI returns ADDITIONAL chips to wager.
              // actions.bet() expects TOTAL round bet = currentRoundBet + additional.
              const additional = Math.max(1, (decision as {type:string;amount:number}).amount);
              const totalBet   = oppCurrentRoundBet + additional;
              // Safety: if totalBet <= highestBet it's effectively a call
              if (additional <= 0 || totalBet <= state.highestBet) {
                actions.call();
              } else {
                actions.bet(totalBet);
              }
              break;
            }
            default:
              actions.check();
          }
        } catch (err) {
          console.error('🤖 Opponent action failed:', err);
          try { actions.check(); } catch {}
        }
      } finally {
        isFiringRef.current = false;
        setIsAIThinking(false);
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      isFiringRef.current = false;
      setIsAIThinking(false);
    };
  }, [state, actions]);

  return { isAIThinking };
}
