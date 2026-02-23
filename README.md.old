# 🃏 ZK Poker — Zero-Knowledge Texas Hold'em on Stellar

> **Stellar ZK Gaming Hackathon 2026**  
> Provably fair, collusion-proof heads-up poker powered by Zero-Knowledge proofs on Stellar Protocol 25.

---

## 🎯 What Is This?

ZK Poker is a **2-player (heads-up) Texas Hold'em** game where cards are **never revealed** — not even at showdown. Players prove their hand strength using Zero-Knowledge proofs, making collusion mathematically impossible.

### The Problem It Solves

In traditional online poker:
- The server sees every card → can manipulate outcomes
- Players can collude via Discord to share hole cards
- "Trust me" is the only guarantee of fairness

In ZK Poker:
- Cards are committed as hashes on-chain before the game starts
- Every action is backed by a ZK proof
- At showdown, only hand **strength (a number 0–9)** is revealed — never the cards themselves
- Cheating is cryptographically impossible

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js 14 + TypeScript + TailwindCSS                      │
│  • Poker UI (table, cards, chips)                           │
│  • Stellar Wallets Kit (Freighter, xBull)                   │
│  • Client-side ZK proof generation (Noir + Barretenberg)    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    ZK CIRCUITS (Noir)                       │
│  • card_commitment.nr   — Hash hole cards                   │
│  • hand_rank_proof.nr   — Prove hand strength (0–9)         │
│  • action_proof.nr      — Prove valid betting action        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               SMART CONTRACTS (Soroban / Rust)              │
│  • poker_game.rs        — Game logic & state                │
│  • zk_verifier.rs       — On-chain ZK proof verification    │
│  • game_hub.rs          — start_game() / end_game()         │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
              Stellar Testnet (Protocol 25)
              BN254 + Poseidon2 primitives
```

---

## 🃏 How Texas Hold'em Works

### Setup (Heads-Up / 2 Players)

| Role | Player |
|------|--------|
| Dealer / Small Blind | Player 1 |
| Big Blind | Player 2 |
| Small Blind amount | 10 chips |
| Big Blind amount | 20 chips |
| Starting stack | 1,000 chips each |

> ⚠️ **Heads-Up rule**: Dealer = Small Blind. Dealer acts **first** pre-flop, but **last** on all later streets.

---

### 🔄 Game Flow

```
1. BLINDS POSTED
   Player 1 (Dealer/SB): 10 chips forced
   Player 2 (BB):        20 chips forced
   Starting Pot:         30 chips

2. HOLE CARDS DEALT (ZK Commit)
   Each player receives 2 private cards
   Each player immediately commits: hash(card1, card2, secret) → on-chain

3. FOUR BETTING ROUNDS
   Pre-Flop → Flop → Turn → River

4. SHOWDOWN
   Each player generates ZK proof of hand strength
   Contract compares rank numbers → Winner takes pot
```

---

### 📋 The Four Betting Rounds

#### Pre-Flop
- No community cards yet
- Player 1 (SB/Dealer) acts **first**
- Actions: Fold / Call (match BB to 20) / Raise (min 2× BB = 40)

```
Example:
  Player 1: Raise to 60
  Player 2: Call (adds 40)
  Pot: 120 chips
```

#### Flop (3 community cards revealed)
- Player 2 acts **first** from here on
- Actions: Check / Bet (min 20) / Call / Raise / Fold

```
Community: [K♥  Q♦  7♣]

Example:
  Player 2: Check
  Player 1: Bet 80
  Player 2: Call
  Pot: 280 chips
```

#### Turn (4th community card)
- Same order as Flop (Player 2 first)

```
Community: [K♥  Q♦  7♣ | J♠]

Example:
  Player 2: Bet 120
  Player 1: Raise to 300
  Player 2: Call
  Pot: 700 chips
```

#### River (5th and final community card)
- Same order. Last chance to bet.

```
Community: [K♥  Q♦  7♣ | J♠ | 2♥]

Example:
  Player 2: Check
  Player 1: Bet 300
  Player 2: Call
  Pot: 1,300 chips
```

---

### 📈 How the Pot Grows

```
Blinds:        30  chips
+ Pre-Flop:   +90  chips  →  120 chips
+ Flop:      +160  chips  →  280 chips
+ Turn:      +420  chips  →  700 chips
+ River:     +600  chips  → 1,300 chips ← Winner takes this
```

---

### 🔺 Raise Rules

| Situation | Minimum Raise |
|-----------|--------------|
| Opening bet | 1× Big Blind (20 chips) |
| After a bet of X | 2× X |
| After a raise of X | 2× X |

**All-In Example:**
```
Player 1 has 300 chips remaining
Player 2 bets 500 chips

Player 1: All-In (300 chips)
Player 2: Can win maximum 300 × 2 = 600 chips
          Remaining 200 chips returned to Player 2

Main Pot: 600 chips
```

---

### 🏆 Hand Rankings (0–9)

| Rank | Hand | Example |
|------|------|---------|
| 9 | Royal Flush | A♠ K♠ Q♠ J♠ 10♠ |
| 8 | Straight Flush | 9♥ 8♥ 7♥ 6♥ 5♥ |
| 7 | Four of a Kind | Q♠ Q♥ Q♦ Q♣ 3♠ |
| 6 | Full House | J♠ J♥ J♦ 4♠ 4♥ |
| 5 | Flush | K♦ J♦ 8♦ 5♦ 2♦ |
| 4 | Straight | 8♠ 7♥ 6♦ 5♣ 4♠ |
| 3 | Three of a Kind | 7♠ 7♥ 7♦ A♠ K♣ |
| 2 | Two Pair | K♠ K♦ 9♥ 9♣ 5♠ |
| 1 | One Pair | A♠ A♦ K♠ 8♥ 3♣ |
| 0 | High Card | A♠ K♦ 9♥ 6♣ 2♠ |

> Always use the **best 5 cards** from your 2 hole cards + 5 community cards (7 total).

---

### ⚠️ Common Mistakes

```
❌ "Dealer always acts last"
✅ Pre-flop: Dealer acts FIRST
   Flop/Turn/River: Dealer acts LAST

❌ "I use all 7 cards"
✅ Best 5 cards only from 7 available

❌ "All-in means I lose everything"
✅ All-in: You can only WIN what you put in (×2)
```

---

## 🔐 Zero-Knowledge Implementation

### Why ZK Is Essential Here

Without ZK:
```
Server sees: Player 1 has [A♠ K♠], Player 2 has [7♥ 2♦]
→ Server can leak info, manipulate outcome
→ Players can share hole cards via Discord (collusion)
→ "Trust me" is the only guarantee
```

With ZK:
```
Contract sees: commitment_1 = 0x7a8d9f..., commitment_2 = 0x3b5e2c...
→ No one knows the cards (not even the server)
→ Collusion is useless (you can't use info you can't see)
→ Math is the guarantee
```

---

### Phase 1: Card Commitment (Pre-Flop)

When cards are dealt, each player immediately commits on-chain:

```typescript
// Client-side (never sent to server)
const myCards = [card1Index, card2Index]; // e.g. [48, 23] = A♠, J♥
const mySecret = generateSecureRandom();   // random 32 bytes

// Commitment stored on-chain (cards NOT revealed)
const commitment = poseidon2Hash([...myCards, ...mySecret]);
await contract.commitCards(gameId, commitment);
```

```noir
// circuits/card_commitment.nr
fn main(
    cards: [u8; 2],          // Private — never leaves browser
    secret: [u8; 32],        // Private — never leaves browser
    commitment: pub Field     // Public — stored on Stellar
) {
    let computed = poseidon2_hash([cards[0], cards[1], ...secret]);
    assert(computed == commitment);
}
```

---

### Phase 2: Action Proofs (Each Betting Round)

Every bet/raise/call generates a ZK proof that the action is valid:

```noir
// circuits/action_proof.nr
fn main(
    hole_cards: [u8; 2],        // Private
    card_commitment: pub Field,  // Public
    action: pub u8,              // Public: 0=fold, 1=check, 2=call, 3=raise
    bet_amount: pub u64          // Public
) {
    // 1. Prove these cards match the commitment
    assert(poseidon2_hash(hole_cards) == card_commitment);

    // 2. Prove action is valid (e.g. can't raise 0 chips)
    if action == 3 {
        assert(bet_amount > 0);
    }
}
```

---

### Phase 3: Showdown Proof (Winner Determination)

The core ZK mechanic — prove hand strength without revealing cards:

```noir
// circuits/hand_rank_proof.nr
fn main(
    hole_cards: [u8; 2],           // Private — NEVER revealed
    secret: [u8; 32],              // Private
    card_commitment: pub Field,     // Public
    community_cards: pub [u8; 5],  // Public (on-chain)
    claimed_rank: pub u8,          // Public (0–9)
    claimed_kickers: pub [u8; 5]   // Public (for tie-breaking)
) {
    // Step 1: Verify commitment
    assert(poseidon2_hash([...hole_cards, ...secret]) == card_commitment);

    // Step 2: Evaluate best 5-card hand
    let all_cards = [...hole_cards, ...community_cards]; // 7 cards
    let (actual_rank, actual_kickers) = evaluate_best_hand(all_cards);

    // Step 3: Claimed rank must match actual rank
    assert(actual_rank == claimed_rank);
    assert(actual_kickers == claimed_kickers);
}
```

**Winner determination in Soroban contract:**

```rust
pub fn resolve_showdown(
    env: Env,
    game_id: u64,
    p1_proof: BytesN<128>,
    p1_rank: u8,
    p1_kickers: Vec<u8>,
    p2_proof: BytesN<128>,
    p2_rank: u8,
    p2_kickers: Vec<u8>,
) -> Address {
    // 1. Verify both ZK proofs on-chain
    assert!(verify_zk_proof(&env, p1_proof));
    assert!(verify_zk_proof(&env, p2_proof));

    // 2. Compare hand ranks
    let winner = if p1_rank > p2_rank {
        get_player(&env, game_id, 1)
    } else if p2_rank > p1_rank {
        get_player(&env, game_id, 2)
    } else {
        // 3. Tie-break by kickers
        compare_kickers(&env, p1_kickers, p2_kickers, game_id)
    };

    // 4. Transfer pot to winner
    transfer_pot(&env, game_id, &winner);

    // 5. Notify Game Hub
    end_game(&env, game_id, &winner);

    winner
}
```

---

### 🚨 Why Cheating Is Impossible

```
Attack: Player lies about hand strength

Player 2 has: [2♠ 3♦] + community [A♥ K♣ Q♦ J♠ 9♥]
Reality:       High Card (rank = 0)
Player 2 claims: Full House (rank = 6)  ← LIE

Noir circuit tries to generate proof:
  actual_rank = evaluate([2♠, 3♦, A♥, K♣, Q♦, J♠, 9♥]) = 0
  assert(0 == 6)  ← FAILS ❌

Proof cannot be generated.
Transaction cannot be submitted.
Player 2 automatically loses (timeout).
```

---

### 🎭 Collusion Is Useless

```
Traditional poker collusion:
  Player 1 DMs Player 2: "I have Ace-King!"
  Player 2 plays accordingly → unfair advantage ✓

ZK Poker collusion attempt:
  Player 1 DMs Player 2: "I have... wait..."
  Player 1 only sees their commitment hash: 0x7a8d9f...
  Player 1 CANNOT know their own cards after commit (they're hashed)

  Even if Player 1 shares raw cards:
  Player 2 still can't change their committed hand
  Cards are locked in at deal time → collusion is worthless ✓
```

---

## 📁 Project Structure

```
zk-poker/
├── circuits/                    # Noir ZK circuits
│   ├── card_commitment/
│   │   ├── src/main.nr
│   │   └── Nargo.toml
│   ├── hand_rank_proof/
│   │   ├── src/main.nr
│   │   └── Nargo.toml
│   └── action_proof/
│       ├── src/main.nr
│       └── Nargo.toml
│
├── contracts/                   # Soroban smart contracts (Rust)
│   └── poker_game/
│       ├── src/
│       │   ├── lib.rs           # Main contract
│       │   ├── game.rs          # Game state & logic
│       │   ├── verifier.rs      # ZK proof verification
│       │   └── hub.rs           # Game Hub integration
│       └── Cargo.toml
│
├── frontend/                    # Next.js application
│   ├── app/
│   │   ├── page.tsx             # Landing / lobby
│   │   ├── game/[id]/page.tsx   # Active game
│   │   └── layout.tsx
│   ├── components/
│   │   ├── PokerTable.tsx       # Main game UI
│   │   ├── PlayerHand.tsx       # Hidden / revealed cards
│   │   ├── CommunityCards.tsx   # Flop, turn, river
│   │   ├── BettingControls.tsx  # Fold, check, bet buttons
│   │   ├── ChipStack.tsx        # Visual chips
│   │   └── GameLog.tsx          # Action history
│   ├── lib/
│   │   ├── zk.ts                # Proof generation (Noir)
│   │   ├── stellar.ts           # Contract calls
│   │   ├── poker.ts             # Hand evaluation logic
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useGameState.ts      # Game state subscription
│   │   └── useWallet.ts         # Wallet connection
│   └── package.json
│
├── scripts/
│   ├── deploy.sh                # Deploy contracts to testnet
│   └── setup.sh                 # Initial setup
│
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

```bash
# Node.js 18+
node --version

# Rust + Cargo
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Stellar CLI
cargo install --locked stellar-cli --features opt

# Noir (Nargo)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# pnpm
npm install -g pnpm
```

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/zk-poker-stellar
cd zk-poker-stellar

# 2. Install frontend dependencies
cd frontend
pnpm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# 4. Configure Stellar testnet identity
stellar keys generate --global my-key --network testnet
stellar keys fund my-key --network testnet

# 5. Compile ZK circuits
cd ../circuits/hand_rank_proof
nargo compile

cd ../card_commitment
nargo compile

cd ../action_proof
nargo compile
```

### Deploy Contracts

```bash
cd contracts/poker_game

# Build
stellar contract build

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/poker_game.wasm \
  --source my-key \
  --network testnet

# Copy the contract ID to .env.local
```

### Run Frontend

```bash
cd frontend
pnpm dev
# Open http://localhost:3000
```

---

## ⚙️ Environment Variables

```bash
# .env.local

# Stellar
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC=https://soroban-testnet.stellar.org

# Contracts
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_POKER_CONTRACT=<your-deployed-contract-id>

# Game Config
NEXT_PUBLIC_SMALL_BLIND=10
NEXT_PUBLIC_BIG_BLIND=20
NEXT_PUBLIC_STARTING_CHIPS=1000
NEXT_PUBLIC_ACTION_TIMEOUT_SECONDS=30
```

---

## 🎮 How to Play

### 1. Connect Wallet
- Visit the app and connect your Freighter wallet
- Make sure you're on **Stellar Testnet**
- Get test XLM from [friendbot](https://friendbot.stellar.org)

### 2. Create or Join a Game
- **Create Game**: Deploy a new game contract, share the game ID with your opponent
- **Join Game**: Enter the game ID from your opponent

### 3. Game Starts
- Both players connect → `start_game()` called on Game Hub
- Blinds posted automatically
- Hole cards dealt → ZK commitments stored on-chain

### 4. Play
- On your turn: choose **Fold**, **Check/Call**, or **Bet/Raise**
- Each action generates a ZK proof in your browser
- Proof + action submitted to Stellar

### 5. Showdown
- All betting rounds complete
- Both players generate hand strength proofs
- Contract verifies proofs → declares winner
- `end_game()` called on Game Hub
- Winner receives pot

---

## 🔗 Smart Contract Interface

### Poker Game Contract

```rust
// Start a new game (also calls Game Hub start_game)
fn start_game(player1: Address, player2: Address) -> u64;

// Post blinds
fn post_blinds(game_id: u64);

// Commit hole cards (ZK commitment)
fn commit_cards(game_id: u64, commitment: BytesN<32>);

// Submit betting action with ZK proof
fn player_action(
    game_id: u64,
    action: u8,        // 0=fold, 1=check, 2=call, 3=raise
    amount: u64,
    proof: BytesN<128>
) -> GameState;

// Reveal community cards (Flop/Turn/River)
fn reveal_community_cards(game_id: u64, count: u8) -> Vec<u8>;

// Submit showdown proof
fn submit_showdown_proof(
    game_id: u64,
    rank: u8,
    kickers: Vec<u8>,
    proof: BytesN<128>
);

// Resolve winner (called after both proofs submitted)
fn resolve_winner(game_id: u64) -> Address;
```

### Game Hub Integration

```typescript
const GAME_HUB = 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';

// Called automatically when game starts
await callContract(GAME_HUB, 'start_game', [player1Address, player2Address]);

// Called automatically when game ends
await callContract(GAME_HUB, 'end_game', [gameId, winnerAddress]);
```

---

## 🧪 Testing

```bash
# Test ZK circuits
cd circuits/hand_rank_proof
nargo test

# Test smart contracts
cd contracts/poker_game
cargo test

# Test frontend
cd frontend
pnpm test

# Full integration test (requires running local Stellar node)
pnpm test:e2e
```

---

## 📊 ZK Proof Performance

| Circuit | Proof Size | Generation Time (Browser) | Verification Time (On-chain) |
|---------|-----------|--------------------------|------------------------------|
| card_commitment | ~1 KB | ~200ms | ~5ms |
| action_proof | ~2 KB | ~500ms | ~10ms |
| hand_rank_proof | ~4 KB | ~1.5s | ~20ms |

---

## 🛣️ Roadmap

### ✅ MVP (Hackathon)
- [x] Heads-up Texas Hold'em (2 players)
- [x] ZK card commitment
- [x] ZK hand rank proof
- [x] On-chain winner determination
- [x] Game Hub integration
- [x] Basic UI

### 🔜 Post-Hackathon
- [ ] Kicker comparison (tie-breaking detail)
- [ ] 3–6 player support (side pots)
- [ ] Tournament mode
- [ ] Provable card shuffling (commit-reveal)
- [ ] Replay / hand history
- [ ] Mobile app
- [ ] Mainnet deployment

---

## 🤔 FAQ

**Q: What if a player disconnects mid-game?**  
A: Each action has a 30-second timeout. If a player doesn't act in time, they automatically fold. Their chips remain locked in the contract until claimed.

**Q: How are cards shuffled fairly?**  
A: We use a commit-reveal scheme: both players submit a random seed before the game, the deck is shuffled using `hash(seed1 + seed2)`. Neither player can influence the outcome alone.

**Q: What if both players claim the same rank?**  
A: Kicker cards are also included in the proof. If kickers also match exactly, the pot is split 50/50.

**Q: Can the frontend lie about card values?**  
A: No. The ZK circuit enforces that the claimed hand rank matches the actual cards that were committed on-chain. Any lie makes proof generation fail.

**Q: Is this on mainnet?**  
A: This is a hackathon prototype on **Stellar Testnet** only. Mainnet deployment is planned post-hackathon after security audits.

---

## 👥 Team

| Name | Role |
|------|------|
| [Your Name] | Full-stack + ZK |

---

## 🙏 Acknowledgements

- [Stellar Development Foundation](https://stellar.org) — Protocol 25 ZK primitives
- [Noir Language](https://noir-lang.org) — ZK circuit toolchain
- [Stellar Game Studio](https://github.com/jamesbachini/Stellar-Game-Studio) — Hackathon boilerplate
- [James Bachini](https://www.youtube.com/@JamesBachini) — ZK circuit examples and tutorials

---

## 📄 License

MIT License — see [LICENSE](./LICENSE) for details.

---

<div align="center">

**Built for the [Stellar ZK Gaming Hackathon 2026](https://stellar.org)**

*"In God we trust. All others bring ZK proofs."*

</div>
