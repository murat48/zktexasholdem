// Hand Rank Proof Circuit - MVP Version
// Proves that a player has a specific hand rank (0-9) without revealing their hole cards
// Following zk-winner-determination.md specification

use dep::std;

fn main(
    // Private inputs - never revealed on-chain
    hole_cards: [u8; 2],
    salt: Field,
    
    // Public inputs - visible on-chain
    card_commitment: pub Field,
    community_cards: pub [u8; 5],
    claimed_rank: pub u8,
) {
    // 1. Verify that the hole cards match the previously committed hash
    let hash_input: [Field; 3] = [
        hole_cards[0] as Field,
        hole_cards[1] as Field,
        salt
    ];
    
    let computed_hash = std::hash::poseidon2::Poseidon2::hash(hash_input, 3);
    assert(computed_hash == card_commitment, "Card commitment verification failed");
    
    // 2. Verify cards are valid (0-51 range, 52 cards in deck)
    assert(hole_cards[0] < 52, "Invalid hole card 1");
    assert(hole_cards[1] < 52, "Invalid hole card 2");
    assert(hole_cards[0] != hole_cards[1], "Duplicate hole cards");
    
    // 3. Calculate actual poker hand rank from 7 cards (2 hole + 5 community)
    let actual_rank = calculate_poker_rank(hole_cards, community_cards);
    
    // 4. Verify that claimed rank matches actual rank
    // This prevents cheating - if player claims higher rank, proof generation fails
    assert(actual_rank == claimed_rank, "Claimed rank does not match actual rank");
}

// Calculate poker hand rank (0-9)
// 0=High Card, 1=Pair, 2=Two Pair, 3=Three of Kind, 4=Straight,
// 5=Flush, 6=Full House, 7=Four of Kind, 8=Straight Flush, 9=Royal Flush
fn calculate_poker_rank(hole: [u8; 2], community: [u8; 5]) -> u8 {
    // Combine all 7 cards
    let mut all_cards: [u8; 7] = [0; 7];
    all_cards[0] = hole[0];
    all_cards[1] = hole[1];
    all_cards[2] = community[0];
    all_cards[3] = community[1];
    all_cards[4] = community[2];
    all_cards[5] = community[3];
    all_cards[6] = community[4];
    
    // Extract ranks (0-12 for 2-A) and suits (0-3)
    let mut ranks: [u8; 7] = [0; 7];
    let mut suits: [u8; 7] = [0; 7];
    
    for i in 0..7 {
        ranks[i] = all_cards[i] % 13;  // Card rank
        suits[i] = all_cards[i] / 13;  // Card suit
    }
    
    // Count frequency of each rank
    let mut rank_counts: [u8; 13] = [0; 13];
    for i in 0..7 {
        rank_counts[ranks[i] as Field] += 1;
    }
    
    // Count frequency of each suit
    let mut suit_counts: [u8; 4] = [0; 4];
    for i in 0..7 {
        suit_counts[suits[i] as Field] += 1;
    }
    
    // Check for flush (5+ cards of same suit)
    let mut is_flush = false;
    let mut flush_suit: u8 = 0;
    for i in 0..4 {
        if suit_counts[i] >= 5 {
            is_flush = true;
            flush_suit = i as u8;
        }
    }
    
    // Get cards of flush suit if flush exists
    let mut flush_ranks: [u8; 7] = [0; 7];
    let mut flush_count: u8 = 0;
    if is_flush {
        for i in 0..7 {
            if suits[i] == flush_suit {
                flush_ranks[flush_count as Field] = ranks[i];
                flush_count += 1;
            }
        }
    }
    
    // Check for straight in all cards
    let is_straight = check_straight(ranks);
    
    // Check for straight in flush cards
    let mut is_straight_flush = false;
    if is_flush {
        is_straight_flush = check_straight(flush_ranks);
    }
    
    // Check for royal flush (A-K-Q-J-10 of same suit)
    let mut is_royal_flush = false;
    if is_straight_flush {
        is_royal_flush = check_royal(flush_ranks);
    }
    
    // Analyze rank patterns
    let mut has_four = false;
    let mut has_three = false;
    let mut has_pair = false;
    let mut pair_count = 0;
    
    for i in 0..13 {
        if rank_counts[i] == 4 {
            has_four = true;
        } else if rank_counts[i] == 3 {
            has_three = true;
        } else if rank_counts[i] == 2 {
            has_pair = true;
            pair_count += 1;
        }
    }
    
    // Determine hand rank (highest to lowest)
    if is_royal_flush {
        9  // Royal Flush
    } else if is_straight_flush {
        8  // Straight Flush
    } else if has_four {
        7  // Four of a Kind
    } else if has_three && has_pair {
        6  // Full House
    } else if is_flush {
        5  // Flush
    } else if is_straight {
        4  // Straight
    } else if has_three {
        3  // Three of a Kind
    } else if pair_count >= 2 {
        2  // Two Pair
    } else if has_pair {
        1  // One Pair
    } else {
        0  // High Card
    }
}

// Check if cards contain a straight
fn check_straight(ranks: [u8; 7]) -> bool {
    let mut rank_set: [bool; 13] = [false; 13];
    
    // Mark which ranks are present
    for i in 0..7 {
        if ranks[i] < 13 {
            rank_set[ranks[i] as Field] = true;
        }
    }
    
    // Check for 5 consecutive ranks
    for start in 0..9 {  // Can start at 0-8 for regular straights
        let mut consecutive = 0;
        for offset in 0..5 {
            if rank_set[start + offset] {
                consecutive += 1;
            }
        }
        if consecutive == 5 {
            return true;
        }
    }
    
    // Check for wheel (A-2-3-4-5)
    if rank_set[12] && rank_set[0] && rank_set[1] && rank_set[2] && rank_set[3] {
        return true;
    }
    
    false
}

// Check if straight flush is royal (10-J-Q-K-A)
fn check_royal(flush_ranks: [u8; 7]) -> bool {
    let mut has_10 = false;
    let mut has_jack = false;
    let mut has_queen = false;
    let mut has_king = false;
    let mut has_ace = false;
    
    for i in 0..7 {
        if flush_ranks[i] == 8 { has_10 = true; }      // 10 = rank 8
        if flush_ranks[i] == 9 { has_jack = true; }    // J = rank 9
        if flush_ranks[i] == 10 { has_queen = true; }  // Q = rank 10
        if flush_ranks[i] == 11 { has_king = true; }   // K = rank 11
        if flush_ranks[i] == 12 { has_ace = true; }    // A = rank 12
    }
    
    has_10 && has_jack && has_queen && has_king && has_ace
}
