# Texas Hold'em Poker - Complete Game Rules and Mechanics

## Game Overview
Texas Hold'em is a community card poker game where players try to make the best 5-card poker hand using any combination of their 2 private cards (hole cards) and 5 community cards dealt face-up on the table.

## Basic Setup (Heads-Up / 2-Player Version)

### Starting Configuration
- **2 Players**: Player 1 and Player 2
- **Dealer Button**: Rotates each hand, determines who acts first
- **Blinds**: Forced bets to create action
  - Small Blind: Player with dealer button posts (e.g., 10 chips)
  - Big Blind: Other player posts (e.g., 20 chips)
- **Starting Stack**: Each player starts with equal chips (e.g., 1000 chips)

### Deck
- Standard 52-card deck
- No jokers
- Ranks: 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A (Ace is high, but can be low in A-2-3-4-5 straight)
- Suits: ♠ Spades, ♥ Hearts, ♦ Diamonds, ♣ Clubs (suits are equal, no suit ranks higher)

## Game Flow - Step by Step

### Phase 1: Pre-Flop (Dealing Hole Cards)

1. **Blinds Posted**
   ```
   Player 1 (Dealer/Small Blind): Posts 10 chips
   Player 2 (Big Blind): Posts 20 chips
   Pot: 30 chips
   ```

2. **Cards Dealt**
   - Each player receives 2 cards face-down (hole cards)
   - These cards are PRIVATE - only you can see them
   - Example:
     ```
     Player 1: [K♠ Q♠] (hidden from Player 2)
     Player 2: [7♥ 7♦] (hidden from Player 1)
     ```

3. **First Betting Round**
   - Small blind acts first (in heads-up)
   - Actions available:
     - **Fold**: Give up, lose any chips already in pot
     - **Call**: Match the big blind (Player 1 must add 10 more to make 20 total)
     - **Raise**: Increase the bet (minimum: 2x big blind = 40 chips)
   
   Example action:
   ```
   Player 1 (has K♠Q♠): Raises to 60 chips
   Player 2 (has 7♥7♦): Calls 60 chips (adds 40 more)
   Pot: 120 chips
   ```

### Phase 2: Flop (First 3 Community Cards)

1. **Burn and Deal**
   - Dealer burns (discards) top card face-down
   - Deals 3 cards face-up in the middle (the "flop")
   
   ```
   Community Cards: [K♦ 7♣ 2♠]
   
   Player 1's best hand so far: Pair of Kings (K♠ Q♠ + K♦)
   Player 2's best hand so far: Three of a Kind (7♥ 7♦ + 7♣) ← Better!
   ```

2. **Second Betting Round**
   - Big blind acts first now
   - Actions available:
     - **Check**: Pass action without betting (only if no bet to call)
     - **Bet**: Put chips in (minimum: big blind amount)
     - **Fold**: Give up
     - **Call**: Match a bet
     - **Raise**: Increase the bet
   
   Example action:
   ```
   Player 2 (has three 7s): Checks (doesn't want to reveal strength)
   Player 1 (has pair of Kings): Bets 80 chips
   Player 2: Calls 80 chips
   Pot: 280 chips
   ```

### Phase 3: Turn (4th Community Card)

1. **Burn and Deal**
   - Burn another card
   - Deal 1 card face-up (the "turn")
   
   ```
   Community Cards: [K♦ 7♣ 2♠] [Q♣]
   
   Player 1's hand: Two Pair - Kings and Queens (K♠ Q♠ + K♦ Q♣)
   Player 2's hand: Still Three of a Kind (7♥ 7♦ 7♣)
   ```

2. **Third Betting Round**
   - Same betting structure as flop
   
   Example action:
   ```
   Player 2: Checks
   Player 1: Bets 150 chips (thinks two pair is good)
   Player 2: Calls 150 chips (still has better hand)
   Pot: 580 chips
   ```

### Phase 4: River (5th and Final Community Card)

1. **Burn and Deal**
   - Burn another card
   - Deal 1 final card face-up (the "river")
   
   ```
   Community Cards: [K♦ 7♣ 2♠] [Q♣] [K♥]
   
   Player 1's hand: Full House - Kings over Queens (K♠ K♦ K♥ Q♠ Q♣) ← NOW BETTER!
   Player 2's hand: Full House - Sevens over Kings (7♥ 7♦ 7♣ K♦ K♥)
   ```

2. **Final Betting Round**
   - Last chance to bet
   
   Example action:
   ```
   Player 2: Checks (worried about that third King)
   Player 1: Bets 200 chips (knows Kings full is strong)
   Player 2: Calls 200 chips (must see)
   Pot: 980 chips
   ```

### Phase 5: Showdown (Revealing Hands)

1. **Players Reveal Cards**
   - Last aggressor shows first (Player 1 bet on river)
   - Other player can show or muck (fold without showing)
   
   ```
   Player 1 shows: K♠ Q♠ → Full House (K-K-K-Q-Q)
   Player 2 shows: 7♥ 7♦ → Full House (7-7-7-K-K)
   
   Player 1 WINS! (Kings full beats Sevens full)
   Player 1 takes pot: 980 chips
   ```

2. **New Hand Begins**
   - Dealer button rotates
   - Process repeats

## Betting Actions Explained

### Check ✓
- Only available when no bet is in front of you
- Pass action to next player
- You can still act if opponent bets after you check
```
Player 1: Check
Player 2: Check
→ Next card dealt
```

### Bet 💰
- First player to put chips in on a street
- Minimum: Usually 1 big blind
```
Player 1: Bet 40 chips
Player 2: Must call, raise, or fold
```

### Call 📞
- Match the current bet
```
Player 1: Bet 40 chips
Player 2: Call 40 chips (matches)
→ Action complete
```

### Raise 📈
- Increase the current bet
- Minimum raise: Must be at least the size of the previous bet/raise
```
Player 1: Bet 40 chips
Player 2: Raise to 120 chips (added 80 more)
Player 1: Must call 80, re-raise, or fold
```

### Fold 🗑️
- Give up your hand
- Lose all chips already invested in pot
```
Player 1: Bet 100 chips
Player 2: Fold (gives up, Player 1 wins pot)
```

### All-In 🎲
- Bet all remaining chips
- If opponent has more chips, they can call or fold
- Creates a "main pot" if stacks are unequal
```
Player 1: All-in for 500 chips
Player 2: Call 500 chips or Fold
```

## Hand Rankings (Highest to Lowest)

### 1. Royal Flush 👑
- A-K-Q-J-10 all same suit
- Example: A♠ K♠ Q♠ J♠ 10♠
- **Probability**: 0.000154% (1 in 649,740 hands)

### 2. Straight Flush 🌊
- Five consecutive cards, all same suit
- Example: 9♥ 8♥ 7♥ 6♥ 5♥
- **Probability**: 0.00139% (1 in 72,193 hands)

### 3. Four of a Kind 🎰
- Four cards of same rank
- Example: Q♠ Q♥ Q♦ Q♣ 3♠
- **Probability**: 0.0240% (1 in 4,165 hands)

### 4. Full House 🏠
- Three of a kind + pair
- Example: J♠ J♥ J♦ 4♠ 4♥
- **Probability**: 0.1441% (1 in 694 hands)

### 5. Flush 💎
- Five cards of same suit, not consecutive
- Example: K♦ J♦ 8♦ 5♦ 2♦
- **Probability**: 0.1965% (1 in 509 hands)

### 6. Straight ➡️
- Five consecutive cards, mixed suits
- Example: 8♠ 7♥ 6♦ 5♣ 4♠
- Note: A-2-3-4-5 is valid (wheel), A-K-Q-J-10 is highest
- **Probability**: 0.3925% (1 in 255 hands)

### 7. Three of a Kind 🎯
- Three cards of same rank
- Example: 7♠ 7♥ 7♦ A♠ K♣
- **Probability**: 2.1128% (1 in 47 hands)

### 8. Two Pair 👯
- Two different pairs
- Example: K♠ K♦ 9♥ 9♣ 5♠
- **Probability**: 4.7539% (1 in 21 hands)

### 9. One Pair 👫
- Two cards of same rank
- Example: A♠ A♦ K♠ 8♥ 3♣
- **Probability**: 42.2569% (1 in 2.4 hands)

### 10. High Card 🃏
- No made hand, highest card plays
- Example: A♠ K♦ 9♥ 6♣ 2♠
- **Probability**: 50.1177% (1 in 2 hands)

## Comparing Hands

### Same Hand Type
When two players have the same hand type, compare by rank:

**Example 1: Both have pairs**
```
Player 1: A♠ A♦ K♠ 8♥ 3♣ (Pair of Aces)
Player 2: K♠ K♦ Q♥ J♣ 9♠ (Pair of Kings)
Winner: Player 1 (Aces beat Kings)
```

**Example 2: Same pair, check kickers**
```
Player 1: A♠ A♦ K♠ 8♥ 3♣ (Pair of Aces, King kicker)
Player 2: A♥ A♣ Q♥ J♣ 9♠ (Pair of Aces, Queen kicker)
Winner: Player 1 (King kicker beats Queen kicker)
```

**Example 3: Exact tie**
```
Community: A♠ A♦ K♠ Q♥ J♣
Player 1: 2♠ 3♥
Player 2: 4♦ 5♣
Result: SPLIT POT (both play board: A-A-K-Q-J)
```

## Pot Calculation

### Simple Example
```
Starting pot (blinds): 30 chips
Pre-flop betting: +120 chips
Flop betting: +160 chips
Turn betting: +300 chips
River betting: +400 chips
Final pot: 1,010 chips
Winner takes all
```

### All-In with Unequal Stacks
```
Player 1 has: 300 chips
Player 2 has: 500 chips

Player 1: All-in 300 chips
Player 2: Call 300 chips

Main Pot: 600 chips (both players compete)
Player 2 gets 200 chips back (can't win more than they risked)
```

## Common Mistakes (Don't Do These!)

### ❌ Mistake 1: Counting 6 or 7 Cards
```
WRONG: "I have K♠ K♦ Q♥ Q♣ J♠ 10♠ 9♠" (7 cards)
RIGHT: Best 5 cards only: K♠ K♦ Q♥ Q♣ J♠ (Two pair, K-Q with J kicker)
```

### ❌ Mistake 2: Forgetting Community Cards
```
Your hole cards: 6♠ 7♠
Community: A♥ K♦ Q♣ J♠ 10♣
Your hand: Straight (A-K-Q-J-10) using only community
Not: "I only have 7 high" - you MUST use best 5 cards available!
```

### ❌ Mistake 3: Thinking Suits Matter for Straights/Pairs
```
Player 1: A♠ K♠ Q♠ J♠ 10♣ (straight, not flush)
Player 2: A♦ K♥ Q♦ J♥ 10♥ (straight, not flush)
Result: SPLIT POT (suits don't break ties unless it's a flush)
```

### ❌ Mistake 4: Betting Out of Turn
```
WRONG:
Player 1's turn → Player 2 bets before Player 1 acts
RIGHT:
Wait for action to come to you
```

## ZK Poker Specific Concepts

### Why ZK Matters for Poker

**Problem with Traditional Online Poker:**
```
Player 1: [A♠ K♠] ← Visible to server
Player 2: [Q♥ Q♦] ← Visible to server

Server knows everything:
- Who will likely win
- Optimal strategy for each player
- Can manipulate or leak information
```

**ZK Solution:**
```
Player 1: [commitment_hash_1] ← Server sees only hash
Player 2: [commitment_hash_2] ← Server sees only hash

Server knows nothing:
- Cards are hidden
- Players prove valid actions without revealing cards
- Winner proves they won without showing losing hand
```

### ZK Commitments in Each Phase

**Pre-Flop:**
```
Player 1 receives: [K♠ Q♠]
Commits: hash(K♠ + Q♠ + player1_secret) = 0x7a8d9f...
Stores on-chain: 0x7a8d9f...

Player 2 receives: [7♥ 7♦]
Commits: hash(7♥ + 7♦ + player2_secret) = 0x3b5e2c...
Stores on-chain: 0x3b5e2c...
```

**During Betting:**
```
Player 1 wants to raise:
Generates ZK proof: "I have cards that match commitment 0x7a8d9f..."
                     "This raise is a valid action"
                     "My cards are: [HIDDEN]"
Submits proof to contract ✓
```

**Showdown:**
```
Player 1 won with Full House:
Generates ZK proof: "My cards + community make Full House (rank 6)"
                     "This beats claimed rank 4 (Three of a Kind)"
                     "My actual cards are: [STILL HIDDEN]"
Contract verifies proof ✓
Player 1 wins pot (Player 2 never sees Player 1's cards!)

Player 2 lost:
Never reveals cards - stays completely private ✓
No one knows if they bluffed or had a real hand
```

## Game Theory Basics (Strategy Tips)

### Starting Hand Selection
**Premium Hands (Always play):**
- AA, KK, QQ, JJ (pairs)
- AK, AQ (suited or offsuit)

**Good Hands (Usually play):**
- 10-10, 9-9, 8-8 (medium pairs)
- AJ, AT, KQ, KJ (high cards)
- Suited connectors: J♠10♠, 9♥8♥

**Trash Hands (Usually fold):**
- 7-2 offsuit (worst hand in poker)
- Any two low unconnected cards: 9-3, 8-2, etc.

### Position Matters
```
Dealer Button (Small Blind in heads-up):
- Acts first pre-flop (disadvantage)
- Acts last on flop/turn/river (advantage)

Big Blind:
- Acts last pre-flop (advantage)
- Acts first on flop/turn/river (disadvantage)
```

### Pot Odds Example
```
Pot: 100 chips
Opponent bets: 50 chips
Total pot: 150 chips
You must call: 50 chips

Pot odds: 150:50 = 3:1

Question: Should you call with flush draw?
Flush draw: ~18% chance (roughly 4.5:1 against)
Answer: No, pot odds don't justify call (need ~25% or 3:1)
```

## Special Situations

### Chopping (Split Pot)
```
Board: A♠ K♠ Q♠ J♠ 10♠ (royal flush on board)
Player 1: 2♥ 3♦ → Plays board (royal flush)
Player 2: 7♠ 8♣ → Plays board (royal flush)
Result: SPLIT POT 50/50
```

### Counterfeiting
```
Player 1: A♠ 3♦ (pair of Aces with 3 kicker)
Player 2: A♥ 5♣ (pair of Aces with 5 kicker)
Board: A♦ 9♠ 2♥ → Player 2 winning (A-A-9-5-2 beats A-A-9-3-2)
River: 5♥ → Board: A♦ 9♠ 2♥ 5♥
Result: Player 1 WINS (A-A-9-5-3 beats A-A-9-5-2)
Player 2's 5 was "counterfeited" by board 5
```

### Running It Twice
```
(Optional rule, not in our MVP)
All-in situation, players agree to deal river twice
Pot split between two outcomes
Reduces variance
```

## Pseudo-Random Card Dealing (For Implementation)

### Fair Randomness
```
Method 1: Commit-Reveal Scheme
1. Each player submits random seed (commitment)
2. After both committed, reveal seeds
3. Combined seed = hash(seed1 + seed2)
4. Use combined seed to shuffle deck
→ Neither player can manipulate outcome

Method 2: VRF (Verifiable Random Function)
1. Use blockchain's randomness source
2. Combine with block hash
3. Proves randomness is fair
→ On-chain verifiable
```

### Card Shuffling Algorithm
```
Fisher-Yates Shuffle:
1. Start with ordered deck [0-51]
2. For i from 51 down to 1:
   - Pick random j from 0 to i
   - Swap deck[i] with deck[j]
3. Result: Fairly shuffled deck
```

## Implementation Checklist

### Core Rules to Implement
- [ ] Deck shuffling (provably fair)
- [ ] Card dealing (2 hole cards each)
- [ ] Blind posting
- [ ] Betting rounds (4 total)
- [ ] Community card dealing (flop, turn, river)
- [ ] Hand evaluation
- [ ] Winner determination
- [ ] Pot calculation

### ZK Components
- [ ] Card commitment scheme
- [ ] Valid action proof circuit
- [ ] Hand strength proof circuit
- [ ] Showdown verification

### Edge Cases
- [ ] All-in scenarios
- [ ] Disconnection handling
- [ ] Time limits per action
- [ ] Invalid bet amounts
- [ ] Split pots

## Quick Reference Table

| Phase | Cards Visible | Betting | Example Pot |
|-------|---------------|---------|-------------|
| Blinds | None | Forced | 30 |
| Pre-Flop | 0 community | 1st round | 120 |
| Flop | 3 community | 2nd round | 280 |
| Turn | 4 community | 3rd round | 580 |
| River | 5 community | 4th round | 980 |
| Showdown | Reveal | Winner | 0 (paid out) |

## Minimum Viable Poker (MVP Scope)

For hackathon, implement:
✅ Heads-up (2 player) only
✅ Fixed blind structure (10/20)
✅ No limit betting (but simplified)
✅ Standard hand rankings
✅ ZK commitments for hole cards
✅ ZK proof on showdown only

Can skip:
❌ 3+ player support
❌ Side pots
❌ Tournament structures
❌ Complex betting limits
❌ Chat/emotes
❌ Hand history replay

---

**Remember**: The goal is to prove ZK works for hidden information games. 
Keep the poker simple, make the ZK implementation solid! 🃏🔐
