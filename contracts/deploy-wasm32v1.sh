#!/bin/bash

# Stellar Contract Deployment Script (wasm32v1 version)
# Deploys wasm32v1 poker_game and sets the noir_verifier contract address

set -e

echo "🚀 ZK Poker Contract Deployment (wasm32v1)"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK="testnet"
IDENTITY_NAME="zkpoker-deployer"
NOIR_VERIFIER_CONTRACT="CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5"

echo "📝 Configuration:"
echo "   Network: $NETWORK"
echo "   Identity: $IDENTITY_NAME"
echo "   Noir Verifier: $NOIR_VERIFIER_CONTRACT"
echo ""

# Check if stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo -e "${RED}❌ Stellar CLI not found${NC}"
    echo "Install: cargo install stellar-cli"
    exit 1
fi

echo -e "${GREEN}✅ Stellar CLI found${NC}"
echo ""

# Get deployer address
DEPLOYER_ADDRESS=$(stellar keys address $IDENTITY_NAME)
echo "🔑 Deployer Address: $DEPLOYER_ADDRESS"
echo ""

# Check wasm32v1 file
echo "📦 Checking wasm32v1 poker_game binary..."
POKER_WASM_V1="target/wasm32v1-none/release/poker_game.wasm"

if [ ! -f "$POKER_WASM_V1" ]; then
    echo -e "${RED}❌ wasm32v1 poker_game WASM not found at $POKER_WASM_V1${NC}"
    echo "Run: cargo build --target wasm32v1-none --release --package poker-game"
    exit 1
fi

WASM_SIZE=$(ls -lh $POKER_WASM_V1 | awk '{print $5}')
echo -e "${GREEN}✅ wasm32v1 poker_game found${NC}"
echo "   Path: $POKER_WASM_V1"
echo "   Size: $WASM_SIZE"
echo ""

# Deploy Poker Game Contract (wasm32v1)
echo -e "${BLUE}🎮 Deploying wasm32v1 Poker Game Contract...${NC}"
POKER_CONTRACT_ID=$(stellar contract deploy \
    --wasm $POKER_WASM_V1 \
    --source $IDENTITY_NAME \
    --network $NETWORK 2>&1 | grep -v "WARNING" | tail -1)

if [ -z "$POKER_CONTRACT_ID" ]; then
    echo -e "${RED}❌ Failed to deploy Poker Game contract${NC}"
    exit 1
fi

echo -e "${GREEN}✅ wasm32v1 Poker Game deployed successfully!${NC}"
echo "   Contract ID: $POKER_CONTRACT_ID"
echo ""

# Initialize game (creates instance storage)
echo -e "${BLUE}⚙️ Initializing game instance storage...${NC}"
GAME_ID="0000000000000000000000000000000000000000000000000000000000000000"
stellar contract invoke \
    --id $POKER_CONTRACT_ID \
    --source $IDENTITY_NAME \
    --network $NETWORK \
    -- init_game --game-id $GAME_ID --player1 $DEPLOYER_ADDRESS --player2 $DEPLOYER_ADDRESS --starting-chips 1000 > /dev/null 2>&1

echo -e "${GREEN}✅ Instance storage initialized${NC}"
echo ""

# Set verifier contract
echo -e "${BLUE}🔐 Setting noir_verifier contract address...${NC}"
stellar contract invoke \
    --id $POKER_CONTRACT_ID \
    --source $IDENTITY_NAME \
    --network $NETWORK \
    -- set_verifier --verifier $NOIR_VERIFIER_CONTRACT > /dev/null

echo -e "${GREEN}✅ Verifier contract set successfully!${NC}"
echo "   Noir Verifier: $NOIR_VERIFIER_CONTRACT"
echo ""

# Save contract IDs to env files
echo "💾 Saving contract IDs to environment files..."

# Root .env
cat > ../.env << EOF
# Stellar Contract Configuration
STELLAR_NETWORK=testnet
GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
POKER_CONTRACT=$POKER_CONTRACT_ID
DEPLOYER_ADDRESS=$DEPLOYER_ADDRESS
DEPLOYER_SECRET=$(stellar keys show $IDENTITY_NAME)
EOF

# Frontend .env.local
cat > ../frontend/.env.local << EOF
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_GAME_HUB_CONTRACT=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_POKER_CONTRACT=$POKER_CONTRACT_ID
NEXT_PUBLIC_DEPLOYER_ADDRESS=$DEPLOYER_ADDRESS

# AI Opponent Bot
NEXT_PUBLIC_AI_BOT_ADDRESS=GAJXYRRBECPQVCOCCLBCCZ2KGGNEHL32TLJRT2JWLNVE4HJ35OAKAPH2
AI_BOT_SECRET=SA4QOLZJTJYRMR4ZSKD5CQRT3UO4ZLJUNXVQWITD76JRHL7FRTKO4ZOK
DEPLOYER_SECRET=$(stellar keys show $IDENTITY_NAME)

# Game Hub Integration
NEXT_PUBLIC_ENABLE_GAME_HUB=true

# Zero-Knowledge Proofs
NEXT_PUBLIC_ENABLE_ZK_PROOFS=true

# ZK Verifier Contracts (deployed Feb 22, 2026)
NEXT_PUBLIC_NOIR_VERIFIER_CONTRACT=$NOIR_VERIFIER_CONTRACT
NEXT_PUBLIC_RISC0_VERIFIER_CONTRACT=CABIRANZOPIFQRE5FV5L5HZDTUUSHKKK45WAL3MCOMWPPOZDG3ASSH7H

# zkVerify — Volta testnet seed phrase
ZKVERIFY_SEED_PHRASE=

# AI Opponent API Keys
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
GOOGLE_GEMINI_API_KEY=your-google-gemini-api-key-here
EOF

echo -e "${GREEN}✅ Environment files updated${NC}"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Contract Information:"
echo "   • Poker Game (wasm32v1):  $POKER_CONTRACT_ID"
echo "   • Noir Verifier:  $NOIR_VERIFIER_CONTRACT"
echo ""
echo "👤 Deployer:"
echo "   • Identity:    $IDENTITY_NAME"
echo "   • Address:     $DEPLOYER_ADDRESS"
echo ""
echo "📄 Configuration saved to:"
echo "   • .env (root)"
echo "   • frontend/.env.local"
echo ""
echo "🔗 View on Stellar Expert:"
echo "   https://stellar.expert/explorer/testnet/contract/$POKER_CONTRACT_ID"
echo ""
echo "🚀 Next Steps:"
echo "   1. cd ../frontend"
echo "   2. pnpm dev"
echo "   3. Open http://localhost:3000"
echo ""
