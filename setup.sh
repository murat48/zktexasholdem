#!/bin/bash

# ZK Poker Setup Script
# This script helps set up the complete development environment

echo "🎰 Setting up ZK Poker on Stellar..."

# Check for required tools
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+"
    exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Installing pnpm..."
    npm install -g pnpm
fi

# Check Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust from https://rustup.rs/"
    exit 1
fi

# Check Stellar CLI
if ! command -v stellar &> /dev/null; then
    echo "⚠️  Stellar CLI not found. Please install from https://developers.stellar.org/"
fi

# Check Noir
if ! command -v nargo &> /dev/null; then
    echo "⚠️  Noir (nargo) not found. Please install from https://noir-lang.org/"
fi

echo "✅ Prerequisites check complete"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
pnpm install
cd ..

# Build circuits (if nargo is available)
if command -v nargo &> /dev/null; then
    echo "🔐 Compiling ZK circuits..."
    cd circuits
    nargo compile
    cd ..
else
    echo "⚠️  Skipping circuit compilation (nargo not found)"
fi

# Build contracts
echo "🔨 Building smart contracts..."
cd contracts
cargo build --target wasm32-unknown-unknown --release
cd ..

echo "✅ Setup complete!"
echo ""
echo "🚀 Next steps:"
echo "  1. cd frontend && pnpm dev    # Start development server"
echo "  2. Open http://localhost:3000 in your browser"
echo "  3. Connect your Stellar wallet"
echo ""
echo "📚 Read PROJECT_README.md for full documentation"
