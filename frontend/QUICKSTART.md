# ZK Poker - Quick Start Guide

## 🚀 Installation

### Prerequisites
```bash
# Node.js 18+
node --version  # Should be 18.x or higher

# pnpm (recommended)
npm install -g pnpm
```

### Setup Steps

1. **Install Dependencies**
   ```bash
   cd frontend
   pnpm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local if needed (defaults work for testnet)
   ```

3. **Run Development Server**
   ```bash
   pnpm dev
   # Opens on http://localhost:3000
   ```

## 🎮 How to Play

1. **Connect Wallet**
   - Click "Connect Wallet"
   - Approve Freighter wallet connection
   - Make sure you're on Stellar Testnet

2. **Get Test XLM** (if needed)
   - Visit: https://laboratory.stellar.org/#account-creator?network=test
   - Or use friendbot: https://friendbot.stellar.org

3. **Start a Game**
   - Click "New Game" to create a game
   - Share the game ID with opponent
   - Wait for opponent to join

4. **Play Texas Hold'em**
   - **Blinds**: Small Blind (10 chips) + Big Blind (20 chips)
   - **Starting Chips**: 1,000 each
   - **Actions**: Fold, Check, Call, Bet/Raise
   - **Rounds**: Pre-Flop → Flop → Turn → River → Showdown

5. **Showdown (ZK Magic!)**
   - Game automatically calculates hand strengths
   - ZK proofs generated in your browser
   - Winner determined without revealing cards
   - Check console for proof logs: `🔐 Player X hand rank: Y`

## 🃏 Game Rules Summary

### Hand Rankings (0-9)
- 9: Royal Flush
- 8: Straight Flush
- 7: Four of a Kind
- 6: Full House
- 5: Flush
- 4: Straight
- 3: Three of a Kind
- 2: Two Pair
- 1: One Pair
- 0: High Card

### Betting Structure
- **Small Blind**: 10 chips (Player 1 / Dealer)
- **Big Blind**: 20 chips (Player 2)
- **Minimum Raise**: 2× previous bet
- **Action Timeout**: 30 seconds per action

## 🔐 Zero-Knowledge Features

### What is Private?
- ✅ Your hole cards (never revealed)
- ✅ Opponent's hole cards (never revealed)
- ✅ Only hand **strength** (rank 0-9) is proven

### What is Public?
- ✅ Community cards (everyone sees)
- ✅ Betting actions (fold, call, bet amounts)
- ✅ Pot size
- ✅ Hand rank at showdown (not the cards!)

### Proof Generation
Check your browser console during showdown:
```
🎯 SHOWDOWN - Generating ZK Proofs
🔐 Player 0 hand rank: 3 - Cards: K♠, K♦
🔐 Player 1 hand rank: 1 - Cards: 7♥, 7♣
🎉 Player 0 WINS! Rank: 3 > 1 - Won: 150 chips
✅ Showdown complete - ZK proofs verified (simulated)
```

## 🛠️ Development

### Project Structure
```
frontend/
├── app/
│   ├── page.tsx              # Landing page
│   └── game/[id]/page.tsx    # Active game
├── components/
│   ├── PokerTable.tsx        # Main game UI
│   ├── CommunityCards.tsx    # Community cards display
│   └── BettingControls.tsx   # Action buttons
├── hooks/
│   └── useTexasHoldem.ts     # Game logic + ZK integration
├── lib/
│   ├── zkproof.ts            # ZK proof generation
│   ├── zk-contract.ts        # Contract interaction
│   └── stellar.ts            # Stellar SDK integration
└── .env.local                # Configuration
```

### Key Files

**Game Logic**: `hooks/useTexasHoldem.ts`
- Texas Hold'em rules implementation
- Betting round progression
- ZK proof integration (calculateHandRank)

**ZK Proofs**: `lib/zkproof.ts`
- Hand rank calculation (0-9)
- Proof generation (MVP: simulated)
- Commitment generation

**Smart Contract**: `contracts/poker_game/src/lib.rs`
- `resolve_showdown()` - ZK winner determination
- `submit_commitment()` - Card commitment

## 📋 Environment Variables

Create `.env.local` from `.env.example`:

```bash
# Network
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC=https://soroban-testnet.stellar.org

# Contracts (already deployed)
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_POKER_GAME_CONTRACT=CAXD7S4SFBBKJQZDKH2MKX25DJF22YWKKRDUBMMJIFSGMEEATGQBK3EL

# Game Settings
NEXT_PUBLIC_SMALL_BLIND=10
NEXT_PUBLIC_BIG_BLIND=20
NEXT_PUBLIC_STARTING_CHIPS=1000
NEXT_PUBLIC_ACTION_TIMEOUT_SECONDS=30
```

## 🧪 Testing

```bash
# Run development server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm type-check
```

## 📚 Documentation

- **Full Documentation**: See `README.md` in root
- **ZK Implementation**: See `ZK-IMPLEMENTATION.md`
- **Integration Details**: See `ZK-INTEGRATION-SUMMARY.md`
- **Texas Hold'em Rules**: See `texas.md`

## 🐛 Common Issues

### Port Already in Use
```bash
# Kill existing process
pkill -f "pnpm dev"
# Or use different port
PORT=3001 pnpm dev
```

### Wallet Not Connecting
- Make sure Freighter extension is installed
- Switch to Stellar Testnet in Freighter
- Refresh the page

### Game Not Starting
- Check browser console for errors
- Verify you have test XLM
- Make sure both players connected

## 🎯 MVP Features (Current)

✅ Heads-up (2-player) Texas Hold'em
✅ ZK-inspired hand rank calculation
✅ Mock ZK proof generation
✅ Winner determination without revealing cards
✅ Proper Texas Hold'em betting rounds
✅ Opponent AI

## 🔜 Next Steps (Production)

- [ ] Compile Noir circuits
- [ ] Real ZK proof generation
- [ ] On-chain proof verification
- [ ] Multi-player support
- [ ] Tournament mode

## 🙏 Credits

Built for **Stellar ZK Gaming Hackathon 2026**

Technologies:
- Stellar Soroban (Smart Contracts)
- Noir (ZK Circuits)
- Next.js + TypeScript (Frontend)
- TailwindCSS (Styling)

---

**Need help?** Check the full `README.md` or `texas.md` for detailed documentation.
