# Frontend Directory Structure

Next.js 14+ application with App Router, TypeScript, and TailwindCSS.

## Directory Overview

```
frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── globals.css        # Global styles
│   └── game/
│       └── [id]/
│           └── page.tsx   # Game page (dynamic route)
├── components/            # React components
│   ├── PokerTable.tsx    # Main table component
│   ├── PlayerHand.tsx    # Player cards display
│   ├── CommunityCards.tsx # Community cards display
│   ├── BettingControls.tsx # Bet/Check/Fold buttons
│   ├── ChipStack.tsx     # Visual chip representation
│   └── GameLog.tsx       # Action history log
├── lib/                   # Utilities and libraries
│   ├── utils.ts          # Common utilities (cn, formatChips, etc.)
│   ├── poker.ts          # Poker logic (card types, hand ranking)
│   ├── stellar.ts        # Stellar/Soroban integration
│   └── zkproof.ts        # ZK proof generation
├── hooks/                 # Custom React hooks
│   ├── useGameState.ts   # Game state management
│   └── useWallet.ts      # Wallet connection
└── package.json          # Dependencies
```

## Key Files

### `lib/poker.ts`

Core poker types and utilities:

- `Card` type (0-51 for 52 cards)
- `HandRank` enum
- `cardToString()` - Convert card number to display string
- `PokerGameState` interface

### `lib/stellar.ts`

Stellar blockchain integration:

- `callContract()` - Generic contract invocation
- `startGame()` - Call Game Hub start_game
- `endGame()` - Call Game Hub end_game
- Contract configuration

### `lib/zkproof.ts`

Zero-knowledge proof utilities:

- `generateHandProof()` - Generate ZK proof for hand
- `verifyProof()` - Verify ZK proof
- `generateCommitment()` - Create card commitment
- `generateSalt()` - Secure randomness

### `hooks/useGameState.ts`

Game state management:

- Fetches game state from blockchain
- Provides game actions (bet, fold, check)
- Handles optimistic updates

### `hooks/useWallet.ts`

Wallet connection:

- Connect/disconnect wallet
- Get current address
- Persist connection state

## Component Patterns

### Server Components (Default)

Use for static content and data fetching:

```typescript
// app/page.tsx
export default async function Page() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

### Client Components

Use `'use client'` for interactivity:

```typescript
"use client";

import { useState } from "react";

export function InteractiveComponent() {
  const [state, setState] = useState();
  // ...
}
```

## Styling

### TailwindCSS Utilities

```typescript
<button className="px-6 py-3 bg-stellar-purple hover:bg-stellar-purple-dark rounded-lg" />
```

### Custom Utilities with `cn()`

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  "base-classes",
  condition && "conditional-classes",
  variant === 'primary' && "primary-classes"
)} />
```

## Running Development Server

```bash
pnpm dev
```

Open http://localhost:3000

## Building for Production

```bash
pnpm build
pnpm start
```

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_POKER_CONTRACT=YOUR_CONTRACT_ID
```

## Adding New Features

1. **New Page**: Add to `app/` directory
2. **New Component**: Add to `components/` directory with proper typing
3. **New Utility**: Add to `lib/` directory
4. **New Hook**: Add to `hooks/` directory

## Best Practices

- Use TypeScript strict mode (no `any` types)
- Prefer Server Components by default
- Use `'use client'` only when necessary
- Keep components small and focused
- Use proper error boundaries
- Implement loading states

---

For more details, see PROJECT_README.md
