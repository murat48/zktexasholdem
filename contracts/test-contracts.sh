#!/bin/bash

# Contract Testing Script for ZK Poker
# Tests deployed contracts on Stellar Testnet

set -e

echo "🧪 ZK Poker Contract Testing"
echo "============================"
echo ""

# Load environment
if [ -f "../.env" ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

POKER_CONTRACT=${POKER_CONTRACT:-$NEXT_PUBLIC_POKER_CONTRACT}
GAME_HUB_CONTRACT=${GAME_HUB_CONTRACT:-$NEXT_PUBLIC_GAME_HUB_CONTRACT}
IDENTITY=${1:-"zkpoker-deployer"}

echo "📋 Test Configuration:"
echo "   Poker Contract:   $POKER_CONTRACT"
echo "   Game Hub:         $GAME_HUB_CONTRACT"
echo "   Test Identity:    $IDENTITY"
echo ""

# Get test addresses
PLAYER1=$(stellar keys address $IDENTITY)
echo "🎮 Test Players:"
echo "   Player 1: $PLAYER1"
echo ""

# Test 1: Check contract deployment
echo "Test 1: Verify Poker Contract Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -z "$POKER_CONTRACT" ]; then
    echo "❌ POKER_CONTRACT not set"
    exit 1
fi

# Try to read contract info
stellar contract info --id $POKER_CONTRACT --network testnet > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Contract is deployed and accessible"
else
    echo "❌ Contract not found or not accessible"
    exit 1
fi
echo ""

# Test 2: View on Stellar Expert
echo "Test 2: Contract Explorer Links"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Poker Game Contract:"
echo "   https://stellar.expert/explorer/testnet/contract/$POKER_CONTRACT"
echo ""
echo "🔗 Game Hub Contract:"
echo "   https://stellar.expert/explorer/testnet/contract/$GAME_HUB_CONTRACT"
echo ""

# Test 3: Contract methods
echo "Test 3: Available Contract Methods"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
stellar contract inspect --id $POKER_CONTRACT --network testnet 2>/dev/null | head -20
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Basic tests passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Note: Full integration tests should be run from the frontend"
echo "   cd ../frontend && pnpm dev"
echo ""
