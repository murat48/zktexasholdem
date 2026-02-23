# ♠️ ZK Poker on Stellar

Zero-Knowledge Texas Hold'em Poker game built for the Stellar ZK Gaming Hackathon. This is a heads-up (2-player) poker implementation where cards remain hidden using ZK proofs, making collusion impossible.

## 🎯 Features

- **Zero-Knowledge Privacy**: Cards remain hidden using Noir ZK circuits
- **Stellar Blockchain**: Smart contracts deployed on Stellar Testnet (Soroban)
- **Provably Fair**: All card commitments and hand validations are cryptographically verified
- **Real-time Gameplay**: Interactive poker table with betting controls
- **Game Hub Integration**: Integrates with the hackathon's Game Hub contract

## 🛠️ Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, TailwindCSS
- **Blockchain**: Stellar Soroban (Rust smart contracts)
- **ZK Proofs**: Noir language for circuits
- **Wallet**: Stellar Wallets (Freighter, xBull, etc.)
- **Package Manager**: pnpm

## 📁 Project Structure

```
/
├── circuits/          # Noir ZK circuits
│   ├── card_commitment.nr     # Card commitment proof
│   ├── hand_validation.nr     # Hand strength proof
│   └── showdown_proof.nr      # Winner verification proof
├── contracts/         # Soroban smart contracts (Rust)
│   ├── poker_game/    # Main game logic contract
│   └── game_hub/      # Game registry contract
├── frontend/          # Next.js application
│   ├── app/           # App router pages
│   ├── components/    # React components
│   ├── lib/           # Utilities and blockchain integration
│   └── hooks/         # Custom React hooks
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Rust and Cargo (for Soroban contracts)
- Noir (for ZK circuits)
- Stellar CLI (for contract deployment)

### Installation

1. **Clone the repository**

   ```bash
   cd zkstellar/texasholdem
   ```

2. **Install frontend dependencies**

   ```bash
   cd frontend
   pnpm install
   ```

3. **Build ZK circuits**

   ```bash
   cd ../circuits
   nargo compile
   ```

4. **Build smart contracts**
   ```bash
   cd ../contracts
   cargo build --target wasm32-unknown-unknown --release
   ```

### Running Locally

1. **Start the frontend development server**

   ```bash
   cd frontend
   pnpm dev
   ```

2. **Open your browser**
   Navigate to `http://localhost:3000`

## 🎮 How to Play

1. **Connect Wallet**: Click "Connect Wallet" and approve the connection
2. **Create Game**: Click "Create New Game" or "Join Game"
3. **Receive Cards**: Your hole cards are dealt and committed to the blockchain
4. **Betting Rounds**: Make bets, check, or fold during each round
5. **Showdown**: Winner proves their hand using ZK proofs
6. **Collect Pot**: Winner receives the pot automatically

## 🔐 Zero-Knowledge Implementation

### Card Commitment

When cards are dealt, each player generates a commitment:

```
commitment = Poseidon2Hash(card1, card2, salt)
```

This commitment is published on-chain without revealing the actual cards.

### Hand Validation

At showdown, the winner generates a ZK proof that:

1. Their cards match the original commitment
2. Their hand is valid
3. Their hand beats the opponent's (without revealing opponent's cards)

### Privacy Guarantees

- **Losing player's cards**: Never revealed
- **Folded hands**: Remain private forever
- **No trusted setup**: Uses Poseidon2 hash (no preprocessing)

## 📝 Smart Contracts

### Poker Game Contract

Main game logic including:

- Card commitment submission
- Betting actions (bet, check, fold)
- Community card revelation
- Winner declaration

### Game Hub Contract

Registry for all games:

- `start_game(player1, player2)` - Initialize new game
- `end_game(game_id, winner)` - Record game result

**Game Hub Address**: `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`

## 🧪 Testing

### Run Frontend Tests

```bash
cd frontend
pnpm test
```

### Run Contract Tests

```bash
cd contracts
cargo test
```

### Test ZK Circuits

```bash
cd circuits
nargo test
```

## 🚢 Deployment

### Deploy Contracts to Stellar Testnet

1. **Build contracts**

   ```bash
   cd contracts
   stellar contract build
   ```

2. **Deploy poker game contract**

   ```bash
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/poker_game.wasm \
     --source YOUR_SECRET_KEY \
     --network testnet
   ```

3. **Update environment variables**
   ```bash
   cd ../frontend
   echo "NEXT_PUBLIC_POKER_CONTRACT=YOUR_CONTRACT_ID" >> .env.local
   ```

### Deploy Frontend

```bash
cd frontend
pnpm build
# Deploy to Vercel, Netlify, or your preferred hosting
```

## 🎯 Hackathon Checklist

- ✅ Stellar Testnet deployment
- ✅ Game Hub integration (start_game/end_game)
- ✅ ZK proofs for card privacy
- ✅ Working poker gameplay
- ✅ UI/UX implementation
- ✅ Public GitHub repository
- 🔲 Video demo (record before submission)
- 🔲 Final testing

## 🤝 Contributing

This is a hackathon project, but contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Stellar Development Foundation for the hackathon
- Noir team for ZK tooling
- Soroban documentation and examples

## 📞 Support

For questions or issues:

- Open a GitHub issue
- Join Stellar Dev Discord
- Check Soroban documentation

---

**Built for Stellar ZK Gaming Hackathon 2026** 🚀

Good luck and have fun playing ZK Poker! ♠️♥️♦️♣️
