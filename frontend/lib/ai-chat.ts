/**
 * AI Chat Quips — funny/trash-talk lines for AI opponent persona.
 * Triggered by game events, no API calls.
 */

const QUIPS = {
  gameStart: [
    "Hey there! Let's have a great game 🎭",
    "Welcome! Let's see how this goes 😊",
    "Hello! ZK poker — a fair and transparent game awaits 🃏",
    "Hi! Good luck, let's have a fun match ✨",
    "Ready? So am I — let's go! 🚀",
  ],
  aiWin: [
    "Great hand! You played well, but this one's mine 🏆",
    "Close one! Better luck next hand 🍀",
    "Thanks for the game! Shall we continue? 🎯",
    "I'll take this one, but you're playing well — I'll be careful! 👍",
    "ZK proof confirmed fairness — and luck was on my side this time 🔐",
  ],
  aiFold: [
    "I'm folding this one, the math says so ♟️",
    "Fold! Sometimes the smartest move is stepping back 🏃",
    "This one's yours, nice play! 👏",
    "Fold. See you next hand ☕",
  ],
  aiBet: [
    "Raise! I trust my cards 😎",
    "Raising the stakes — let's see how this plays out 🔥",
    "Putting chips in, good luck! 🃏",
    "Time to apply some pressure 📈",
  ],
  aiCheck: [
    "Check — waiting for the cards to reveal 🎯",
    "Check. Patience is a strategy too 🃏",
    "Checking for now, but I'm watching ⏳",
  ],
  playerFold: [
    "Smart fold! We'll see you next hand 😊",
    "Good thinking! Poker is sometimes about waiting 🧠",
    "Alright, pot's mine — good luck next hand! 🤝",
    "Nice decision, sometimes folding is the right call 👍",
  ],
  playerWin: [
    "Congrats, you earned this hand! Well played 🎉",
    "Great hand! Nice work 👏",
    "You win! That was a really good move 🌟",
    "Well played! This pot is rightfully yours 💪",
    "Bravo! Keep it up next hand 😊",
  ],
  playerBet: [
    "Big bet! Let's see how it turns out 👀",
    "Bold move! Respect 🎲",
    "Interesting decision, let me think about this 🤔",
  ],
  showdown: [
    "Showdown! Let's see the cards 🎭",
    "The moment of truth! Who takes it? 😊",
    "ZK proof time — fairness recorded on the blockchain 🔐",
  ],
};

type QuipCategory = keyof typeof QUIPS;

function pick(category: QuipCategory): string {
  const arr = QUIPS[category];
  return arr[Math.floor(Math.random() * arr.length)];
}

export { pick as getAIQuip, type QuipCategory };

// ── useAIChat hook ──────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

export interface AIChatMessage {
  id: string;
  text: string;
  fromAI: boolean;
  ts: number;
}

interface GameEventState {
  currentBettingRound: string;
  lastHandWinner?: number | 'tie';
  currentPlayer?: number;
  players?: Array<{ hasFolded?: boolean; chips?: number }>;
  pot?: number;
  highestBet?: number;
}

export function useAIChat(
  state: GameEventState | null,
  myPlayerIndex: number,
) {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const prevRoundRef = useRef<string | null>(null);
  const prevWinnerRef = useRef<number | 'tie' | undefined>(undefined);
  const prevAIFoldedRef = useRef(false);
  const prevHighestBetRef = useRef(0);
  const prevAIChipsRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const aiIndex = 1 - myPlayerIndex;

  const addAI = (text: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      text,
      fromAI: true,
      ts: Date.now(),
    }]);
  };

  // Game start greeting (once)
  useEffect(() => {
    if (!state || startedRef.current) return;
    startedRef.current = true;
    setTimeout(() => addAI(pick('gameStart')), 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state]);

  // Watch game events
  useEffect(() => {
    if (!state) return;

    const round = state.currentBettingRound;
    const winner = state.lastHandWinner;
    const aiPlayer = state.players?.[aiIndex];
    const aiChips = aiPlayer?.chips ?? null;
    const aiFolded = aiPlayer?.hasFolded ?? false;
    const highestBet = state.highestBet ?? 0;
    const isAITurn = state.currentPlayer === aiIndex;

    // Round changed
    if (prevRoundRef.current !== null && prevRoundRef.current !== round) {
      if (round === 'showdown' || round === 'handover') {
        if (!aiFolded) {
          setTimeout(() => addAI(pick('showdown')), 150);
        }
      }
    }
    prevRoundRef.current = round;

    // AI folded this turn
    if (aiFolded && !prevAIFoldedRef.current) {
      setTimeout(() => addAI(pick('aiFold')), 100);
    }
    prevAIFoldedRef.current = aiFolded;

    // Hand winner changed
    if (winner !== undefined && winner !== prevWinnerRef.current) {
      if (winner === aiIndex) {
        setTimeout(() => addAI(pick('aiWin')), 200);
      } else if (winner === myPlayerIndex) {
        setTimeout(() => addAI(pick('playerWin')), 200);
      }
    }
    prevWinnerRef.current = winner;

    // AI bet/raised (chips decreased = AI put chips in pot)
    if (aiChips !== null && prevAIChipsRef.current !== null) {
      if (aiChips < prevAIChipsRef.current && isAITurn) {
        const diff = prevAIChipsRef.current - aiChips;
        if (diff > 10) {
          setTimeout(() => addAI(pick('aiBet')), 100);
        } else {
          setTimeout(() => addAI(pick('aiCheck')), 100);
        }
      }
    }
    if (aiChips !== null) prevAIChipsRef.current = aiChips;

    // High bet from player
    if (highestBet > prevHighestBetRef.current + 20 && !isAITurn) {
      setTimeout(() => addAI(pick('playerBet')), 150);
    }
    prevHighestBetRef.current = highestBet;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state?.currentBettingRound,
    state?.lastHandWinner,
    state?.currentPlayer,
    state?.players?.[aiIndex]?.hasFolded,
    state?.players?.[aiIndex]?.chips,
    state?.highestBet,
  ]);

  const sendPlayer = (text: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-p`,
      text,
      fromAI: false,
      ts: Date.now(),
    }]);
  };

  return { messages, sendPlayer };
}
