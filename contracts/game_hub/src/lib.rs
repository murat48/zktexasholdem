#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, BytesN, Map};

#[derive(Clone)]
#[contracttype]
pub struct Game {
    pub game_id: BytesN<32>,
    pub player1: Address,
    pub player2: Address,
    pub started_at: u64,
    pub ended_at: u64,
    pub winner: Option<Address>,
    pub is_active: bool,
}

const GAMES: &str = "GAMES";

#[contract]
pub struct GameHubContract;

#[contractimpl]
impl GameHubContract {
    /// Start a new game
    pub fn start_game(
        env: Env,
        player1: Address,
        player2: Address,
    ) -> BytesN<32> {
        player1.require_auth();
        
        // Generate game ID from players and timestamp
        let ledger = env.ledger();
        let timestamp = ledger.timestamp();
        
        let mut game_id_data = [0u8; 32];
        game_id_data[0..8].copy_from_slice(&timestamp.to_be_bytes());
        let game_id = BytesN::from_array(&env, &game_id_data);
        
        let game = Game {
            game_id: game_id.clone(),
            player1: player1.clone(),
            player2: player2.clone(),
            started_at: timestamp,
            ended_at: 0,
            winner: None,
            is_active: true,
        };
        
        let mut games: Map<BytesN<32>, Game> = env
            .storage()
            .persistent()
            .get(&GAMES)
            .unwrap_or(Map::new(&env));
        
        games.set(game_id.clone(), game);
        env.storage().persistent().set(&GAMES, &games);
        
        game_id
    }
    
    /// End a game and record winner
    pub fn end_game(
        env: Env,
        game_id: BytesN<32>,
        winner: Address,
    ) {
        winner.require_auth();
        
        let mut games: Map<BytesN<32>, Game> = env
            .storage()
            .persistent()
            .get(&GAMES)
            .unwrap();
        
        let mut game = games.get(game_id.clone()).unwrap();
        
        // Verify winner is one of the players
        assert!(
            game.player1 == winner || game.player2 == winner,
            "Winner must be a player in the game"
        );
        
        let ledger = env.ledger();
        game.ended_at = ledger.timestamp();
        game.winner = Some(winner);
        game.is_active = false;
        
        games.set(game_id, game);
        env.storage().persistent().set(&GAMES, &games);
    }
    
    /// Get game information
    pub fn get_game(env: Env, game_id: BytesN<32>) -> Game {
        let games: Map<BytesN<32>, Game> = env
            .storage()
            .persistent()
            .get(&GAMES)
            .unwrap();
        
        games.get(game_id).unwrap()
    }
}
