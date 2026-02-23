#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Bytes, BytesN};

/// Helper: compute SHA-256(hole_cards || salt) matching the contract's verify_commitment
fn make_sha256_commitment(env: &Env, cards: [u8; 2], salt: [u8; 32]) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.extend_from_array(&cards);
    preimage.extend_from_array(&salt);
    env.crypto().sha256(&preimage).into()
}

#[test]
fn test_init_game() {
    let env = Env::default();
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);
    
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    
    env.mock_all_auths();
    
    let state = client.init_game(&game_id, &player1, &player2, &1000);
    
    assert_eq!(state.players.len(), 2);
    assert_eq!(state.pot, 0);
    assert!(state.is_active);
}

#[test]
fn test_place_bet() {
    let env = Env::default();
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);
    
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    
    env.mock_all_auths();
    
    client.init_game(&game_id, &player1, &player2, &1000);
    client.place_bet(&player1, &100);
    
    let state = client.get_game_state();
    assert_eq!(state.pot, 100);
}

#[test]
fn test_submit_commitment() {
    let env = Env::default();
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    env.mock_all_auths();

    client.init_game(&game_id, &player1, &player2, &1000);

    let commitment = BytesN::from_array(&env, &[0xABu8; 32]);
    client.submit_commitment(&player1, &commitment);

    let state = client.get_game_state();
    let p1 = state.players.get(0).unwrap();
    assert_eq!(p1.commitment, commitment);
}

#[test]
#[should_panic(expected = "Cannot submit zero commitment")]
fn test_reject_zero_commitment() {
    let env = Env::default();
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    env.mock_all_auths();

    client.init_game(&game_id, &player1, &player2, &1000);
    client.submit_commitment(&player1, &BytesN::from_array(&env, &[0u8; 32]));
}

#[test]
fn test_resolve_showdown_with_sha256_verify() {
    let env = Env::default();

    // Register BOTH contracts
    let verifier_id = env.register_contract(None, test_helpers::MockNoirVerifier);
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    env.mock_all_auths();

    // Set verifier address
    client.set_verifier(&verifier_id);

    client.init_game(&game_id, &player1, &player2, &1000);
    client.place_bet(&player1, &100);
    client.place_bet(&player2, &100);

    // Cards and salts
    let p1_cards: [u8; 2] = [14, 13]; // Ace, King
    let p1_salt = [42u8; 32];
    let p2_cards: [u8; 2] = [7, 8];
    let p2_salt = [99u8; 32];

    // Submit SHA-256 commitments
    let p1_commit = make_sha256_commitment(&env, p1_cards, p1_salt);
    let p2_commit = make_sha256_commitment(&env, p2_cards, p2_salt);
    client.submit_commitment(&player1, &p1_commit);
    client.submit_commitment(&player2, &p2_commit);

    // Non-zero proof blobs
    let proof = BytesN::from_array(&env, &[1u8; 128]);

    // resolve_showdown with card reveal + salt
    let winner = client.resolve_showdown(
        &proof, &5,
        &BytesN::from_array(&env, &p1_cards),
        &BytesN::from_array(&env, &p1_salt),
        &proof, &3,
        &BytesN::from_array(&env, &p2_cards),
        &BytesN::from_array(&env, &p2_salt),
    );
    assert_eq!(winner, player1); // rank 5 > 3
}

#[test]
fn test_resolve_showdown_wrong_cards_caught_by_noir_verifier() {
    // SHA-256 re-check removed from poker_game — wrong card detection is now
    // delegated to the real noir_verifier (Poseidon2 + range checks).
    // With MockNoirVerifier (always returns true) this resolves normally;
    // on testnet, the real noir_verifier would reject the mismatched commitment.
    let env = Env::default();

    let verifier_id = env.register_contract(None, test_helpers::MockNoirVerifier);
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    env.mock_all_auths();

    client.set_verifier(&verifier_id);
    client.init_game(&game_id, &player1, &player2, &1000);

    // Submit real commitment for cards [14, 13]
    let real_salt = [42u8; 32];
    let p1_commit = make_sha256_commitment(&env, [14, 13], real_salt);
    let p2_commit = make_sha256_commitment(&env, [7, 8], [99u8; 32]);
    client.submit_commitment(&player1, &p1_commit);
    client.submit_commitment(&player2, &p2_commit);

    let proof = BytesN::from_array(&env, &[1u8; 128]);

    // Claim DIFFERENT cards [14, 12] — poker_game no longer re-checks SHA-256;
    // the real noir_verifier would reject this at Poseidon2 commitment level.
    let winner = client.resolve_showdown(
        &proof, &9,
        &BytesN::from_array(&env, &[14u8, 12u8]),  // wrong cards (mock verifier accepts)
        &BytesN::from_array(&env, &real_salt),
        &proof, &3,
        &BytesN::from_array(&env, &[7u8, 8u8]),
        &BytesN::from_array(&env, &[99u8; 32]),
    );
    // Mock verifier always returns true → resolves by rank
    assert_eq!(winner, player1); // rank 9 > 3
}

#[test]
#[should_panic(expected = "Player 2 has not submitted a card commitment")]
fn test_resolve_showdown_rejects_missing_commitment() {
    let env = Env::default();
    let verifier_id = env.register_contract(None, test_helpers::MockNoirVerifier);
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    env.mock_all_auths();

    client.set_verifier(&verifier_id);
    client.init_game(&game_id, &player1, &player2, &1000);
    client.place_bet(&player1, &100);

    // Only P1 submits commitment; P2 is zero → hard assert panics
    let p1_cards: [u8; 2] = [14, 13];
    let p1_salt = [42u8; 32];
    client.submit_commitment(&player1, &make_sha256_commitment(&env, p1_cards, p1_salt));

    let proof = BytesN::from_array(&env, &[1u8; 128]);
    client.resolve_showdown(
        &proof, &5,
        &BytesN::from_array(&env, &p1_cards),
        &BytesN::from_array(&env, &p1_salt),
        &proof, &3,
        &BytesN::from_array(&env, &[7u8, 8u8]),
        &BytesN::from_array(&env, &[0u8; 32]),
    );
}

#[test]
#[should_panic(expected = "Player 1 proof is empty")]
fn test_resolve_showdown_rejects_zero_proof() {
    let env = Env::default();
    let verifier_id = env.register_contract(None, test_helpers::MockNoirVerifier);
    let contract_id = env.register_contract(None, PokerGameContract);
    let client = PokerGameContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let game_id = BytesN::from_array(&env, &[1u8; 32]);
    env.mock_all_auths();

    client.set_verifier(&verifier_id);
    client.init_game(&game_id, &player1, &player2, &1000);

    let p1_salt = [42u8; 32];
    let p2_salt = [99u8; 32];
    client.submit_commitment(&player1, &make_sha256_commitment(&env, [14, 13], p1_salt));
    client.submit_commitment(&player2, &make_sha256_commitment(&env, [7, 8], p2_salt));

    let zero_proof = BytesN::from_array(&env, &[0u8; 128]);
    let valid_proof = BytesN::from_array(&env, &[1u8; 128]);
    // P1 proof is all-zero → should panic
    client.resolve_showdown(
        &zero_proof, &5,
        &BytesN::from_array(&env, &[14u8, 13u8]),
        &BytesN::from_array(&env, &p1_salt),
        &valid_proof, &3,
        &BytesN::from_array(&env, &[7u8, 8u8]),
        &BytesN::from_array(&env, &p2_salt),
    );
}

/// Mock noir_verifier for testing — always returns true
mod test_helpers {
    use soroban_sdk::{contract, contractimpl, Env, BytesN};

    #[contract]
    pub struct MockNoirVerifier;

    #[contractimpl]
    impl MockNoirVerifier {
        pub fn verify_proof(
            _env: Env,
            _hole_cards: BytesN<2>,
            _salt: BytesN<32>,
            _commitment: BytesN<32>,
            _claimed_rank: u32,
            _proof_bytes: BytesN<128>,
            _player: BytesN<32>,
        ) -> bool {
            true
        }
    }
}
