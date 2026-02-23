'use client';

import Link from 'next/link';
import { useWalletContext } from '@/components/WalletProvider';

export default function Home() {
  const { address, isConnected, connect } = useWalletContext();

  return (
    <main className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🃏</span>
            <h1 className="text-2xl font-bold">ZK Poker</h1>
            <span className="text-xs bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full">
              Stellar Testnet
            </span>
          </div>
          <div>
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-mono text-gray-300">
                  {address.slice(0, 6)}…{address.slice(-6)}
                </span>
              </div>
            ) : (
              <button
                onClick={connect}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-2xl">
          <div className="text-7xl mb-6">🃏</div>

          <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            ZK Texas Hold&apos;em
          </h2>
          <p className="text-gray-300 text-xl mb-3">
            Zero-Knowledge Proof Poker on Stellar Blockchain
          </p>
          <p className="text-gray-500 text-sm mb-10 max-w-lg mx-auto">
            Play against an AI opponent. Your cards are committed with Noir ZK circuits —
            the contract verifies your hand rank without ever seeing your cards.
          </p>

          {!isConnected ? (
            <div className="space-y-3">
              <button
                onClick={connect}
                className="px-10 py-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold text-xl transition-all hover:scale-105 shadow-lg shadow-purple-900/40"
              >
                🔗 Connect Wallet
              </button>
              <p className="text-gray-500 text-sm">
                Need a Stellar wallet?{' '}
                <a
                  href="https://stellarwalletskit.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  Freighter, xBull, Albedo & more
                </a>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/game/new"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-purple-900/40"
                >
                  🤖 Play vs AI
                </Link>
                <Link
                  href="/pvp/lobby"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-blue-900/40"
                >
                  👥 Play vs Human
                </Link>
              </div>
              <p className="text-gray-500 text-sm">
                Wallet:{' '}
                <span className="font-mono text-gray-400">
                  {(address as string).slice(0, 8)}…{(address as string).slice(-8)}
                </span>
              </p>
            </div>
          )}

          {/* Feature cards */}
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
            <div className="bg-gray-800 border border-gray-700 p-5 rounded-xl">
              <div className="text-2xl mb-2">🔐</div>
              <div className="font-semibold mb-1">ZK Proofs</div>
              <p className="text-sm text-gray-400">
                Noir Lang circuits + Barretenberg backend. Hand rank proven on-chain without revealing hole cards.
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 p-5 rounded-xl">
              <div className="text-2xl mb-2">⛓️</div>
              <div className="font-semibold mb-1">On-Chain</div>
              <p className="text-sm text-gray-400">
                Every game action goes to a Soroban smart contract. Game Hub records start &amp; end on Stellar Testnet.
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 p-5 rounded-xl">
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-semibold mb-1">AI Opponent</div>
              <p className="text-sm text-gray-400">
                Bot signs transactions with its own Stellar keypair. No second wallet needed — play instantly.
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 p-5 rounded-xl">
              <div className="text-2xl mb-2">👥</div>
              <div className="font-semibold mb-1">PvP Mode</div>
              <p className="text-sm text-gray-400">
                Play against a real opponent. Share a room code, no signatures per move — session keypairs handle it.
              </p>
            </div>
          </div>

          {/* Live contract addresses */}
          <div className="mt-8 p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-left">
            <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">
              Live Contracts — Stellar Testnet
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex gap-3">
                <span className="text-gray-500 w-32 shrink-0">Game Hub</span>
                <a
                  href="https://stellar.expert/explorer/testnet/contract/CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-purple-400 hover:underline break-all"
                >
                  CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
                </a>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-500 w-32 shrink-0">Poker Contract</span>
                <a
                  href="https://stellar.expert/explorer/testnet/contract/CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-purple-400 hover:underline break-all"
                >
                  CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 px-6 text-center text-xs text-gray-600">
        Built for Stellar Game Studio Hackathon 2026 · Noir ZK Proofs + Soroban Smart Contracts
      </footer>
    </main>
  );
}
