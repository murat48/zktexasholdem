# ZK TEXAS HOLD'EM Poker — Zero-Knowledge Texas Hold'em on Stellar

A fully on-chain Texas Hold'em poker game built on **Stellar Soroban** with **Noir Lang zero-knowledge proofs**. Players commit to their cards before the flop using Poseidon2 hashes, then prove their hand rank at showdown without revealing their hole cards — all verified cryptographically through a 3-layer security architecture.

## Active Contract Addresses

- **POKER_GAME_CONTRACT**  
  [CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ](https://stellar.expert/explorer/testnet/contract/CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ)

- **NOIR_VERIFIER_CONTRACT**  
  [CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5](https://stellar.expert/explorer/testnet/contract/CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5)
---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [ZK Proof System — How It Works](#zk-proof-system--how-it-works)
  - [Phase 1: Commit (Pre-Flop)](#phase-1-commit-pre-flop)
  - [Phase 2: Prove (Showdown)](#phase-2-prove-showdown)
  - [The Noir Circuit in Detail](#the-noir-circuit-in-detail)
  - [3-Layer Verification Architecture](#3-layer-verification-architecture)
  - [End-to-End Proof Flow](#end-to-end-proof-flow)
- [Smart Contracts](#smart-contracts)
- [Frontend](#frontend)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Running the Game](#running-the-game)
- [Card Encoding](#card-encoding)
- [Hand Rankings](#hand-rankings)
- [Current Status](#current-status)
- [Roadmap](#roadmap)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│                                                                  │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ Game UI     │  │ ZK Proof Engine  │  │ Stellar SDK        │  │
│  │ (React)     │  │ (Noir + BB)      │  │ (Soroban RPC)      │  │
│  └─────────────┘  └──────┬───────────┘  └────────┬───────────┘  │
│                          │                        │              │
│        ┌─────────────────┴────────────────────────┘              │
│        │              API Routes                                 │
│  ┌─────┴──────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ /api/zk/   │  │ /api/zk/     │  │ /api/zk/             │    │
│  │ commit     │  │ prove        │  │ zkverify             │    │
│  │            │  │              │  │                      │    │
│  │ Poseidon2  │  │ nargo exec   │  │ bb verify (local)   │    │
│  │ hash via   │  │ + bb prove   │  │ + zkVerify chain    │    │
│  │ nargo      │  │ → ~16KB      │  │ (Volta testnet)     │    │
│  └────────────┘  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
        ┌───────────────────┐  ┌─────────────────────┐
        │  Stellar Soroban  │  │  zkVerify Blockchain │
        │  Testnet          │  │  (Volta Testnet)     │
        │                   │  │  ⚠️ PLANNED — not    │
        │  ┌─────────────┐  │  │  yet active (returns │
        │  │ poker_game   │  │  │  empty hash)         │
        │  │ contract     │  │  │                      │
        │  ├─────────────┤  │  └─────────────────────┘
        │  │ noir_verifier│  │
        │  │ contract     │  │
        │  ├─────────────┤  │
        │  │ game_hub     │  │
        │  │ contract     │  │
        │  └─────────────┘  │
        └───────────────────┘
```

---

## ZK Proof System — How It Works

The core innovation of this project is zero-knowledge proofs for poker. Players prove they hold a legitimate hand of a specific rank **without revealing their actual cards**. This is achieved through a **Poseidon2 commit-reveal scheme** implemented as a Noir circuit.

### Phase 1: Commit (Pre-Flop)

Before any community cards are dealt, each player **commits** to their hole cards:

```
commitment = Poseidon2_permutation([card0, card1, salt, 0], 4)[0]
```

| Component        | Description                                        |
| ---------------- | -------------------------------------------------- |
| `card0`, `card1` | Player's two hole cards (encoded as integers 0-51) |
| `salt`           | 256-bit cryptographically random nonce             |
| `0`              | Zero padding to fill the 4-element Poseidon2 state |

The resulting **commitment** (a BN254 scalar field element) is stored on-chain via `submit_commitment()`. This binds the player to their cards without revealing them — changing cards later would produce a different hash.

**How it runs:**

1. Frontend calls `/api/zk/commit` with `{holeCards, salt}`
2. Server creates a minimal Noir circuit and runs `nargo execute`
3. The circuit output `0x...` is the Poseidon2 commitment
4. Commitment is submitted to the `poker_game` contract on Stellar

```noir
// Commitment circuit (server-side, executed via nargo)
fn main(card0: u8, card1: u8, salt: Field) -> pub Field {
    let hash_state: [Field; 4] = [card0 as Field, card1 as Field, salt, 0];
    let result = std::hash::poseidon2_permutation(hash_state, 4);
    result[0]
}
```

### Phase 2: Prove (Showdown)

At showdown, each player generates a **zero-knowledge proof** demonstrating:

1. **Commitment binding** — Their private cards hash to the commitment stored on-chain
2. **Card validity** — All 7 cards are in range [0, 51] with no duplicates
3. **Correct rank** — The claimed hand rank matches the actual evaluated rank

The proof reveals **only the hand rank** (0-9) — the actual hole cards remain private.

**How it runs:**

1. Frontend calls `/api/zk/prove` with `{holeCards, communityCards, rank, salt, commitment}`
2. Server writes `Prover.toml` with inputs, runs `nargo execute` → witness file
3. Server runs `bb prove` (Barretenberg) → produces ~16KB UltraHonk proof
4. Proof is returned to the frontend for verification

### The Noir Circuit in Detail

The main circuit (`circuits/src/main.nr`) is the heart of the ZK system. Here's how each verification step works:

#### Circuit Inputs

```noir
fn main(
    // PRIVATE witnesses — hidden from verifier, known only to prover
    hole_cards: [u8; 2],          // Player's 2 hole cards (0-51)
    salt: Field,                  // Random nonce for Poseidon2 commitment

    // PUBLIC inputs — visible to verifier, stored on-chain
    card_commitment: pub Field,   // Poseidon2(card0, card1, salt) from pre-flop
    community_cards: pub [u8; 5], // Board cards (flop + turn + river)
    claimed_rank: pub u8          // Hand rank the player claims (0-9)
)
```

The separation of **private** and **public** inputs is what makes this zero-knowledge:

- The verifier (smart contract / anyone) sees only `card_commitment`, `community_cards`, and `claimed_rank`
- The prover's actual `hole_cards` and `salt` remain secret

#### Step 1: Poseidon2 Commitment Verification

```noir
let hash_state: [Field; 4] = [
    hole_cards[0] as Field,
    hole_cards[1] as Field,
    salt,
    0  // padding
];
let permuted = std::hash::poseidon2_permutation(hash_state, 4);
assert(permuted[0] == card_commitment, "Poseidon2 card commitment mismatch");
```

This ensures the player is proving about the **same cards** they committed to before the community cards were dealt. If a player tries to change their cards, the Poseidon2 hash won't match and the proof fails.

**Why Poseidon2?** It's a ZK-friendly hash function optimized for arithmetic circuits over the BN254 field, requiring far fewer constraints than SHA-256 or Keccak inside a ZK circuit.

#### Step 2: Range Checks

```noir
assert(hole_cards[0] <= 51);
assert(hole_cards[1] <= 51);
for i in 0..5 {
    assert(community_cards[i] <= 51);
}
```

All 7 cards must be valid deck indices (0-51). This prevents players from using invalid card values to manipulate hand evaluation.

#### Step 3: Duplicate Checks

```noir
// Hole cards differ from each other
assert(hole_cards[0] != hole_cards[1]);

// Hole cards differ from all community cards
for i in 0..5 {
    assert(hole_cards[0] != community_cards[i]);
    assert(hole_cards[1] != community_cards[i]);
}

// All 10 community card pairs are distinct
assert(community_cards[0] != community_cards[1]);
assert(community_cards[0] != community_cards[2]);
// ... all C(5,2) = 10 pairs checked
```

This ensures no duplicate cards exist across all 7 cards (2 hole + 5 community), enforcing a valid poker deal. All 21 unique pairs among 7 cards are checked.

#### Step 4: Hand Rank Evaluation

The `calculate_hand_rank()` function evaluates the best 5-card hand from all 7 cards:

```
                    ┌──────────────┐
                    │  7 Cards In  │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    ┌──────────────────┐     ┌──────────────────┐
    │  Rank Frequency  │     │  Suit Frequency   │
    │  Table [0..12]   │     │  Table [0..3]     │
    └────────┬─────────┘     └────────┬──────────┘
             │                        │
        ┌────┴─────┐          ┌───────┴──────┐
        ▼          ▼          ▼              ▼
   max_count   second_cnt   flush_suit   flush_rank_counts
   (4=quads,   (>=2 means   (suit with   (rank freq table
    3=trips,    full house    >=5 cards)   restricted to
    2=pair)     or 2-pair)                 flush suit)
        │          │          │              │
        └────┬─────┘          └──────┬───────┘
             │                       │
             ▼                       ▼
    ┌─────────────────┐    ┌──────────────────┐
    │  Pair/Trip/Quad │    │  Straight Check   │
    │  Detection      │    │  (consecutive +   │
    │                 │    │   wheel A-2-3-4-5)│
    │                 │    │  Straight Flush    │
    │                 │    │  (suit-restricted) │
    │                 │    │  Royal Flush       │
    │                 │    │  (T-J-Q-K-A flush) │
    └────────┬────────┘    └─────────┬─────────┘
             │                       │
             └───────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │  Hand Rank (0-9)     │
              │  Ascending priority  │
              │  overwrites weaker   │
              └──────────────────────┘
```

**Key implementation details:**

- **Flush detection:** Finds the suit with ≥5 cards (at most one suit can qualify from 7 cards)
- **Straight flush correctness:** The circuit builds a **flush-suit-restricted** rank frequency table and checks for straights within that table only. This prevents false positive straight flushes where a player has a flush in hearts and a straight that borrows a spade.
- **Wheel straight:** Special case for A-2-3-4-5 (Ace plays low)
- **Royal flush:** Checks if T-J-Q-K-A are all present in the flush suit

The rank is assigned with ascending priority — each satisfied condition overwrites weaker hands:

```noir
let mut rank: u8 = 0;  // High card
if (max_count == 2) & (second_count < 2) { rank = 1; }   // One pair
if (max_count == 2) & (second_count == 2) { rank = 2; }   // Two pair
if (max_count == 3) & (second_count < 2) { rank = 3; }    // Three of a kind
if has_straight & !has_straight_flush { rank = 4; }        // Straight
if has_flush & !has_straight_flush { rank = 5; }            // Flush
if (max_count == 3) & (second_count >= 2) { rank = 6; }   // Full house
if max_count == 4 { rank = 7; }                             // Four of a kind
if has_straight_flush & !has_royal_flush { rank = 8; }     // Straight flush
if has_royal_flush { rank = 9; }                            // Royal flush
```

Finally, the circuit asserts the evaluated rank matches the claimed rank:

```noir
assert(actual_rank == claimed_rank, "Claimed rank does not match actual hand rank");
```

### 3-Layer Verification Architecture

The proof goes through three independent verification layers:

```
                    ┌─────────────────────────┐
                    │ Noir/BB Proof Generated  │
                    │ (~16KB UltraHonk proof)  │
                    └────────────┬─────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                     ▼
  ┌───────────────────┐ ┌────────────────┐ ┌──────────────────────┐
  │  LAYER 1    ✅    │ │  LAYER 2  ⏳   │ │  LAYER 3    ✅       │
  │  bb verify        │ │  zkVerify      │ │  Stellar Contract    │
  │  (Server-side)    │ │  (Blockchain)  │ │  (noir_verifier)     │
  │                   │ │                │ │                      │
  │  UltraHonk BN254  │ │  Substrate     │ │  Attestation gate:   │
  │  pairing check    │ │  chain runs    │ │  proof must have     │
  │  Real ECC math    │ │  same pairing  │ │  recorded attestation│
  │  ~2 seconds       │ │  check on-chain│ │  before resolve      │
  │                   │ │  (NOT YET      │ │  showdown passes     │
  │  → PASS/FAIL      │ │   ACTIVE)      │ │                      │
  └─────────┬─────────┘ └───────┬────────┘ └──────────┬───────────┘
            │                    │                      │
            └────────────────────┴──────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │  record_zkverify_        │
                    │  attestation() on Stellar│
                    │  (stores proof hash)     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │  resolve_showdown()      │
                    │  Checks attestation gate │
                    │  Determines winner       │
                    │  Transfers pot           │
                    └──────────────────────────┘
```

| Layer       | What It Does                                                  | Where It Runs          | Status     | Purpose                                                             |
| ----------- | ------------------------------------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------- |
| **Layer 1** | `bb verify` — UltraHonk elliptic curve pairing check          | Server (API route)     | ✅ Active  | Real cryptographic proof verification (~2s)                         |
| **Layer 2** | zkVerify chain — same pairing check on a Substrate blockchain | zkVerify Volta testnet | ⏳ Planned | Decentralized, immutable attestation (currently returns empty hash) |
| **Layer 3** | `noir_verifier` contract — attestation gate + sanity checks   | Stellar Soroban        | ✅ Active  | On-chain enforcement: no attestation → proof rejected               |

> **Note:** Layer 2 (zkVerify blockchain) is not yet operational — the integration code is in place but the chain currently returns an empty hash. Proofs are still fully verified via Layer 1 (`bb verify`) and enforced on-chain via Layer 3 (attestation gate). Enabling zkVerify will add an additional decentralized verification layer.

### End-to-End Proof Flow

Here's the complete flow from game start to showdown:

```
GAME START
    │
    ├─ 1. Player receives hole cards (e.g., [A♠, K♥] → [51, 25])
    │
    ├─ 2. Generate random 256-bit salt
    │
    ├─ 3. POST /api/zk/commit {holeCards: [51,25], salt: "18293..."}
    │     └─ Server: nargo execute → Poseidon2([51, 25, salt, 0])
    │     └─ Returns: commitment = "0x2a8f..."
    │
    ├─ 4. submit_commitment(commitment) → Stellar poker_game contract
    │     └─ Commitment stored on-chain (BytesN<32>)
    │
    ├─ 5. Game plays out: Flop → Turn → River (betting rounds)
    │     └─ reveal_community_cards() stores [card0..card4] on-chain
    │
SHOWDOWN
    │
    ├─ 6. Calculate hand rank locally (must match circuit exactly)
    │     └─ calculateHandRankCircuit([51,25], [0,14,28,42,5]) → rank 4
    │
    ├─ 7. POST /api/zk/prove {holeCards, communityCards, rank, salt, commitment}
    │     ├─ Server: nargo execute → witness (.gz)
    │     └─ Server: bb prove → UltraHonk proof (~16KB)
    │
    ├─ 8. POST /api/zk/zkverify {proof, publicInputs}
    │     ├─ Layer 1: bb verify (local UltraHonk pairing check) ✅
    │     └─ Layer 2: zkVerify Volta chain (⏳ planned — currently returns empty hash)
    │     └─ Returns: {verified, attestationId, localVerified}
    │
    ├─ 9. record_zkverify_attestation() → Stellar noir_verifier contract
    │     └─ Stores attestation: (ATT_H, SHA256(proof)) → attestation_id
    │
    ├─ 10. resolve_showdown(p1_proof, p1_rank, ..., p2_proof, p2_rank, ...)
    │      └─ poker_game contract:
    │           ├─ Checks both commitments exist (non-zero)
    │           ├─ Checks both proofs are non-zero
    │           ├─ Validates rank range [0, 9]
    │           ├─ Cross-contract → noir_verifier.verify_proof (Player 1)
    │           │   ├─ Card validity [0,51], no duplicates
    │           │   ├─ Rank range [0,9]
    │           │   └─ Attestation gate: SHA256(proof) must have attestation
    │           ├─ Cross-contract → noir_verifier.verify_proof (Player 2)
    │           ├─ Compare ranks → determine winner
    │           └─ Transfer pot to winner, emit showdown event
    │
    └─ DONE — Winner announced, pot distributed
```

---

## Smart Contracts

Three Soroban smart contracts deployed on Stellar Testnet:

### poker_game

**Contract:** `CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ`

The main game contract managing state, betting, and showdown resolution.

| Function                                | Description                                      |
| --------------------------------------- | ------------------------------------------------ |
| `init_game(player1, player2, chips)`    | Initialize a new game with two players           |
| `set_verifier(verifier_addr)`           | Link the noir_verifier contract                  |
| `submit_commitment(player, commitment)` | Store Poseidon2 commitment pre-flop              |
| `place_bet(player, amount)`             | Place a bet during any betting round             |
| `fold(player)`                          | Fold current hand                                |
| `reveal_community_cards(cards)`         | Deal community cards on-chain                    |
| `resolve_showdown(...)`                 | Verify both players' proofs and determine winner |
| `get_game_state()`                      | Read current game state                          |

### noir_verifier

**Contract:** `CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5`

The ZK verification contract implementing the attestation gate.

| Function                                                     | Description                                     |
| ------------------------------------------------------------ | ----------------------------------------------- |
| `verify_proof(cards, salt, commitment, rank, proof, player)` | Verify a player's ZK proof via attestation gate |
| `resolve_winner(p1_rank, p2_rank)`                           | Compare ranks and return winner index           |
| `record_zkverify_attestation(...)`                           | Store zkVerify attestation on Stellar           |
| `get_attestation_count()`                                    | Get total attestation count                     |
| `get_attestation(index)`                                     | Get attestation by index                        |
| `has_attestation(proof_hash)`                                | Check if proof has been verified                |

### game_hub

**Contract:** `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`

Game lifecycle management for creating and tracking games.

| Function                                | Description           |
| --------------------------------------- | --------------------- |
| `start_game(game_id, player1, player2)` | Register a new game   |
| `end_game(game_id, winner)`             | Mark game as complete |

---

## Frontend

Built with **Next.js** and **React**, the frontend provides:

- **Poker Table UI** — Visual card display, chip stacks, betting controls
- **AI Opponents** — Four personalities powered by different LLMs:

  | Name  | Model                 | Play Style               |
  | ----- | --------------------- | ------------------------ |
  | Blaze | GPT-4o Mini           | Aggressive, bluffs often |
  | Steel | Claude Haiku 4.5      | Tight, calculated        |
  | Sage  | Gemini 2.5 Flash Lite | Balanced, analytical     |
  | Lucky | Random                | Unpredictable            |

- **PvP Mode** — Real-time multiplayer via polling
- **ZK Setup Wizard** — Backend selection (Noir / RISC Zero beta)
- **Wallet Integration** — Stellar Freighter wallet support

### Key Frontend Files

| File                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `lib/zkproof.ts`               | ZK proof generation, Poseidon2 commitment, hand rank calculation |
| `lib/zk-contract.ts`           | All Stellar contract interactions (submit, bet, fold, resolve)   |
| `lib/zk-proof-router.ts`       | Routes between Noir and RISC Zero backends                       |
| `hooks/useTexasHoldem.ts`      | Main game state management hook                                  |
| `hooks/usePvP.ts`              | Multiplayer game logic                                           |
| `app/api/zk/commit/route.ts`   | Server API: Poseidon2 commitment computation                     |
| `app/api/zk/prove/route.ts`    | Server API: Noir proof generation (nargo + bb)                   |
| `app/api/zk/zkverify/route.ts` | Server API: Proof verification (bb verify + zkVerify chain)      |

---

## Project Structure

```
texasholdemv19/
├── circuits/                    # Noir ZK circuits
│   ├── src/
│   │   └── main.nr             # Main poker hand proof circuit (231 lines)
│   ├── Nargo.toml              # Noir package config (compiler >=0.31.0)
│   ├── Prover.toml             # Example prover inputs
│   └── target/
│       ├── zk_poker_circuits.json  # Compiled circuit artifact
│       └── vk/vk              # Verification key
│
├── contracts/                   # Stellar Soroban smart contracts (Rust)
│   ├── poker_game/             # Main game logic
│   │   └── src/lib.rs          # GameState, betting, resolve_showdown
│   ├── noir_verifier/          # ZK proof verification
│   │   └── src/lib.rs          # Attestation gate, verify_proof
│   └── game_hub/               # Game lifecycle management
│       └── src/lib.rs          # start_game, end_game
│
├── frontend/                    # Next.js web application
│   ├── app/                    # Pages and API routes
│   │   ├── page.tsx            # Home page
│   │   ├── game/[id]/          # Single player game
│   │   ├── pvp/                # Multiplayer
│   │   └── api/zk/             # ZK proof API routes
│   ├── components/             # React components
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # Utilities (poker, ZK, Stellar)
│
├── package.json                # Root scripts
└── setup.sh                    # One-click setup script
```

---

## Prerequisites

| Tool                  | Version       | Purpose                                       |
| --------------------- | ------------- | --------------------------------------------- |
| **Node.js**           | ≥ 18.x        | Frontend runtime                              |
| **pnpm**              | ≥ 8.x         | Package manager                               |
| **Rust**              | ≥ 1.74        | Smart contract compilation                    |
| **Soroban CLI**       | Latest        | Contract deployment/invocation                |
| **Noir (nargo)**      | 1.0.0-beta.18 | ZK circuit compilation and witness generation |
| **Barretenberg (bb)** | 3.x           | UltraHonk proof generation and verification   |
| **Stellar Freighter** | Browser ext.  | Wallet for signing transactions               |

---

## Installation & Setup

### 1. Clone and Install

```bash
git clone [<repo-url>](https://github.com/murat48/zktexasholdem)
cd zktexasholdem

# Install frontend dependencies
cd frontend
pnpm install
cd ..
```

### 2. Install Noir Toolchain

```bash
# Install noirup (Noir version manager)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash

# Install Noir 1.0.0-beta.18
noirup -v 1.0.0-beta.18

# Verify
nargo --version
```

### 3. Install Barretenberg

```bash
# Install bbup (Barretenberg version manager)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash

# Install matching bb version
bbup

# Verify
~/.bb/bb --version
```

### 4. Compile Circuits

```bash
cd circuits

# Compile the Noir circuit → target/zk_poker_circuits.json
nargo compile

# Generate the verification key
~/.bb/bb write_vk -b target/zk_poker_circuits.json -o target/vk

cd ..
```

### 5. Configure Environment

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Stellar Testnet
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Contract addresses (already deployed)
NEXT_PUBLIC_POKER_CONTRACT=CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ
NEXT_PUBLIC_VERIFIER_CONTRACT=CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG

# Server keypair (for signing AI/bot transactions)
STELLAR_SECRET_KEY=S...

# AI providers (for AI opponents)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...

# Optional: zkVerify blockchain integration
ZKVERIFY_SEED_PHRASE="word1 word2 ... word12"
```

### 6. Build Contracts (Optional — already deployed)

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
# Deploy with Soroban CLI if needed
```

---

## Running the Game

```bash
# From root directory
npm run dev

# Or directly
cd frontend && pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Game Flow:**

1. Connect your Stellar wallet (Freighter)
2. Select an AI opponent or create a PvP game
3. Cards are dealt — your commitment is automatically submitted on-chain
4. Play through betting rounds (Flop → Turn → River)
5. At showdown, ZK proofs are generated and verified automatically
6. Winner is determined on-chain, pot is distributed

---

## Card Encoding

Cards are encoded as integers 0-51:

```
card = suit × 13 + rank

Suit: 0 = Clubs, 1 = Diamonds, 2 = Hearts, 3 = Spades
Rank: 0 = Two, 1 = Three, ..., 8 = Ten, 9 = Jack, 10 = Queen, 11 = King, 12 = Ace
```

| Card | Encoding | Calculation |
| ---- | -------- | ----------- |
| 2♣   | 0        | 0×13 + 0    |
| A♣   | 12       | 0×13 + 12   |
| 2♦   | 13       | 1×13 + 0    |
| A♠   | 51       | 3×13 + 12   |

---

## Hand Rankings

| Rank | Name            | Description                                        |
| ---- | --------------- | -------------------------------------------------- |
| 0    | High Card       | No matching cards                                  |
| 1    | One Pair        | Two cards of same rank                             |
| 2    | Two Pair        | Two different pairs                                |
| 3    | Three of a Kind | Three cards of same rank                           |
| 4    | Straight        | Five consecutive ranks (including A-2-3-4-5 wheel) |
| 5    | Flush           | Five cards of same suit                            |
| 6    | Full House      | Three of a kind + a pair                           |
| 7    | Four of a Kind  | Four cards of same rank                            |
| 8    | Straight Flush  | Straight + flush in same suit                      |
| 9    | Royal Flush     | T-J-Q-K-A of same suit                             |

---

## Current Status

| Feature                                                       | Status         | Notes                                                                          |
| ------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Noir ZK Circuit (Poseidon2 commit-reveal)                     | ✅ Complete    | 231-line circuit, all hand ranks supported                                     |
| Barretenberg Proof Generation (bb prove)                      | ✅ Complete    | ~16KB UltraHonk proofs, 10-60s generation                                      |
| Local Proof Verification (bb verify)                          | ✅ Complete    | Server-side BN254 pairing check                                                |
| Stellar Smart Contracts (poker_game, noir_verifier, game_hub) | ✅ Deployed    | Testnet, cross-contract verification                                           |
| Attestation Gate (on-chain enforcement)                       | ✅ Complete    | No attestation → proof rejected                                                |
| Frontend Game UI                                              | ✅ Complete    | Poker table, betting, showdown                                                 |
| AI Opponents (Blaze, Steel, Sage, Lucky)                      | ✅ Complete    | Multi-LLM with distinct personalities                                          |
| PvP Multiplayer                                               | ✅ Complete    | Real-time via polling                                                          |
| zkVerify Blockchain Integration                               | ⏳ Planned     | Code in place, chain returns empty hash — not yet producing valid attestations |
| RISC Zero Backend                                             | ⏳ Beta        | Fallback to Noir on failure                                                    |
| Mainnet Deployment                                            | ❌ Not started | Currently testnet only                                                         |

---

## Roadmap

### Phase 1 — Core Game ✅

- [x] Noir ZK circuit with Poseidon2 commit-reveal scheme
- [x] Barretenberg UltraHonk proof generation & verification
- [x] Stellar Soroban smart contracts (poker_game, noir_verifier, game_hub)
- [x] Cross-contract proof verification with attestation gate
- [x] Frontend poker game with betting rounds
- [x] AI opponents with multi-LLM support

### Phase 2 — Multiplayer & Polish ✅

- [x] PvP real-time multiplayer mode
- [x] Wallet integration (Freighter)
- [x] Game hub for tracking active/completed games
- [x] English localization

### Phase 3 — zkVerify Blockchain Integration ⏳

- [ ] Fix zkVerify Volta testnet connection (currently returns empty block/tx hash)
- [ ] End-to-end zkVerify attestation flow producing valid on-chain attestations
- [ ] Cross-reference zkVerify attestations from Stellar contracts
- [ ] Dashboard showing zkVerify attestation history per game

### Phase 4 — Advanced Features 🔮

- [ ] RISC Zero backend (full integration, not just beta fallback)
- [ ] Tournament mode (multi-table, bracket system)
- [ ] On-chain leaderboard with ZK-verified stats
- [ ] Mainnet deployment (Stellar public network)
- [ ] Mobile-responsive UI improvements
- [ ] Spectator mode for live games

---

## Tech Stack

| Category            | Technology                                                  |
| ------------------- | ----------------------------------------------------------- |
| **Blockchain**      | Stellar Soroban (Testnet)                                   |
| **Smart Contracts** | Rust + Soroban SDK                                          |
| **ZK Circuits**     | Noir Lang 1.0.0-beta.18                                     |
| **Proof System**    | Barretenberg UltraHonk (BN254)                              |
| **ZK Verification** | zkVerify Volta Testnet (Substrate)                          |
| **Frontend**        | Next.js, React, TypeScript                                  |
| **Styling**         | Tailwind CSS                                                |
| **Wallet**          | Stellar Freighter                                           |
| **AI Opponents**    | OpenAI GPT-4o Mini, Claude Haiku 4.5, Gemini 2.5 Flash Lite |
| **Package Manager** | pnpm                                                        |

---

## License

MIT

---

## Environment Variables Reference

Full `.env.local` template with all available options:

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_POKER_CONTRACT=CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ
NEXT_PUBLIC_POKER_GAME_CONTRACT=CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ
NEXT_PUBLIC_DEPLOYER_ADDRESS=your-deployer-address-here
SOURCE_ADDRESS=your-source-address-here

# AI Opponent Bot
NEXT_PUBLIC_AI_BOT_ADDRESS=your-ai-bot-address-here
AI_BOT_SECRET=your-ai-bot-secret-here
DEPLOYER_SECRET=your-deployer-secret-here

# Game Hub Integration
# IMPORTANT: Disabled for AI opponent mode (bot cannot sign transactions)
# Set to true ONLY for PvP (two real players with wallets)
NEXT_PUBLIC_ENABLE_GAME_HUB=true

# Zero-Knowledge Proofs
# Enable real ZK proof generation (requires circuit compilation)
NEXT_PUBLIC_ENABLE_ZK_PROOFS=true

# ZK Verifier Contracts (deployed Feb 19, 2026)
NEXT_PUBLIC_NOIR_VERIFIER_CONTRACT=CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5
NEXT_PUBLIC_RISC0_VERIFIER_CONTRACT=CABIRANZOPIFQRE5FV5L5HZDTUUSHKKK45WAL3MCOMWPPOZDG3ASSH7H

# zkVerify — Volta testnet seed phrase (for on-chain ZK verification)
# Layer 1 (bb verify) works without this. Layer 2 (zkVerify chain) needs it.
# Get testnet tokens: https://docs.zkverify.io/overview/getting-started
ZKVERIFY_SEED_PHRASE=

# ── AI Opponent API Keys ───────────────────────────────────────────
# GPT-4o Mini — https://platform.openai.com/api-keys
OPENAI_API_KEY=your-openai-api-key-here

# Claude 3.5 Haiku — https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Gemini 2.5 Flash Lite — https://aistudio.google.com/apikey
GOOGLE_GEMINI_API_KEY=your-google-gemini-api-key-here
```
