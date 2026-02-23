# ⚡ Hızlı Başlangıç Rehberi

## 🚀 Projeyi Başlatma

### 1. Geliştirme Sunucusunu Başlat

```bash
cd frontend
pnpm dev
```

Tarayıcınızda `http://localhost:3000` adresini açın.

---

## 🛠️ Geliştirme Komutları

### Frontend

```bash
cd frontend

pnpm dev          # Geliştirme sunucusu
pnpm build        # Production build
pnpm start        # Production sunucu
pnpm lint         # ESLint kontrolü
pnpm test         # Testleri çalıştır
```

### Smart Contracts (Soroban)

```bash
cd contracts

# Kontratları derle
cargo build --target wasm32-unknown-unknown --release

# Testleri çalıştır
cargo test

# Stellar CLI ile derle
stellar contract build

# Testnet'e deploy et
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/poker_game.wasm \
  --source ACCOUNT_NAME \
  --network testnet
```

### ZK Circuits (Noir)

```bash
cd circuits

# Devreleri derle
nargo compile

# Testleri çalıştır
nargo test

# Proof oluştur
nargo prove
```

---

## 📁 Önemli Dosyalar

| Dosya                             | Açıklama             |
| --------------------------------- | -------------------- |
| `frontend/app/page.tsx`           | Ana sayfa            |
| `frontend/app/game/[id]/page.tsx` | Oyun sayfası         |
| `frontend/lib/stellar.ts`         | Stellar entegrasyonu |
| `frontend/lib/zkproof.ts`         | ZK proof utilities   |
| `contracts/poker_game/src/lib.rs` | Poker game kontratı  |
| `circuits/hand_validation.nr`     | El doğrulama devresi |

---

## 🔧 Sorun Giderme

### Frontend çalışmıyor

```bash
cd frontend
rm -rf node_modules .next
pnpm install
pnpm dev
```

### Kontrat derleme hatası

```bash
cd contracts
cargo clean
cargo build --target wasm32-unknown-unknown --release
```

### TypeScript hataları

```bash
cd frontend
pnpm tsc --noEmit  # Sadece tip kontrolü
```

---

## 🎯 Geliştirme Akışı

### 1. Yeni Özellik Ekleme

```bash
# Frontend bileşeni
frontend/components/YeniKomponent.tsx

# Backend fonksiyonu
frontend/lib/yeni-ozellik.ts

# Kontrat fonksiyonu
contracts/poker_game/src/lib.rs
```

### 2. Test Yazma

```bash
# Frontend test
frontend/components/__tests__/YeniKomponent.test.tsx

# Kontrat test
contracts/poker_game/src/test.rs
```

### 3. Deploy

```bash
# Frontend (Vercel)
cd frontend
pnpm build
vercel deploy

# Kontrat (Stellar Testnet)
cd contracts
stellar contract build
stellar contract deploy --wasm ... --network testnet
```

---

## 📚 Daha Fazla Bilgi

- [PROJECT_README.md](PROJECT_README.md) - Detaylı proje dokümantasyonu
- [frontend/README.md](frontend/README.md) - Frontend mimarisi
- [contracts/README.md](contracts/README.md) - Kontrat rehberi
- [circuits/README.md](circuits/README.md) - ZK devreleri

---

## 💡 Faydalı Linkler

- [Next.js Docs](https://nextjs.org/docs)
- [Stellar Soroban Docs](https://developers.stellar.org/docs/soroban)
- [Noir Lang Docs](https://noir-lang.org/docs)
- [TailwindCSS Docs](https://tailwindcss.com/docs)

---

## ⚠️ Not

Nargo (Noir) kurulu değil ama bu geliştirme için zorunlu değil. ZK circuit'lerini derlemek isterseniz:

```bash
# Nargo kurulumu (opsiyonel)
curl -L https://install.noir-lang.org | bash
noirup
```

Şu an frontend ve kontratlar için her şey hazır! 🎉
