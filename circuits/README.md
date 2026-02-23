# ZK Poker Circuits

This directory contains the Noir zero-knowledge circuits for private poker gameplay.

## Circuits Overview

### 1. Card Commitment (`card_commitment.nr`)

**Purpose**: Generate a cryptographic commitment to a player's hole cards without revealing them.

**Inputs**:

- Private: `hole_cards` (2 cards), `salt` (random value)
- Public: `commitment` (hash output)

**Logic**: Verifies that `Poseidon2Hash(card1, card2, salt) == commitment`

**Usage**: Called when cards are dealt to each player.

---

### 2. Hand Validation (`hand_validation.nr`)

**Purpose**: Prove a player has a specific hand rank without revealing their cards.

**Inputs**:

- Private: `hole_cards`, `salt`
- Public: `card_commitment`, `community_cards`, `claimed_rank`

**Logic**:

1. Verify card commitment matches original
2. Calculate actual hand rank from hole + community cards
3. Verify claimed rank matches actual rank

**Usage**: Called during showdown by the winner.

---

### 3. Showdown Proof (`showdown_proof.nr`)

**Purpose**: Prove the winner has a better hand than the loser without revealing loser's cards.

**Inputs**:

- Private: Both players' `hole_cards` and `salt`
- Public: Both players' `commitments`, `community_cards`, `winner_rank`, `loser_folded`

**Logic**:

1. Verify both commitments
2. Calculate both hand ranks
3. Verify winner's rank >= loser's rank
4. If loser folded, skip loser's hand verification

**Usage**: Called at game end to prove winner fairly.

---

## Compiling Circuits

```bash
nargo compile
```

This generates proving and verification keys in `target/`.

## Generating Proofs (Client-side)

```typescript
import { BarretenbergBackend, Noir } from "@noir-lang/noir_js";
import circuit from "./target/hand_validation.json";

const backend = new BarretenbergBackend(circuit);
const noir = new Noir(circuit, backend);

const witness = {
  hole_cards: [12, 25], // K♣, K♦
  salt: "random_salt_string",
  card_commitment: "commitment_hash",
  community_cards: [0, 1, 2, 3, 4],
  claimed_rank: 1, // Pair
};

const { proof } = await noir.generateProof(witness);
```

## Verifying Proofs (On-chain)

Proofs are verified on Stellar using Soroban smart contracts with Protocol 25 primitives.

## Security Considerations

1. **Salt Generation**: Must use cryptographically secure randomness
2. **Commitment Timing**: Commitments must be submitted before any cards are revealed
3. **Proof Generation**: Always done client-side to keep private inputs secret
4. **No Revealing**: Losing players' cards are never revealed, even in proofs

## Testing Circuits

```bash
nargo test
```

## Circuit Optimization

- Use Poseidon2 hash (ZK-friendly)
- Minimize field operations
- Batch verifications when possible

---

For more details, see the main PROJECT_README.md
