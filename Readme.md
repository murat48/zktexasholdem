# GitHub Copilot Instructions - ZK Poker on Stellar

## Project Context
You are helping build a Zero-Knowledge Poker game for the Stellar ZK Gaming Hackathon. This is a heads-up (2-player) Texas Hold'em implementation where cards remain hidden using ZK proofs, making collusion impossible.

## Tech Stack
- **Frontend**: Next.js 14+ (App Router), React, TypeScript, TailwindCSS
- **Blockchain**: Stellar Soroban (Rust smart contracts)
- **ZK Proofs**: Noir language for circuits
- **Wallet**: Stellar Wallets Kit
- **Package Manager**: pnpm (preferred) or npm

## Project Structure
```
/
├── circuits/          # Noir ZK circuits
│   ├── card_commitment.nr
│   ├── hand_validation.nr
│   └── showdown_proof.nr
├── contracts/         # Soroban smart contracts (Rust)
│   ├── poker_game/
│   └── game_hub/
├── frontend/          # Next.js application
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── hooks/
└── README.md
```

## Core Requirements

### ZK Implementation Rules
1. **Never reveal private cards** - All card data must use commitment schemes
2. **Client-side proof generation** - ZK proofs generated in browser using Noir
3. **On-chain verification** - Proofs verified on Stellar using Protocol 25 primitives
4. **Minimal reveal** - Only winner proves hand strength, loser stays hidden

### Stellar Integration Requirements
1. **Must call Game Hub contract**:
   - Contract Address: `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`
   - Functions: `start_game()` and `end_game()`
2. **Deploy to Stellar Testnet** - All contracts on testnet
3. **Use Stellar Wallets Kit** - For wallet connections (Freighter, xBull, etc.)

## Coding Standards

### TypeScript
- Use strict TypeScript with no `any` types
- Prefer interfaces over types for object shapes
- Use Zod for runtime validation where needed

```typescript
// GOOD
interface GameState {
  gameId: string;
  players: [Address, Address];
  pot: bigint;
  currentRound: BettingRound;
}

// BAD
type GameState = any;
```

### Next.js App Router Conventions
- Use Server Components by default
- Add `'use client'` only when necessary (state, effects, browser APIs)
- Use Server Actions for mutations when appropriate
- Implement proper loading and error states

```typescript
// app/game/[id]/page.tsx
export default async function GamePage({ params }: { params: { id: string } }) {
  // Server Component - fetch initial data here
}

// components/PokerTable.tsx
'use client'; // Only because we need useState, useEffect
```

### React Patterns
- Use custom hooks for complex logic
- Prefer composition over prop drilling
- Use Context sparingly (wallet state, game state)

```typescript
// GOOD - Custom hook
function useGameState(gameId: string) {
  const [state, setState] = useState<GameState | null>(null);
  // ... logic
  return { state, actions };
}

// GOOD - Composition
<PokerTable>
  <PlayerHand position="bottom" />
  <CommunityCards />
  <PlayerHand position="top" />
  <BettingControls />
</PokerTable>
```

### TailwindCSS
- Use utility classes, avoid custom CSS
- Create reusable component variants with `clsx` or `cn` helper
- Design for mobile-first, then add desktop breakpoints

```typescript
// Use this pattern
import { cn } from '@/lib/utils';

<button 
  className={cn(
    "px-4 py-2 rounded-lg font-medium transition-colors",
    variant === 'primary' && "bg-stellar-purple hover:bg-stellar-purple-dark",
    variant === 'secondary' && "bg-gray-200 hover:bg-gray-300",
    disabled && "opacity-50 cursor-not-allowed"
  )}
/>
```

## Stellar/Soroban Patterns

### Contract Invocation
```typescript
import * as StellarSDK from '@stellar/stellar-sdk';

async function callContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
) {
  const contract = new StellarSDK.Contract(contractId);
  
  const operation = contract.call(method, ...args);
  
  const transaction = new StellarSDK.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();
    
  // Sign and submit
}
```

### Game Hub Integration
```typescript
// Always call these for every game
const GAME_HUB_CONTRACT = 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';

async function startGame(player1: Address, player2: Address) {
  await callContract(GAME_HUB_CONTRACT, 'start_game', [
    nativeToScVal(player1, { type: 'address' }),
    nativeToScVal(player2, { type: 'address' })
  ]);
}

async function endGame(gameId: string, winner: Address) {
  await callContract(GAME_HUB_CONTRACT, 'end_game', [
    nativeToScVal(gameId, { type: 'string' }),
    nativeToScVal(winner, { type: 'address' })
  ]);
}
```

## ZK/Noir Patterns

### Noir Circuit Structure
```noir
// circuits/hand_validation.nr
fn main(
    // Private inputs (never revealed)
    hole_cards: [u8; 2],
    
    // Public inputs (visible on-chain)
    card_commitment: pub Field,
    community_cards: pub [u8; 5],
    claimed_rank: pub u8,
) {
    // 1. Verify commitment
    let computed_hash = poseidon2_hash(hole_cards);
    assert(computed_hash == card_commitment);
    
    // 2. Calculate hand strength
    let actual_rank = calculate_poker_hand(hole_cards, community_cards);
    
    // 3. Verify claimed rank matches
    assert(actual_rank == claimed_rank);
}

// Helper function for poker hand evaluation
fn calculate_poker_hand(hole: [u8; 2], community: [u8; 5]) -> u8 {
    // Return rank: 0=high card, 1=pair, 2=two pair, ... 9=royal flush
    // Implementation here
}
```

### Client-side Proof Generation
```typescript
import { BarretenbergBackend, Noir } from '@noir-lang/noir_js';
import circuit from './circuits/target/hand_validation.json';

async function generateProof(
  holeCards: [number, number],
  communityCards: [number, number, number, number, number],
  commitment: string
) {
  const backend = new BarretenbergBackend(circuit);
  const noir = new Noir(circuit, backend);
  
  const witness = {
    hole_cards: holeCards,
    card_commitment: commitment,
    community_cards: communityCards,
    claimed_rank: calculateRank(holeCards, communityCards)
  };
  
  const proof = await noir.generateProof(witness);
  return proof.proof; // Send this to smart contract
}
```

## Poker Game Logic

### Card Representation
```typescript
// Use 0-51 for 52 cards
// 0-12: Clubs (2-A), 13-25: Diamonds, 26-38: Hearts, 39-51: Spades
type Card = number; // 0-51

function cardToString(card: Card): string {
  const suits = ['♣', '♦', '♥', '♠'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  const suit = Math.floor(card / 13);
  const rank = card % 13;
  
  return ranks[rank] + suits[suit];
}
```

### Hand Ranking
```typescript
enum HandRank {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9
}

function evaluateHand(cards: Card[]): HandRank {
  // Use a library or implement
  // Prefer: import existing poker hand evaluator
}
```

### Game State Management
```typescript
type BettingRound = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

interface PokerGameState {
  gameId: string;
  players: {
    address: Address;
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
```

## UI Components to Create

### Essential Components
1. **PokerTable** - Main game container
2. **PlayerHand** - Shows player cards (hidden for opponent)
3. **CommunityCards** - Flop, turn, river
4. **BettingControls** - Fold, Check, Bet buttons
5. **ChipStack** - Visual chip representation
6. **GameLog** - Action history

### Example Component
```typescript
// components/BettingControls.tsx
'use client';

interface BettingControlsProps {
  onFold: () => void;
  onCheck: () => void;
  onBet: (amount: number) => void;
  canCheck: boolean;
  minBet: number;
  maxBet: number;
}

export function BettingControls({ 
  onFold, 
  onCheck, 
  onBet, 
  canCheck,
  minBet,
  maxBet 
}: BettingControlsProps) {
  const [betAmount, setBetAmount] = useState(minBet);
  
  return (
    <div className="flex gap-4 p-4 bg-gray-800 rounded-lg">
      <button 
        onClick={onFold}
        className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium"
      >
        Fold
      </button>
      
      {canCheck && (
        <button 
          onClick={onCheck}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
        >
          Check
        </button>
      )}
      
      <div className="flex gap-2">
        <input
          type="range"
          min={minBet}
          max={maxBet}
          value={betAmount}
          onChange={(e) => setBetAmount(Number(e.target.value))}
          className="flex-1"
        />
        <button 
          onClick={() => onBet(betAmount)}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
        >
          Bet {betAmount}
        </button>
      </div>
    </div>
  );
}
```

## Testing Guidelines

### Unit Tests (Vitest)
```typescript
import { describe, it, expect } from 'vitest';

describe('Card utilities', () => {
  it('converts card number to string correctly', () => {
    expect(cardToString(0)).toBe('2♣');
    expect(cardToString(51)).toBe('A♠');
  });
});
```

### Integration Tests
```typescript
// Test full game flow
describe('Poker game flow', () => {
  it('completes a full hand with ZK proofs', async () => {
    // 1. Start game
    // 2. Deal cards with commitments
    // 3. Betting rounds
    // 4. Showdown with ZK proof
    // 5. Verify winner
  });
});
```

## Performance Optimizations

### ZK Proof Caching
```typescript
// Cache proofs to avoid regeneration
const proofCache = new Map<string, Uint8Array>();

async function getCachedProof(key: string, generator: () => Promise<Uint8Array>) {
  if (proofCache.has(key)) {
    return proofCache.get(key)!;
  }
  const proof = await generator();
  proofCache.set(key, proof);
  return proof;
}
```

### Optimistic UI Updates
```typescript
// Show action immediately, revert if tx fails
async function performAction(action: Action) {
  // Optimistically update UI
  updateGameState(action);
  
  try {
    await submitToBlockchain(action);
  } catch (error) {
    // Revert UI state
    revertGameState();
    showError(error);
  }
}
```

## Security Considerations

### Critical Rules
1. **Never log private data** - No console.log of card values or seeds
2. **Validate all inputs** - Check card indices, bet amounts, addresses
3. **Use secure randomness** - No Math.random() for cards
4. **Rate limit proof generation** - Prevent DoS

```typescript
// GOOD - Secure randomness
import { randomBytes } from 'crypto';

function generateSecureRandomness(): Uint8Array {
  return randomBytes(32);
}

// BAD - Don't do this
function shuffleDeck() {
  return deck.sort(() => Math.random() - 0.5); // ❌ Predictable
}
```

## Error Handling

### User-Friendly Errors
```typescript
class PokerError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string
  ) {
    super(message);
  }
}

function handleError(error: unknown) {
  if (error instanceof PokerError) {
    toast.error(error.userMessage);
  } else if (error instanceof StellarSDKError) {
    toast.error('Blockchain transaction failed. Please try again.');
  } else {
    toast.error('An unexpected error occurred.');
  }
  
  // Log full error for debugging
  console.error('Detailed error:', error);
}
```

## Code Comments Style

### When to Comment
- Complex ZK circuit logic
- Non-obvious poker hand evaluation
- Blockchain transaction construction
- Security-critical sections

```typescript
// GOOD - Explains WHY
// We commit cards before revealing to prevent front-running attacks
const commitment = poseidon2Hash(cards);

// BAD - Obvious
// Set the value to 5
const value = 5;
```

## Git Commit Messages
```
feat: implement ZK hand validation circuit
fix: resolve card commitment verification bug
docs: add poker hand ranking explanation
test: add unit tests for card utilities
chore: update dependencies
```

## Environment Variables
```bash
# .env.local
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_POKER_CONTRACT=<your-deployed-contract-id>
```

## Deployment Checklist

Before submitting:
- [ ] All contracts deployed to Stellar Testnet
- [ ] Game Hub integration working (start_game/end_game)
- [ ] ZK proofs generating and verifying
- [ ] UI shows gameplay clearly
- [ ] README has setup instructions
- [ ] Video demo recorded
- [ ] Code is public on GitHub

## Remember
- **ZK is the core value** - Don't just bolt it on, make it essential
- **Keep it simple** - MVP poker is fine, complexity kills hackathons
- **Test early** - Don't wait until day 6 to test ZK proof generation
- **Document as you go** - Future you will thank present you
- **Ask for help** - Use Stellar Dev Discord when stuck

## Quick References

### Stellar SDK Imports
```typescript
import * as StellarSDK from '@stellar/stellar-sdk';
import { Networks, BASE_FEE } from '@stellar/stellar-sdk';
```

### Common Utilities Needed
```typescript
// lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatChips(amount: number): string {
  return amount.toLocaleString();
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
```

---

**When in doubt**: Prioritize working code over perfect code. This is a hackathon, not production. Ship it! 🚀
