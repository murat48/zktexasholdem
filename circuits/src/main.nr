// ============================================================================
// Texas Hold'em ZK Proof Circuit  --  Poseidon2 Commit-Reveal
// Compatible with Noir 1.0.0-beta.18 + Barretenberg bb 3.x
//
//   Phase 1 - COMMIT:  Before any community cards are dealt the player
//       publishes  commitment = Poseidon2(card0, card1, salt)  on-chain.
//       This binds the player to their hole cards without revealing them.
//   Phase 2 - PROVE:   At showdown the player generates this ZK proof.
//       The circuit verifies:
//         a) The Poseidon2 hash of the private (card0, card1, salt) matches
//            the public card_commitment that was stored on-chain.
//         b) All seven cards are valid (range 0-51, no duplicates).
//         c) The claimed hand rank equals the actual evaluated rank.
//
// Commit scheme:  Poseidon2 sponge over BN254 scalar field.
//   state = [card0 as Field, card1 as Field, salt, 0]
//   commitment = poseidon2_permutation(state, 4)[0]
//
// Card encoding: card = suit*13 + rank  (suit 0-3, rank 0-12, Ace=12, Two=0)
// Hand ranks: 0=High Card 1=Pair 2=Two Pair 3=Trips 4=Straight
//             5=Flush 6=Full House 7=Quads 8=Straight Flush 9=Royal Flush
// ============================================================================

// -----------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------
fn main(
    // Private witnesses (hidden from verifier)
    hole_cards: [u8; 2],          // Player's 2 hole cards encoded 0-51
    salt: Field,                  // Random nonce used in Poseidon2 commitment

    // Public inputs (visible to verifier / stored on-chain)
    card_commitment: pub Field,   // Poseidon2(card0, card1, salt) published pre-flop
    community_cards: pub [u8; 5], // Board cards (flop+turn+river), encoded 0-51
    claimed_rank: pub u8          // Best-hand rank the player claims (0-9)
) {
    // =================================================================
    // 1. Poseidon2 commitment verification
    //    Ensures the player is proving about the SAME cards they
    //    committed to before the community cards were dealt.
    // =================================================================
    let hash_state: [Field; 4] = [
        hole_cards[0] as Field,
        hole_cards[1] as Field,
        salt,
        0                          // padding to fill 4-element state
    ];
    let permuted = std::hash::poseidon2_permutation(hash_state, 4);
    assert(permuted[0] == card_commitment, "Poseidon2 card commitment mismatch");

    // =================================================================
    // 2. Range checks -- all cards must be in [0, 51]
    // =================================================================
    assert(hole_cards[0] <= 51);
    assert(hole_cards[1] <= 51);
    for i in 0..5 {
        assert(community_cards[i] <= 51);
    }

    // =================================================================
    // 3. Duplicate checks
    //    Hole cards must differ from each other and from every board card.
    // =================================================================
    assert(hole_cards[0] != hole_cards[1]);
    for i in 0..5 {
        assert(hole_cards[0] != community_cards[i]);
        assert(hole_cards[1] != community_cards[i]);
    }
    // All 10 board-card pairs must be distinct.
    assert(community_cards[0] != community_cards[1]);
    assert(community_cards[0] != community_cards[2]);
    assert(community_cards[0] != community_cards[3]);
    assert(community_cards[0] != community_cards[4]);
    assert(community_cards[1] != community_cards[2]);
    assert(community_cards[1] != community_cards[3]);
    assert(community_cards[1] != community_cards[4]);
    assert(community_cards[2] != community_cards[3]);
    assert(community_cards[2] != community_cards[4]);
    assert(community_cards[3] != community_cards[4]);

    // =================================================================
    // 4. Hand rank evaluation and claim verification
    // =================================================================
    let all_cards: [u8; 7] = [
        hole_cards[0], hole_cards[1],
        community_cards[0], community_cards[1], community_cards[2],
        community_cards[3], community_cards[4]
    ];
    let actual_rank = calculate_hand_rank(all_cards);
    assert(actual_rank == claimed_rank, "Claimed rank does not match actual hand rank");
}

// -----------------------------------------------------------------------
// calculate_hand_rank
//
// Evaluates the best 5-card hand achievable from all 7 cards.
//
// Strategy:
//   1. Build rank-frequency and suit-frequency arrays.
//   2. Identify the flush suit (at most one suit can hold >= 5 cards).
//   3. Build a rank-frequency array restricted to flush-suit cards.
//   4. Check straight over ALL cards; check straight-flush over flush-suit
//      cards ONLY.  This is the key correctness fix: the original code used
//      has_straight & has_flush which fires when you hold a flush in hearts
//      and a straight that borrows a spade -- that is NOT a straight flush.
//
// Returns 0-9 representing the best hand category.
// -----------------------------------------------------------------------
fn calculate_hand_rank(cards: [u8; 7]) -> u8 {
    // Decompose each card: rank = card % 13 (0=Two .. 12=Ace), suit = card / 13
    let mut ranks: [u8; 7] = [0; 7];
    let mut suits: [u8; 7] = [0; 7];
    for i in 0..7 {
        ranks[i] = cards[i] % 13;
        suits[i] = cards[i] / 13;
    }

    // Frequency tables
    let mut rank_counts: [u8; 13] = [0; 13];
    let mut suit_counts: [u8; 4]  = [0; 4];
    for i in 0..7 {
        rank_counts[ranks[i] as u32] += 1;
        suit_counts[suits[i] as u32] += 1;
    }

    // Flush detection: flush_suit = 255 means no flush.
    let mut flush_suit: u8 = 255;
    for s in 0..4 {
        if suit_counts[s] >= 5 {
            flush_suit = s as u8;
        }
    }
    let has_flush = flush_suit != 255;

    // Rank counts restricted to the flush suit (all zero when no flush).
    let mut flush_rank_counts: [u8; 13] = [0; 13];
    for i in 0..7 {
        if suits[i] == flush_suit {
            flush_rank_counts[ranks[i] as u32] += 1;
        }
    }

    // Straight detection over all 7 cards (any suit mix).
    let has_straight = check_straight(rank_counts);
    // Straight flush: straight formed ONLY by cards of the flush suit.
    let has_straight_flush = has_flush & check_straight(flush_rank_counts);
    // Royal flush: the suit-restricted straight flush uses T-J-Q-K-A.
    let has_royal_flush = has_straight_flush & check_royal(flush_rank_counts);

    // Pair / trips / quads analysis.
    let mut max_count: u8    = 0;
    let mut second_count: u8 = 0;
    for i in 0..13 {
        if rank_counts[i] > max_count {
            second_count = max_count;
            max_count    = rank_counts[i];
        } else if rank_counts[i] > second_count {
            second_count = rank_counts[i];
        }
    }

    // Hand ranking -- ascending priority so each line overwrites weaker hands.
    let mut rank: u8 = 0; // High card (default)

    // One pair
    if (max_count == 2) & (second_count < 2) { rank = 1; }

    // Two pair (including three-pair boards: best two pairs are played)
    if (max_count == 2) & (second_count == 2) { rank = 2; }

    // Three of a kind (no pair alongside)
    if (max_count == 3) & (second_count < 2) { rank = 3; }

    // Straight (any suits; not a straight flush)
    if has_straight & !has_straight_flush { rank = 4; }

    // Flush (not a straight flush)
    if has_flush & !has_straight_flush { rank = 5; }

    // Full house (trips + at least one pair)
    if (max_count == 3) & (second_count >= 2) { rank = 6; }

    // Four of a kind
    if max_count == 4 { rank = 7; }

    // Straight flush (suit-aware)
    if has_straight_flush & !has_royal_flush { rank = 8; }

    // Royal flush (T-J-Q-K-A of the flush suit)
    if has_royal_flush { rank = 9; }

    rank
}

// -----------------------------------------------------------------------
// check_straight
// -----------------------------------------------------------------------
fn check_straight(rank_counts: [u8; 13]) -> bool {
    let mut consecutive: u8 = 0;
    let mut result: bool    = false;

    for i in 0..13 {
        if rank_counts[i] > 0 {
            consecutive += 1;
            if consecutive >= 5 { result = true; }
        } else {
            consecutive = 0;
        }
    }

    // Wheel: A(12)-2(0)-3(1)-4(2)-5(3)
    let has_wheel = (rank_counts[12] > 0) &
                    (rank_counts[0]  > 0) &
                    (rank_counts[1]  > 0) &
                    (rank_counts[2]  > 0) &
                    (rank_counts[3]  > 0);

    result | has_wheel
}

// -----------------------------------------------------------------------
// check_royal
// -----------------------------------------------------------------------
fn check_royal(rank_counts: [u8; 13]) -> bool {
    (rank_counts[8]  > 0) &  // Ten
    (rank_counts[9]  > 0) &  // Jack
    (rank_counts[10] > 0) &  // Queen
    (rank_counts[11] > 0) &  // King
    (rank_counts[12] > 0)    // Ace
}
