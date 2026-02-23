# Game Hub Integration - Stellar Game Studio

## ⚠️ Current Status: DISABLED (AI Opponent Mode)

Game Hub integration is **disabled by default** because it requires **both players to sign transactions**, but our AI opponent cannot sign.

## The Problem

### Why Two Signatures?

When calling Game Hub's `start_game()`:

```rust
pub fn start_game(
    env: Env,
    game_id: Address,        // The game contract address
    session_id: u32,          // Unique session identifier
    player1: Address,         // First player address
    player2: Address,         // Second player address
    player1_points: i128,     // Player 1 starting chips/points
    player2_points: i128,     // Player 2 starting chips/points
)
```

The contract requires **authorization from both player addresses**. When you try to call this:

1. Freighter asks for player1 signature ✅
2. Freighter asks for player2 signature ❌ **AI bot cannot sign!**

Result: `XDR Read Error: attempt to read outside the boundary of the buffer`

### Root Cause

- **Player 1**: Real human with Freighter wallet → CAN sign
- **Player 2**: AI bot (no wallet, just an address) → CANNOT sign

The transaction fails because we cannot provide authorization for the AI bot.

## Solutions

### Option 1: Mock Mode (CURRENT - Default) ✅

Game Hub calls are disabled. Game works 100% locally:

```bash
# .env.local
NEXT_PUBLIC_ENABLE_GAME_HUB=false  # Default
```

Console output:

```
🎮 Notifying Game Hub: Game Started
⚠️ Game Hub integration DISABLED (AI opponent cannot sign)
✅ Game start notification logged (mock)
```

### Option 2: PvP Mode (Future Implementation)

For **two real players**, both with wallets:

```bash
NEXT_PUBLIC_ENABLE_GAME_HUB=true
```

Requirements:

- Player 1: Real wallet (Freighter)
- Player 2: Real wallet (Freighter)
- Both players must sign the transaction

### Option 3: Server-Side Bot Signing (Complex)

Store AI bot's secret key server-side and sign programmatically:

- Create API route `/api/sign-bot-transaction`
- Server holds `AI_BOT_SECRET_KEY`
- Multi-step signing flow (like Stellar Game Studio examples)

**Not recommended** - adds complexity and security concerns.

### Option 4: Contract-Side Integration (Best Practice)

In Stellar Game Studio examples, the **game contract itself** calls Game Hub:

```rust
// Inside your poker contract (not frontend)
pub fn start_game() {
    // Game contract authorizes itself
    game_hub_client.start_game(...);
}
```

This way only the contract needs to authorize, not individual players.

**Note:** We don't have a game contract (all logic is frontend), so this isn't feasible.

## Current Implementation

### Console Flow (Mock Mode)

**Game Start:**

```
🎮 Notifying Game Hub: Game Started
Session ID: poker-game-1
Player 1 (Human): GCXOW6524GWIAGUCZVEMA73BEMCASW56AKCHTPGF6I7IJJ6Q6NRTG7XR
Player 2 (AI Bot): GAJXYRRBECPQVCOCCLBCCZ2KGGNEHL32TLJRT2JWLNVE4HJ35OAKAPH2
⚠️ Game Hub integration DISABLED (AI opponent cannot sign)
✅ Game start notification logged (mock)
```

**Game End:**

```
🏁 Notifying Game Hub: Game Ended
Session ID: poker-game-1
Winner: GCXOW6524GWIAGUCZVEMA73BEMCASW56AKCHTPGF6I7IJJ6Q6NRTG7XR
⚠️ Game Hub integration DISABLED (AI opponent mode)
✅ Game end notification logged (mock)
```

### Code Structure

All real contract calls are **commented out** in [`lib/zk-contract.ts`](frontend/lib/zk-contract.ts):

```typescript
/* DISABLED: Requires both player signatures
const tx = new StellarSDK.TransactionBuilder(sourceAccount, ...)
  .addOperation(
    contract.call('start_game', ...)
  )
  .build();
*/
```

## Contract Signatures (from Stellar Game Studio)

### start_game

```rust
pub fn start_game(
    env: Env,
    game_id: Address,        // The game contract address
    session_id: u32,          // Unique session identifier
    player1: Address,         // First player address
    player2: Address,         // Second player address
    player1_points: i128,     // Player 1 starting chips/points
    player2_points: i128,     // Player 2 starting chips/points
)
```

### end_game

```rust
pub fn end_game(
    env: Env,
    session_id: u32,          // Session to end (same as start_game)
    player1_won: bool,        // True if player1 won, false if player2 won
)
```

## How to Enable (PvP Only)

1. **Update environment:**

```bash
# .env.local
NEXT_PUBLIC_ENABLE_GAME_HUB=true
```

2. **Implement PvP matchmaking:**

- Remove AI opponent
- Add second player connection
- Both players connect Freighter
- Both players sign transaction

3. **Restart development server:**

```bash
npm run dev
```

## Testing

**Current (AI Mode):**

- ✅ Game works 100%
- ✅ No blockchain calls
- ✅ No wallet required for AI
- ✅ Console logging only

**Future (PvP Mode):**

- Requires 2 real wallets
- Both must sign
- Real blockchain transactions
- Game Hub events published

## Contract Addresses

- **Game Hub**: `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`
- **Poker Game**: `CAXD7S4SFBBKJQZDKH2MKX25DJF22YWKKRDUBMMJIFSGMEEATGQBK3EL`
- **Network**: Stellar Testnet

## References

- **Stellar Game Studio Repo**: https://github.com/jamesbachini/Stellar-Game-Studio
- **Mock Game Hub Contract**: `contracts/mock-game-hub/src/lib.rs`
- **Multi-Signature Example**: `template_frontend/src/games/number-guess/numberGuessService.ts`

## Summary

✅ **Game works perfectly** - all poker logic functions  
⚠️ **Game Hub disabled** - AI opponent cannot authorize transactions  
🔜 **Enable for PvP** - when two real players join  
📝 **Mock mode active** - logs to console, no blockchain calls

### start_game

```rust
pub fn start_game(
    env: Env,
    game_id: Address,        // The game contract address
    session_id: u32,          // Unique session identifier
    player1: Address,         // First player address
    player2: Address,         // Second player address
    player1_points: i128,     // Player 1 starting chips/points
    player2_points: i128,     // Player 2 starting chips/points
)
```

### end_game

```rust
pub fn end_game(
    env: Env,
    session_id: u32,          // Session to end (same as start_game)
    player1_won: bool,        // True if player1 won, false if player2 won
)
```

## TypeScript Implementation

### notifyGameStart()

```typescript
contract.call(
  "start_game",
  new StellarSDK.Address(POKER_GAME_CONTRACT).toScVal(), // game_id
  StellarSDK.nativeToScVal(sessionId, { type: "u32" }), // session_id
  new StellarSDK.Address(player1).toScVal(), // player1
  new StellarSDK.Address(player2).toScVal(), // player2
  StellarSDK.nativeToScVal(1000, { type: "i128" }), // player1_points
  StellarSDK.nativeToScVal(1000, { type: "i128" }), // player2_points
);
```

### notifyGameEnd()

```typescript
contract.call(
  "end_game",
  StellarSDK.nativeToScVal(sessionId, { type: "u32" }), // session_id
  StellarSDK.nativeToScVal(player1Won, { type: "bool" }), // player1_won
);
```

## How It Works

1. **Game Start**: When a new poker game begins, `notifyGameStart()` is called
   - Converts `gameId` string to `u32` using hash function
   - Uses `POKER_GAME_CONTRACT` address as `game_id`
   - Sends both player addresses
   - Sets both players' starting points to 1000 (chips)

2. **Game End**: When game finishes, `notifyGameEnd()` is called
   - Uses same session ID (hashed from gameId)
   - Determines winner by comparing addresses
   - Sends `player1_won` boolean

3. **Mock Mode**: If no wallet is connected, functions log to console only

## Session ID Generation

```typescript
// Convert gameId string to deterministic u32
const sessionId = Math.abs(
  gameId.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0),
);
```

This creates a unique session ID from the game ID string.

## Game Hub Events

The contract emits two events:

### GameStarted

```rust
pub struct GameStarted {
    pub session_id: u32,
    pub game_id: Address,
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
}
```

### GameEnded

```rust
pub struct GameEnded {
    pub session_id: u32,
    pub player1_won: bool,
}
```

## Testing

**Mock Mode (default):**

- No wallet needed
- Console logs only
- Game works 100%

**Production Mode:**

- Freighter wallet required
- Real blockchain transactions
- Game Hub events published on-chain

## Contract Addresses

- **Game Hub**: `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`
- **Poker Game**: `CAXD7S4SFBBKJQZDKH2MKX25DJF22YWKKRDUBMMJIFSGMEEATGQBK3EL`
- **Network**: Stellar Testnet

## Example Flow

1. Player connects Freighter wallet
2. New game starts → `start_game()` called with 6 parameters
3. Game plays normally (all local)
4. Game ends → `end_game()` called with 2 parameters
5. Game Hub records session on blockchain

## References

- **Stellar Game Studio Repo**: https://github.com/jamesbachini/Stellar-Game-Studio
- **Mock Game Hub Contract**: `contracts/mock-game-hub/src/lib.rs`
- **Example Integration**: `template_frontend/src/games/number-guess/numberGuessService.ts`

## Notes

- ✅ All parameter counts match contract signatures
- ✅ All types correctly converted (Address, u32, i128, bool)
- ✅ Session ID consistent between start and end
- ✅ Graceful fallback to mock mode if wallet unavailable
- ✅ No errors in TypeScript compilation
