# Soroban Smart Contracts

This directory contains the Stellar Soroban smart contracts for ZK Poker.

## Contracts

### 1. Poker Game Contract (`poker_game/`)

Main game logic contract.

**Functions**:

- `init_game(game_id, player1, player2, starting_chips)` - Initialize new game
- `submit_commitment(player, commitment)` - Submit card commitment
- `place_bet(player, amount)` - Place a bet
- `fold(player)` - Fold current hand
- `reveal_community_cards(cards)` - Reveal flop/turn/river
- `end_game(winner)` - Declare winner and distribute pot
- `get_game_state()` - Get current game state

**State**:

- Game ID
- Players (addresses, chips, commitments, bets, fold status)
- Pot amount
- Community cards
- Current betting round
- Dealer button position

---

### 2. Game Hub Contract (`game_hub/`)

Registry contract for tracking all games.

**Functions**:

- `start_game(player1, player2)` - Register new game, returns game_id
- `end_game(game_id, winner)` - Record game result
- `get_game(game_id)` - Get game information

**Required for Hackathon**: All games must call this contract.

**Contract Address**: `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`

---

## Building Contracts

```bash
cargo build --target wasm32-unknown-unknown --release
```

Or use Stellar CLI:

```bash
stellar contract build
```

## Testing Contracts

```bash
cargo test
```

## Deploying to Stellar Testnet

1. **Install Stellar CLI**:

   ```bash
   cargo install stellar-cli
   ```

2. **Configure identity**:

   ```bash
   stellar keys generate --global alice --network testnet
   stellar keys address alice
   ```

3. **Deploy contract**:

   ```bash
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/poker_game.wasm \
     --source alice \
     --network testnet
   ```

4. **Initialize contract** (if needed):
   ```bash
   stellar contract invoke \
     --id CONTRACT_ID \
     --source alice \
     --network testnet \
     -- \
     init_game \
     --game_id "0x..." \
     --player1 "GABC..." \
     --player2 "GDEF..." \
     --starting_chips 1000
   ```

## Invoking Contract Functions

### From CLI

```bash
stellar contract invoke \
  --id CONTRACT_ID \
  --source alice \
  --network testnet \
  -- \
  place_bet \
  --player "GABC..." \
  --amount 100
```

### From Frontend (TypeScript)

See `frontend/lib/stellar.ts` for integration examples.

## Contract Optimization

- Use `#![no_std]` for smaller WASM size
- Optimize with `opt-level = "z"` in release profile
- Minimize storage reads/writes
- Batch operations when possible

## Security Considerations

1. **Authorization**: Use `require_auth()` for all player actions
2. **Validation**: Validate all inputs (bet amounts, card indices, etc.)
3. **Reentrancy**: Soroban handles this, but be aware of state changes
4. **Integer Overflow**: Enable overflow-checks in release builds

---

For integration examples, see `frontend/lib/stellar.ts`
