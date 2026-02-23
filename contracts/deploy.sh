#!/bin/bash

# Stellar Contract Deployment Script for ZK Poker
# This script deploys the poker game contracts to Stellar Testnet

set -e

echo "🚀 ZK Poker Contract Deployment"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NETWORK="testnet"
IDENTITY_NAME="zkpoker-deployer"

echo "📝 Configuration:"
echo "   Network: $NETWORK"
echo "   Identity: $IDENTITY_NAME"
echo ""

# Check if stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo -e "${RED}❌ Stellar CLI not found${NC}"
    echo "Install: cargo install stellar-cli"
    exit 1
fi

echo -e "${GREEN}✅ Stellar CLI found${NC}"
echo ""

# Create or use existing identity
echo "🔑 Setting up identity..."
if stellar keys address $IDENTITY_NAME 2>/dev/null; then
    echo -e "${GREEN}✅ Using existing identity: $IDENTITY_NAME${NC}"
    DEPLOYER_ADDRESS=$(stellar keys address $IDENTITY_NAME)
else
    echo "Creating new identity..."
    stellar keys generate --global $IDENTITY_NAME --network $NETWORK
    DEPLOYER_ADDRESS=$(stellar keys address $IDENTITY_NAME)
    echo -e "${GREEN}✅ Created new identity: $IDENTITY_NAME${NC}"
fi

echo "   Address: $DEPLOYER_ADDRESS"
echo ""

# Fund account from friendbot
echo "💰 Funding account from Friendbot..."
curl -s "https://friendbot.stellar.org?addr=$DEPLOYER_ADDRESS" > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Account funded successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Friendbot request completed (may already be funded)${NC}"
fi
echo ""

# Check WASM files
echo "📦 Checking WASM files..."
POKER_WASM="target/wasm32-unknown-unknown/release/poker_game.wasm"
GAMEHUB_WASM="target/wasm32-unknown-unknown/release/game_hub.wasm"

if [ ! -f "$POKER_WASM" ]; then
    echo -e "${RED}❌ Poker game WASM not found${NC}"
    echo "Run: cargo build --target wasm32-unknown-unknown --release"
    exit 1
fi

if [ ! -f "$GAMEHUB_WASM" ]; then
    echo -e "${RED}❌ Game hub WASM not found${NC}"
    echo "Run: cargo build --target wasm32-unknown-unknown --release"
    exit 1
fi

echo -e "${GREEN}✅ WASM files found${NC}"
echo "   Poker Game: $(ls -lh $POKER_WASM | awk '{print $5}')"
echo "   Game Hub: $(ls -lh $GAMEHUB_WASM | awk '{print $5}')"
echo ""

# Deploy Poker Game Contract
echo "🎮 Deploying Poker Game Contract..."
POKER_CONTRACT_ID=$(stellar contract deploy \
    --wasm $POKER_WASM \
    --source $IDENTITY_NAME \
    --network $NETWORK 2>&1 | grep -v "WARNING" | tail -1)

if [ -z "$POKER_CONTRACT_ID" ]; then
    echo -e "${RED}❌ Failed to deploy Poker Game contract${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Poker Game deployed${NC}"
echo "   Contract ID: $POKER_CONTRACT_ID"
echo ""

# Deploy Game Hub Contract (if needed - for this hackathon we use the provided one)
echo "ℹ️  Game Hub Contract (Hackathon Provided):"
GAME_HUB_CONTRACT_ID="CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG"
echo "   Contract ID: $GAME_HUB_CONTRACT_ID"
echo ""

# Save contract IDs to env file
echo "💾 Saving contract IDs to .env files..."

# Frontend .env.local
cat > ../frontend/.env.local << EOF
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_GAME_HUB_CONTRACT=$GAME_HUB_CONTRACT_ID
NEXT_PUBLIC_POKER_CONTRACT=$POKER_CONTRACT_ID
NEXT_PUBLIC_DEPLOYER_ADDRESS=$DEPLOYER_ADDRESS
EOF

# Root .env
cat > ../.env << EOF
# Stellar Contract Configuration
STELLAR_NETWORK=testnet
GAME_HUB_CONTRACT=$GAME_HUB_CONTRACT_ID
POKER_CONTRACT=$POKER_CONTRACT_ID
DEPLOYER_ADDRESS=$DEPLOYER_ADDRESS
DEPLOYER_SECRET=$(stellar keys show $IDENTITY_NAME)
EOF

echo -e "${GREEN}✅ Environment files updated${NC}"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Contract Information:"
echo "   • Poker Game:  $POKER_CONTRACT_ID"
echo "   • Game Hub:    $GAME_HUB_CONTRACT_ID"
echo ""
echo "👤 Deployer:"
echo "   • Identity:    $IDENTITY_NAME"
echo "   • Address:     $DEPLOYER_ADDRESS"
echo ""
echo "📄 Configuration saved to:"
echo "   • frontend/.env.local"
echo "   • .env (root)"
echo ""
echo "🔗 View on Stellar Expert:"
echo "   https://stellar.expert/explorer/testnet/contract/$POKER_CONTRACT_ID"
echo ""
echo "🚀 Next Steps:"
echo "   1. cd ../frontend"
echo "   2. pnpm dev"
echo "   3. Open http://localhost:3000"
echo ""
