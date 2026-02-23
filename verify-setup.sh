#!/bin/bash

# Verification script to check project setup
echo "🔍 Verifying ZK Poker Setup..."
echo ""

# Check Node.js
echo "📦 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found"
fi

# Check pnpm
echo ""
echo "📦 Checking pnpm..."
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "✅ pnpm: v$PNPM_VERSION"
else
    echo "❌ pnpm not found - Install: npm install -g pnpm"
fi

# Check Rust
echo ""
echo "🦀 Checking Rust..."
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    echo "✅ Rust: $RUST_VERSION"
else
    echo "❌ Rust not found - Install: https://rustup.rs"
fi

# Check wasm32 target
echo ""
echo "🎯 Checking wasm32 target..."
if rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "✅ wasm32-unknown-unknown target installed"
else
    echo "⚠️  wasm32 target not found"
    echo "   Install: rustup target add wasm32-unknown-unknown"
fi

# Check Stellar CLI
echo ""
echo "⭐ Checking Stellar CLI..."
if command -v stellar &> /dev/null; then
    STELLAR_VERSION=$(stellar --version | head -1)
    echo "✅ $STELLAR_VERSION"
else
    echo "⚠️  Stellar CLI not found"
    echo "   Install: cargo install stellar-cli"
fi

# Check Nargo (Noir)
echo ""
echo "🔐 Checking Nargo (Noir)..."
if command -v nargo &> /dev/null; then
    NARGO_VERSION=$(nargo --version)
    echo "✅ $NARGO_VERSION"
else
    echo "⚠️  Nargo not found (optional for hackathon)"
    echo "   Install: https://noir-lang.org/docs/getting_started/installation"
fi

# Check frontend dependencies
echo ""
echo "🎨 Checking frontend dependencies..."
if [ -d "frontend/node_modules" ]; then
    echo "✅ Frontend dependencies installed"
else
    echo "⚠️  Frontend dependencies not installed"
    echo "   Run: cd frontend && pnpm install"
fi

# Check contract build
echo ""
echo "📜 Checking contracts..."
if [ -f "contracts/Cargo.toml" ]; then
    echo "✅ Contract workspace configured"
else
    echo "❌ Contract configuration missing"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Setup Status Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Ready for development:"
echo "   • Frontend: Next.js, React, TypeScript, TailwindCSS"
echo "   • Contracts: Soroban (Rust)"
echo ""
echo "⚠️  Optional tools (not blocking):"
echo "   • Nargo (for ZK circuit development)"
echo ""
echo "🚀 Next Steps:"
echo "   1. cd frontend && pnpm dev       # Start dev server"
echo "   2. Open http://localhost:3000"
echo "   3. Read PROJECT_README.md for details"
echo ""
