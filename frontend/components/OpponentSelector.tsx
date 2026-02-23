'use client';

import { useState } from 'react';
import {
  AI_OPPONENTS,
  AIOpponent,
  pickRandomOpponent,
  saveSelectedOpponent,
} from '@/lib/ai-opponents';

interface Props {
  onSelect: (opponent: AIOpponent) => void;
}

const PROVIDER_META = {
  openai: { label: 'GPT-4o Mini',        bg: 'bg-emerald-900/60 border-emerald-600', color: 'text-emerald-300' },
  claude: { label: 'Claude Haiku 4.5',   bg: 'bg-amber-900/60 border-amber-600',    color: 'text-amber-300'   },
  gemini: { label: 'Gemini 2.5 Flash Lite', bg: 'bg-sky-900/60 border-sky-600',        color: 'text-sky-300'     },
  random: { label: 'Surprise AI',        bg: 'bg-pink-900/60 border-pink-600',       color: 'text-pink-300'    },
} as const;

function DifficultyStars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i < value ? 'bg-yellow-400' : 'bg-gray-600'}`}
        />
      ))}
      <span className="ml-1 text-xs text-gray-400">{value}/10</span>
    </div>
  );
}

function AvatarCircle({ opponent, size = 'lg' }: { opponent: AIOpponent; size?: 'sm' | 'lg' }) {
  const sz = size === 'lg' ? 'w-24 h-24 text-5xl' : 'w-10 h-10 text-xl';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center border-4 ${opponent.avatarBg} ${opponent.avatarBorder} shadow-lg mx-auto`}
    >
      {opponent.avatar}
    </div>
  );
}

export function OpponentSelector({ onSelect }: Props) {
  const [selected, setSelected]   = useState<string | null>(null);
  const [randomizing, setRandomizing] = useState(false);

  function handleRandom() {
    setRandomizing(true);
    let count = 0;
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * AI_OPPONENTS.length);
      setSelected(AI_OPPONENTS[idx].id);
      count++;
      if (count >= 14) {
        clearInterval(interval);
        setSelected(pickRandomOpponent().id);
        setRandomizing(false);
      }
    }, 80);
  }

  function handleStart() {
    if (!selected) return;
    saveSelectedOpponent(selected);
    const opp = AI_OPPONENTS.find(o => o.id === selected)!;
    onSelect(opp);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="text-center pt-10 pb-6 px-4">
        <div className="text-5xl mb-3">🤖</div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          Choose Your Opponent
        </h1>
        <p className="text-gray-400 mt-2 text-sm max-w-md mx-auto">
          Each opponent runs on a different AI and plays with a unique strategy.
        </p>
      </div>

      {/* Random Button */}
      <div className="text-center mb-6">
        <button
          onClick={handleRandom}
          disabled={randomizing}
          className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-70 text-black font-bold rounded-xl transition-all hover:scale-105 shadow-md shadow-yellow-900/40"
        >
          {randomizing ? <>⏳ Picking...</> : <>🎰 Random Pick</>}
        </button>
      </div>

      {/* Opponent Grid */}
      <div className="flex-1 overflow-auto px-4 pb-6 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AI_OPPONENTS.map(opp => {
            const isSelected  = selected === opp.id;
            const provMeta    = PROVIDER_META[opp.provider];
            return (
              <button
                key={opp.id}
                onClick={() => setSelected(opp.id)}
                className={`
                  relative text-left rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer flex flex-col
                  ${isSelected
                    ? `${opp.avatarBorder} bg-gray-800 scale-105 shadow-xl shadow-black/40`
                    : 'border-gray-700 bg-gray-800/60 hover:border-gray-500 hover:bg-gray-800'
                  }
                `}
              >
                {/* Checkmark */}
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                )}

                {/* Avatar */}
                <AvatarCircle opponent={opp} />

                {/* Info */}
                <div className="mt-3 text-center flex flex-col gap-1 flex-1">
                  <div className="font-bold text-lg">{opp.name}</div>
                  <div className="text-xs text-gray-400 font-medium">{opp.title}</div>

                  {/* Provider Badge */}
                  <div className={`inline-flex items-center gap-1 mx-auto px-2 py-0.5 rounded-full border text-xs font-semibold ${provMeta.bg} ${provMeta.color}`}>
                    {opp.providerIcon} {provMeta.label}
                  </div>

                  <div className="text-xs text-gray-300 leading-relaxed mt-1">
                    {opp.description}
                  </div>

                  <div className="italic text-xs text-gray-500 border-t border-gray-700 pt-2 mt-auto">
                    &ldquo;{opp.tagline}&rdquo;
                  </div>

                  {/* Difficulty */}
                  <div className="flex flex-col items-center gap-1 mt-2">
                    <span className="text-xs text-gray-500">Difficulty</span>
                    <DifficultyStars value={opp.difficulty} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Start — sticky bottom */}
      <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {selected ? (() => {
            const opp = AI_OPPONENTS.find(o => o.id === selected)!;
            const pm  = PROVIDER_META[opp.provider];
            return (
              <div className="flex items-center gap-3">
                <AvatarCircle opponent={opp} size="sm" />
                <div>
                  <div className="text-sm font-bold">{opp.name}</div>
                  <div className={`text-xs font-semibold ${pm.color}`}>
                    {opp.providerIcon} {pm.label}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="text-gray-500 text-sm">Pick an opponent above 👆</div>
          )}

          <button
            onClick={handleStart}
            disabled={!selected}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-purple-900/40 flex-shrink-0"
          >
            Start Game →
          </button>
        </div>
      </div>
    </div>
  );
}
