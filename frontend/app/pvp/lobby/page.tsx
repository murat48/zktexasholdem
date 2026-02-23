'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletContext } from '@/components/WalletProvider';
import { usePvP } from '@/hooks/usePvP';

export default function LobbyPage() {
  const router = useRouter();
  const { address, isConnected, connect } = useWalletContext();
  const pvp = usePvP();

  const [joinCode, setJoinCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Navigate to game once opponent connects
  useEffect(() => {
    if (pvp.opponentConnected && pvp.roomCode) {
      router.push(`/pvp/game/${pvp.roomCode}?role=${pvp.role}`);
    }
  }, [pvp.opponentConnected, pvp.roomCode, pvp.role, router]);

  const handleCreate = async () => {
    if (!address) return;
    try {
      const code = await pvp.createRoom(address);
      setCreatedCode(code);
    } catch (err) {
      alert('Failed to create room: ' + String(err));
    }
  };

  const handleJoin = async () => {
    if (!address || !joinCode.trim()) return;
    try {
      await pvp.joinRoom(joinCode.trim(), address);
    } catch (err) {
      alert('Failed to join room: ' + String(err));
    }
  };

  const copyCode = () => {
    if (!createdCode) return;
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center space-y-4">
          <div className="text-5xl mb-4">🃏</div>
          <h2 className="text-2xl font-bold text-white">Connect wallet to play PvP</h2>
          <button
            onClick={connect}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
          >
            🔗 Connect Wallet
          </button>
          <div className="mt-4">
            <a href="/" className="text-gray-400 hover:text-white text-sm">← Back to Home</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="text-5xl mb-3">⚔️</div>
          <h1 className="text-3xl font-bold">Player vs Player</h1>
          <p className="text-gray-400 mt-2 text-sm">
            ZK Texas Hold'em — no signatures per move
          </p>
          <div className="mt-2 text-xs font-mono text-gray-500">
            {address?.slice(0, 8)}…{address?.slice(-8)}
          </div>
        </div>

        {pvp.errorMessage && (
          <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {pvp.errorMessage}
          </div>
        )}

        {/* Create Room */}
        {!createdCode && !pvp.isPvPLoading && (
          <div className="space-y-6">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
              <h2 className="font-bold text-lg">🏠 Create a Room</h2>
              <p className="text-gray-400 text-sm">
                Generate a 6-letter code and share it with your opponent.
              </p>
              <button
                onClick={handleCreate}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 font-bold rounded-lg transition-colors"
              >
                Create Room
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-gray-900 text-gray-500">or</span>
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
              <h2 className="font-bold text-lg">🚪 Join a Room</h2>
              <p className="text-gray-400 text-sm">
                Enter the 6-letter code your opponent shared with you.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="ABC123"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 font-mono text-center text-xl tracking-widest uppercase focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleJoin}
                  disabled={joinCode.length < 6}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-lg transition-colors"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for opponent */}
        {createdCode && !pvp.opponentConnected && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center space-y-6">
            <div className="text-4xl animate-pulse">⌛</div>
            <div>
              <p className="text-gray-400 mb-3">Share this code with your opponent:</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl font-black tracking-[0.3em] text-yellow-400">
                  {createdCode}
                </span>
                <button
                  onClick={copyCode}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                >
                  {copied ? '✅' : '📋'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Waiting for opponent…
            </div>
            <button
              onClick={pvp.disconnect}
              className="text-gray-500 hover:text-red-400 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Loading / joining */}
        {pvp.isPvPLoading && !createdCode && (
          <div className="text-center text-gray-400 py-8">
            <div className="text-3xl mb-3 animate-spin">🔄</div>
            Joining room…
          </div>
        )}

        <div className="text-center">
          <a href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}
