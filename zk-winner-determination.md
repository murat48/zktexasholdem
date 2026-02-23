# ZK Poker - Kazanan Belirleme (Kısa Versiyon)

## 🎯 En Basit Çözüm (MVP için ÖNERILEN)

### Yaklaşım: Her İki Oyuncu da El Gücünü Kanıtlar

```
1. Her oyuncu ZK proof üretir: "Benim elim X gücünde"
2. İki proof da contract'a gönderilir
3. Contract sadece SAYILARI karşılaştırır (kartları görmeden)
4. Yüksek sayı kazanır
```

## 🔢 El Güçleri (0-9 arası sayı)

```typescript
enum HandRank {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9
}
```

## 📝 Örnek Akış

```typescript
// SHOWDOWN

// Player 1 (kartları: K♠ K♦)
proof1 = generateProof({
  holeCards: [K♠, K♦],           // GİZLİ
  community: [K♥, Q♣, J♦, 9♠, 2♥], // AÇIK
  claimedRank: 7                  // AÇIK (Three of a Kind)
});

// Player 2 (kartları: 7♥ 7♣)  
proof2 = generateProof({
  holeCards: [7♥, 7♣],           // GİZLİ
  community: [K♥, Q♣, J♦, 9♠, 2♥], // AÇIK
  claimedRank: 1                  // AÇIK (One Pair)
});

// Contract
if (verifyProof(proof1) && verifyProof(proof2)) {
  if (claimedRank1 > claimedRank2) {
    winner = player1; // 7 > 1, Player 1 kazandı
  }
}
```

## 🔐 Noir Circuit (Basitleştirilmiş)

```noir
fn main(
    hole_cards: [u8; 2],          // Private (GİZLİ)
    card_commitment: pub Field,    // Public (önceden commit edilmiş)
    community_cards: pub [u8; 5],  // Public (herkes görüyor)
    claimed_rank: pub u8           // Public (0-9)
) {
    // 1. Kartlar gerçek mi kontrol et
    assert(poseidon2_hash(hole_cards) == card_commitment);
    
    // 2. El gücünü hesapla
    let actual_rank = calculate_poker_rank(hole_cards, community_cards);
    
    // 3. İddia edilen güç doğru mu?
    assert(actual_rank == claimed_rank);
}

fn calculate_poker_rank(hole: [u8; 2], community: [u8; 5]) -> u8 {
    let all_cards = combine_cards(hole, community);
    
    if (is_royal_flush(all_cards)) { return 9; }
    if (is_straight_flush(all_cards)) { return 8; }
    if (is_four_of_kind(all_cards)) { return 7; }
    if (is_full_house(all_cards)) { return 6; }
    if (is_flush(all_cards)) { return 5; }
    if (is_straight(all_cards)) { return 4; }
    if (is_three_of_kind(all_cards)) { return 3; }
    if (is_two_pair(all_cards)) { return 2; }
    if (is_pair(all_cards)) { return 1; }
    return 0; // High card
}
```

## ⚖️ Eşitlik Durumu (Tie)

### Basit Çözüm (MVP):
```typescript
if (rank1 == rank2) {
  // Split pot (pot ikiye bölünür)
  payoutPlayer1(pot / 2);
  payoutPlayer2(pot / 2);
}
```

### Gelişmiş Çözüm (Bonus):
```typescript
// Kicker kartları da proof'a ekle
proof = generateProof({
  claimedRank: 1,           // Pair
  claimedKicker1: 14,       // Ace (en yüksek kicker)
  claimedKicker2: 13,       // King
  claimedKicker3: 12        // Queen
});

// Contract kicker'ları karşılaştırır
if (rank1 == rank2) {
  if (kicker1_1 > kicker2_1) winner = player1;
  else if (kicker1_1 < kicker2_1) winner = player2;
  else if (kicker1_2 > kicker2_2) winner = player1;
  // ...
}
```

## 🚨 Kritik Güvenlik: Hile Önleme

### Saldırı: Oyuncu yalan söylerse?

```typescript
// Saldırı senaryosu
Player 1: "Benim elim Full House (rank=6)"
Gerçek: Sadece One Pair var (rank=1)

// Proof generation başarısız olur!
proof = generateProof({
  holeCards: [2♠, 3♦],      // Gerçek kartları
  claimedRank: 6             // Yalan iddia
});

// Circuit içinde:
actual_rank = calculate_poker_rank([2♠, 3♦], community); // = 0 (high card)
assert(actual_rank == claimed_rank); // 0 != 6 → ❌ FAIL!

// ZK proof oluşturulamaz, contract'a gönderilemez
// Oyuncu otomatik kaybeder veya zaman aşımı
```

## 📊 Smart Contract (Soroban)

```rust
pub fn resolve_showdown(
    env: Env,
    game_id: u64,
    player1_proof: BytesN<128>,
    player1_rank: u8,
    player2_proof: BytesN<128>,
    player2_rank: u8
) -> Address {
    
    // 1. Her iki proof'u doğrula
    assert!(verify_zk_proof(&env, player1_proof));
    assert!(verify_zk_proof(&env, player2_proof));
    
    // 2. Rankları karşılaştır
    let winner = if player1_rank > player2_rank {
        get_player1(game_id)
    } else if player2_rank > player1_rank {
        get_player2(game_id)
    } else {
        // Tie - split pot (MVP'de basit çözüm)
        return split_pot(game_id);
    };
    
    // 3. Pot'u kazanana ver
    transfer_pot(&env, game_id, winner);
    
    // 4. Game Hub'a bildir
    call_game_hub_end_game(&env, game_id, winner);
    
    winner
}
```

## 🎭 Alternatif: Sadece Kazanan Kanıtlar (Daha Özel)

```typescript
// Player 1 kazandığını düşünüyor
proof1 = generateWinProof({
  myCards: [K♠, K♦],
  opponentRank: 1,        // "Rakip en fazla pair yapabilir"
  myRank: 7               // "Ben three of a kind yaptım"
});

// Contract
if (verifyWinProof(proof1)) {
  winner = player1;
  // Player 2'nin kartları hiç açılmadı! 🎉
}
```

**Avantaj:** Kaybeden oyuncunun kartları TAM GİZLİ kalır
**Dezavantaj:** Circuit daha karmaşık (MVP için gerek yok)

## ✅ Özet: MVP için En İyi Yol

```
1. Her oyuncu kendi el gücünü kanıtlar (0-9 sayı)
2. İki proof contract'a gönderilir  
3. Contract sayıları karşılaştırır
4. Büyük sayı kazanır
5. Eşitse pot split

Sonuç:
- Hiçbir kart açılmaz ✓
- Hile imkansız (ZK proof başarısız olur) ✓
- Implementation basit ✓
- Jüri için anlaşılır ✓
```

## 🔨 Implementation Adımları

```bash
# 1. Noir circuit yaz
circuits/hand_rank_proof.nr

# 2. Test et (local)
nargo test

# 3. Soroban contract'a proof verifier ekle
contracts/poker_game/src/lib.rs

# 4. Frontend'de proof generation
frontend/lib/zk-proof.ts

# 5. End-to-end test
npm run test:e2e
```

---

**ÖNEMLİ:** MVP'de kicker comparison atlanabilir, sadece split pot yapın.
Hackathon sonrası geliştirilir! 🚀
