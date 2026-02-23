# ZK Poker - Zero Knowledge Implementation

## 📋 Overview

This project implements a **Zero-Knowledge Texas Hold'em Poker** game on Stellar Soroban, where players can prove they won without revealing their hole cards.

## 🔐 How It Works

### Phase 1: Card Commitment (Pre-Flop)

```typescript
// Player receives 2 hole cards
holeCards = [K♠, K♦]  // Private

// Generate random salt
salt = generateSalt()  // "a7f3e9..."

// Create commitment using Poseidon2 hash
commitment = Hash(card1, card2, salt)
// → "8a3f2b91c..."

// Submit commitment to blockchain
submitCommitment(commitment)  // Public, but cards remain hidden
```

**Result:** Cards are locked in cryptographically. Player can't change cards later.

### Phase 2: Game Progression (Flop → Turn → River)

```typescript
// Community cards are dealt publicly
communityCards = [K♥, Q♣, J♦, 9♠, 2♥]

// Both players see community cards
// Hole cards remain SECRET
```

### Phase 3: Showdown - ZK Proof Generation

```typescript
// Player calculates their hand rank
myHand = [K♠, K♦] + [K♥, Q♣, J♦, 9♠, 2♥]
         = Three of a Kind
         = Rank 3 (on 0-9 scale)

// Generate ZK Proof using Noir circuit
proof = generateProof({
  holeCards: [K♠, K♦],          // PRIVATE INPUT (hidden)
  salt: "a7f3e9...",            // PRIVATE INPUT (hidden)
  commitment: "8a3f2b91c...",   // PUBLIC INPUT (verified)
  communityCards: [...],         // PUBLIC INPUT (everyone knows)
  claimedRank: 3                 // PUBLIC CLAIM (what I'm proving)
})

// The proof proves:
// 1. "My hole cards match my earlier commitment"
// 2. "With these community cards, my hand has rank 3"
// 3. Without revealing the actual hole cards!
```

**Circuit Logic (Simplified):**

```noir
fn main(
    hole_cards: [u8; 2],          // Private: K♠, K♦
    salt: Field,                   // Private: "a7f3e9..."
    card_commitment: pub Field,    // Public: "8a3f2b91c..."
    community_cards: pub [u8; 5],  // Public: [K♥, Q♣, J♦, 9♠, 2♥]
    claimed_rank: pub u8           // Public: 3
) {
    // Verify cards match commitment
    assert(hash(hole_cards, salt) == card_commitment);

    // Calculate actual hand rank
    actual_rank = calculate_poker_rank(hole_cards, community_cards);

    // Verify claim is correct
    assert(actual_rank == claimed_rank);

    // If proof generation succeeds, it proves:
    // "I have cards that give me rank 3, and they match my commitment"
}
```

### Phase 4: Winner Determination

```typescript
// Smart contract on Stellar Soroban

fn resolve_showdown(
    player1_proof: BytesN<128>,
    player1_rank: u8,  // Public: 3
    player2_proof: BytesN<128>,
    player2_rank: u8,  // Public: 1
) {
    // 1. Verify both ZK proofs
    verify_proof(player1_proof);  // ✅ Valid
    verify_proof(player2_proof);  // ✅ Valid

    // 2. Compare ranks (without seeing cards!)
    if player1_rank > player2_rank {
        // 3 > 1, Player 1 wins!
        transfer_pot(player1);
    }

    // Cards never revealed!
    // Player 2 doesn't know Player 1 had K♠ K♦
    // They only know Player 1 had "a hand of rank 3"
}
```

## 🎯 Key Features

### 1. **Privacy-Preserving**

- Hole cards **never revealed** on-chain
- Only hand strength (0-9) is public
- Losing player's cards remain secret forever

### 2. **Cheat-Proof**

```typescript
// Scenario: Player tries to lie

Player: "My hand is Royal Flush (rank 9)"
Reality: Only has One Pair (rank 1)

// Proof generation FAILS
proof = generateProof({
  holeCards: [2♠, 3♦],     // Actual cards
  claimedRank: 9           // Lying about rank
})

// Circuit checks:
actual = calculate_rank([2♠, 3♦], community)  // = 0 (high card)
assert(actual == 9)  // ❌ FAILS! 0 ≠ 9

// Proof cannot be generated!
// Player cannot submit invalid proof
// Player automatically loses or times out
```

### 3. **Trustless**

- No central server
- No relying on honest opponents
- Math guarantees fairness

## 📁 Project Structure

```
circuits/
  hand_rank_proof.nr       # Main ZK circuit for showdown
  hand_validation.nr       # Alternative validation circuit
  showdown_proof.nr        # Advanced showdown circuit

contracts/
  poker_game/src/lib.rs    # Soroban smart contract
    - resolve_showdown()   # ZK proof verification
    - submit_commitment()  # Card commitment

frontend/
  lib/
    zkproof.ts            # ZK proof generation (TypeScript)
    zk-contract.ts        # Contract interaction
  hooks/
    useTexasHoldem.ts     # Game logic with ZK integration
```

## 🚀 Implementation Status

### ✅ Completed (MVP)

1. **Noir Circuits**
   - `hand_rank_proof.nr` - Complete poker hand evaluation
   - Supports all hands: High Card → Royal Flush
   - Cheat-proof assertions

2. **Smart Contract**
   - `resolve_showdown()` function
   - Proof verification structure
   - Pot distribution based on ranks

3. **Frontend Integration**
   - ZK proof generation (mock for MVP)
   - Hand rank calculation
   - Commitment generation
   - Game flow integration

### 🔄 In Progress (Production-Ready)

1. **Compile Noir Circuits**

   ```bash
   cd circuits
   nargo compile
   nargo codegen-verifier
   ```

2. **Actual Proof Generation**

   ```typescript
   // Replace mock with real Noir.js
   const { Noir } = await import("@noir-lang/noir_js");
   const circuit = await import("../circuits/target/hand_rank_proof.json");
   const proof = await noir.generateProof(witness);
   ```

3. **On-Chain Verification**
   ```rust
   // Add actual verifier in Soroban
   use noir_verifier::verify;
   assert!(verify(&proof, &public_inputs));
   ```

## 🔢 Hand Ranking (0-9 Scale)

```typescript
enum HandRank {
  HIGH_CARD = 0, // 7-5-4-3-2
  PAIR = 1, // K-K-Q-J-9
  TWO_PAIR = 2, // K-K-Q-Q-9
  THREE_OF_KIND = 3, // K-K-K-Q-J
  STRAIGHT = 4, // 9-8-7-6-5
  FLUSH = 5, // K♠-Q♠-J♠-9♠-2♠
  FULL_HOUSE = 6, // K-K-K-Q-Q
  FOUR_OF_KIND = 7, // K-K-K-K-Q
  STRAIGHT_FLUSH = 8, // 9♠-8♠-7♠-6♠-5♠
  ROYAL_FLUSH = 9, // A♠-K♠-Q♠-J♠-10♠
}
```

## 🧪 Testing

### Test Locally

```bash
# Start frontend
cd frontend
pnpm dev

# Play game - check console for ZK proof logs:
# 🔐 Player 0 hand rank: 3
# 🎉 Player 0 WINS! Rank: 3 > 1
# ✅ Showdown complete - ZK proofs verified
```

### Test Circuits

```bash
cd circuits
nargo test
```

## 🎮 Game Flow Example

```typescript
// Round 1: Pre-Flop
You: [A♠, A♦] → commitment: "x7f3..."
Opponent: [?, ?] → commitment: "y2a1..."

// Round 2: Flop
Community: [A♥, K♣, Q♦]
(Cards still hidden)

// Round 3: Turn
Community: [A♥, K♣, Q♦, J♠]

// Round 4: River
Community: [A♥, K♣, Q♦, J♠, 9♥]

// Round 5: Showdown - ZK Proof Battle!
You generate proof: "I have rank 7 (Four of a Kind)"
Opponent generates proof: "I have rank 4 (Straight)"

Contract verifies:
✅ Your proof valid
✅ Opponent proof valid
✅ 7 > 4 → You win!

// Game ends
You: +500 chips
Opponent: -500 chips
Your cards: Still secret! ✅
Opponent cards: Still secret! ✅
```

## 🔗 Resources

- **Noir Documentation:** https://noir-lang.org
- **Soroban Docs:** https://soroban.stellar.org
- **ZK Winner Determination:** See `zk-winner-determination.md`

## 📝 Future Improvements

1. **Kicker Comparison** for ties
2. **Multi-player** support (>2 players)
3. **Tournament** mode
4. **Side pots** for all-in scenarios
5. **Provably fair** deck shuffling with ZK

## 🎯 Hackathon Demo Script

1. **Start Game:** "See commitment submitted - cards locked"
2. **Play Round:** "Community cards dealt, hole cards secret"
3. **Showdown:** "Check console - ZK proof generation logs"
4. **Winner:** "Pot distributed without revealing cards!"

---

**Built with:** Stellar Soroban + Noir + Next.js + TypeScript 🚀
