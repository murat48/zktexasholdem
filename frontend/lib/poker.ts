// Card Representation: 0-51 for 52 cards
// 0-12: Clubs (2-A), 13-25: Diamonds, 26-38: Hearts, 39-51: Spades
export type Card = number; // 0-51

export enum HandRank {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerGameState {
  gameId: string;
  players: {
    address: string;
    chips: number;
    commitment: string; // Card commitment hash
    currentBet: number;
    hasFolded: boolean;
  }[];
  pot: number;
  communityCards: Card[];
  currentRound: BettingRound;
  dealerButton: 0 | 1;
  currentPlayer: 0 | 1;
}

export function cardToString(card: Card): string {
  const suits = ['♣', '♦', '♥', '♠'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  const suit = Math.floor(card / 13);
  const rank = card % 13;
  
  return ranks[rank] + suits[suit];
}

export function stringToCard(cardString: string): Card {
  const suits = ['♣', '♦', '♥', '♠'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  const suit = cardString.slice(-1);
  const rank = cardString.slice(0, -1);
  
  const suitIndex = suits.indexOf(suit);
  const rankIndex = ranks.indexOf(rank);
  
  return suitIndex * 13 + rankIndex;
}
