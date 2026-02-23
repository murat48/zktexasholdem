// Card Commitment Circuit
// Generates a commitment to player's hole cards without revealing them

use dep::std;

fn main(
    // Private inputs (never revealed on-chain)
    hole_cards: [u8; 2],
    salt: Field,
    
    // Public outputs
    commitment: pub Field,
) {
    // Hash the hole cards with salt using Poseidon2
    let hash_input: [Field; 3] = [
        hole_cards[0] as Field,
        hole_cards[1] as Field,
        salt
    ];
    
    let computed_commitment = std::hash::poseidon2::Poseidon2::hash(hash_input, 3);
    
    // Verify the commitment matches
    assert(computed_commitment == commitment);
}
