'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PokerTable } from '@/components/PokerTable';
import { PlayerHand } from '@/components/PlayerHand';
import { CommunityCards } from '@/components/CommunityCards';
import { BettingControls } from '@/components/BettingControls';
import { ChipStack } from '@/components/ChipStack';
import { GameLog } from '@/components/GameLog';
import { useTexasHoldem, useOpponentAI } from '@/hooks/useTexasHoldem';
import { useWalletContext } from '@/components/WalletProvider';
import { ZKSetupWizard, type ZKBackend } from '@/components/ZKSetupWizard';
import { saveBackendChoice, loadBackendChoice, getBackendLabel } from '@/lib/zk-proof-router';
import { loadSelectedOpponent, type AIOpponent } from '@/lib/ai-opponents';
import { useAIChat } from '@/lib/ai-chat';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { address, isConnected, connect, signTransaction } = useWalletContext();
  const { state, isLoading, actions, isZkPending } = useTexasHoldem(id, address, signTransaction);

  const handlePlayAgain = useCallback(() => {
    // Generate a fresh unique session ID — new URL triggers a clean re-mount,
    // so initPokerGame + start_game fire with a brand-new session_id.
    const newId = `game-${Date.now()}`;
    router.push(`/game/${newId}`);
  }, [router]);

  // ZK Backend selection
  const [zkBackend, setZkBackend] = useState<ZKBackend>('noir');
  const [showWizard, setShowWizard] = useState(false);

  // AI Opponent
  const [aiOpponent, setAiOpponent] = useState<AIOpponent | null>(null);
  useEffect(() => {
    setAiOpponent(loadSelectedOpponent());
  }, []);

  useEffect(() => {
    const saved = loadBackendChoice();
    setZkBackend(saved);
    // Show wizard only on first visit (no saved choice)
    if (!localStorage.getItem('zk_backend')) {
      setShowWizard(true);
    }
  }, []);

  const handleZKSelect = (backend: ZKBackend) => {
    setZkBackend(backend);
    saveBackendChoice(backend);
    setShowWizard(false);
  };

  // Enable opponent AI
  const { isAIThinking } = useOpponentAI(state, actions);

  // AI Chat
  const myPlayerIndexForChat = state ? Math.max(0, state.players.findIndex(p => p.address === address)) : 0;
  const { messages: aiChatMessages, sendPlayer: sendAIMessage } = useAIChat(state, myPlayerIndexForChat);
  const [aiChatInput, setAiChatInput] = useState('');
  const aiChatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiChatMessages]);

  const [gameLog, setGameLog] = useState<any[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const pendingNewHandRef = useRef(false);
  const isZkPendingRef = useRef(isZkPending);
  isZkPendingRef.current = isZkPending;

  // Auto-start countdown when hand is over
  useEffect(() => {
    if (!state || state.currentBettingRound !== 'handover' || state.isGameOver) {
      setCountdown(null);
      return;
    }

    // Show 3-second countdown immediately
    setCountdown(3);
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        // Skip if countdown was cleared externally (e.g. Skip button)
        if (prev === null) {
          clearInterval(timer);
          return null;
        }
        if (prev <= 1) {
          clearInterval(timer);
          if (isZkPendingRef.current) {
            // ZK proof still in flight → defer until it finishes
            pendingNewHandRef.current = true;
          } else {
            console.log('⏰ Countdown finished - starting new hand');
            setTimeout(() => actions.startNewHand(), 100);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state?.currentBettingRound, state?.isGameOver, state?.lastHandWinner]);

  // Fire startNewHand as soon as ZK proof confirms (if countdown already expired)
  useEffect(() => {
    if (!isZkPending && pendingNewHandRef.current && state?.currentBettingRound === 'handover' && !state?.isGameOver) {
      pendingNewHandRef.current = false;
      console.log('✅ ZK done - starting deferred new hand');
      setTimeout(() => actions.startNewHand(), 100);
    }
  }, [isZkPending]);


  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-center max-w-md p-8">
          <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="text-gray-400 mb-6">
            You need a Stellar wallet to play ZK Poker
          </p>
          <button
            onClick={connect}
            className="px-8 py-4 bg-stellar-purple hover:bg-stellar-purple-dark rounded-lg font-medium text-lg transition-colors"
          >
            Connect Wallet
          </button>
          <p className="text-sm text-gray-500 mt-4">
            Need a Stellar wallet?{' '}
            <a
              href="https://stellarwalletskit.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stellar-purple hover:underline"
            >
              Freighter, xBull, Albedo & more
            </a>
          </p>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-2xl">Loading game...</div>
      </main>
    );
  }

  const myPlayerIndex = Math.max(0, state.players.findIndex(p => p.address === address));
  const opponent = state.players[1 - myPlayerIndex];
  const myPlayer = state.players[myPlayerIndex];
  const isMyTurn = state.currentPlayer === myPlayerIndex;

  // Betting calculation
  const myBetThisRound = state.roundBets[myPlayer.address] || 0;
  const oppBetThisRound = state.roundBets[opponent.address] || 0;
  const callAmount = Math.max(0, state.highestBet - myBetThisRound);
  const canCheck = callAmount === 0;
  const minBet = state.highestBet + 10;
  // Max bet: I can bet up to my total chips, but effective stack limits it
  // If opponent has less chips than me, betting more than their stack doesn't make sense
  const myTotalPossibleBet = myBetThisRound + myPlayer.chips; // Total chips I can commit
  const oppTotalPossibleBet = oppBetThisRound + opponent.chips; // Total chips opponent can commit
  const maxBet = Math.min(myTotalPossibleBet, oppTotalPossibleBet);

  const handleAction = (actionName: string, amount?: number) => {
    console.log(`🎬 ${actionName}`, { amount });
    setGameLog(prev => [...prev, {
      timestamp: Date.now(),
      action: actionName,
      player: address?.slice(0, 8) + '...',
      amount,
    }]);
  };

  const label = getBackendLabel(zkBackend);

  return (
    <>
      <ZKSetupWizard isOpen={showWizard} onSelect={handleZKSelect} />
    <main className="min-h-screen p-8 bg-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <a href="/" className="text-gray-400 hover:text-white transition-colors text-sm">← Home</a>
            <h1 className="text-3xl font-bold">ZK Poker</h1>
            <span className="text-xs bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full">Testnet</span>
          </div>
          <div className="flex items-center gap-4">
            {/* ZK backend badge */}
            <button
              onClick={() => setShowWizard(true)}
              title="Change ZK backend"
              className="flex items-center gap-1.5 text-xs bg-slate-800 border border-gray-600 hover:border-purple-500 text-gray-300 px-3 py-1.5 rounded-full transition-all"
            >
              <span>{label.icon}</span>
              <span>{label.name}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                label.status === 'Active' ? 'bg-green-700 text-white' : 'bg-yellow-600 text-black'
              }`}>{label.status}</span>
            </button>
            <div className="text-right">
              <div className="text-sm text-gray-400">Connected</div>
              <div className="font-mono text-sm">{address?.slice(0, 6)}…{address?.slice(-6)}</div>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="mb-6 flex items-center gap-3 px-5 py-3 bg-yellow-900/60 border border-yellow-700 rounded-xl text-yellow-200 text-sm animate-pulse">
            <span className="text-xl">⛓️</span>
            <span>Setting up your game on Stellar blockchain… Betting will unlock when ready.</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <PokerTable pot={state.pot}>
              <div className="space-y-8">
                {/* Opponent */}
                <div className="flex justify-between items-center">
                  <ChipStack amount={opponent.chips} />
                  <PlayerHand
                    cards={
                      // Only show opponent cards at showdown if they didn't fold
                      (state.currentBettingRound === 'showdown' || state.currentBettingRound === 'handover') && !opponent.hasFolded
                        ? opponent.holeCards  // Show opponent cards at showdown (if not folded)
                        : [0, 1]               // Hidden cards otherwise
                    }
                    position="top"
                    isHidden={
                      !((state.currentBettingRound === 'showdown' || state.currentBettingRound === 'handover') && !opponent.hasFolded)
                    }
                  />
                  <div className="text-white">
                    {/* AI Opponent Avatar + Name */}
                    {aiOpponent ? (
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xl border-2 ${aiOpponent.avatarBg} ${aiOpponent.avatarBorder} shadow`}>
                          {aiOpponent.avatar}
                        </div>
                        <div>
                          <div className="font-bold text-sm">{aiOpponent.name}</div>
                          <div className="text-xs text-gray-400">{aiOpponent.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{aiOpponent.providerIcon} {aiOpponent.providerLabel}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="font-medium">Opponent</div>
                    )}
                    <div className="text-sm text-gray-400">
                      {opponent.address.slice(0, 8)}...
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Bet: {oppBetThisRound} chips
                    </div>
                    {opponent.hasFolded && (
                      <div className="text-xs text-red-500 mt-1">🚫 Folded</div>
                    )}
                  </div>
                </div>

                {/* Community Cards */}
                <CommunityCards cards={state.communityCards} round={state.currentBettingRound} />

                {/* Your Hand - Show actual hole cards */}
                <div className="flex justify-between items-center">
                  <ChipStack amount={myPlayer.chips} />
                  <PlayerHand
                    cards={myPlayer.holeCards}
                    position="bottom"
                    isHidden={false}
                  />
                  <div className="text-white">
                    <div className="font-medium">You</div>
                    <div className="text-sm text-gray-400">
                      {address?.slice(0, 8)}...
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Bet: {myBetThisRound} chips
                    </div>
                  </div>
                </div>
              </div>
            </PokerTable>

            {/* Betting Controls */}
            <div className="mt-8">
              <div className="mb-4 p-4 bg-blue-900 rounded-lg">
                <div className="text-sm text-blue-200">
                  {state.currentBettingRound === 'preflop' && '🎮 Pre-Flop Betting'}
                  {state.currentBettingRound === 'flop' && '🃏 Flop (3 community cards)'}
                  {state.currentBettingRound === 'turn' && '🃏 Turn (4th community card)'}
                  {state.currentBettingRound === 'river' && '🃏 River (5th community card)'}
                  {state.currentBettingRound === 'showdown' && '🎯 Showdown!'}
                  {state.currentBettingRound === 'handover' && '✅ Hand Over'}
                </div>
                <div className="text-2xl font-bold text-white mt-1">Pot: {state.pot} 💰</div>
              </div>
              
              {state.currentBettingRound !== 'showdown' && state.currentBettingRound !== 'handover' && (
                <>
                  {isMyTurn && !myPlayer.hasFolded && !isAIThinking ? (
                    <BettingControls
                      onFold={() => {
                        handleAction('Fold');
                        actions.fold();
                      }}
                      onCheck={() => {
                        handleAction('Check');
                        actions.check();
                      }}
                      onCall={() => {
                        handleAction('Call', callAmount);
                        actions.call();
                      }}
                      onBet={(amount) => {
                        handleAction('Bet', amount);
                        actions.bet(amount);
                      }}
                      canCheck={canCheck}
                      callAmount={callAmount}
                      minBet={minBet}
                      maxBet={maxBet}
                      disabled={isLoading}
                    />
                  ) : (
                    <div className="text-center p-6 bg-gray-800 rounded-lg">
                      {myPlayer.hasFolded ? (
                        <p className="text-red-500 font-medium">🚫 You folded this hand</p>
                      ) : (
                        <p className="text-yellow-500 font-medium">
                          {isAIThinking ? '🤖 Opponent is thinking...' : '⏳ Waiting for opponent...'}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
              
              {/* Showdown/Handover - Show Winner */}
              {(state.currentBettingRound === 'showdown' || state.currentBettingRound === 'handover') && (
                <div className="space-y-4">
                  {/* Winner Announcement */}
                  {state.lastHandWinner !== undefined && (
                    <div className="p-6 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-lg text-center">
                      {state.lastHandWinner === 'tie' ? (
                        <>
                          <div className="text-3xl font-bold text-white mb-2">🤝 TIE!</div>
                          <div className="text-lg text-yellow-100">
                            Pot split: {state.lastHandWinAmount} chips each
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-3xl font-bold text-white mb-2">
                            {state.lastHandWinner === myPlayerIndex ? '🎉 YOU WIN!' : '😢 OPPONENT WINS'}
                          </div>
                          <div className="text-lg text-yellow-100">
                            {state.lastHandWinner === myPlayerIndex ? 'You won' : 'Opponent won'} {state.lastHandWinAmount} chips
                          </div>
                          {state.lastHandWinner === myPlayerIndex && (
                            <div className="text-sm text-yellow-200 mt-2">
                              💰 Your new balance: {myPlayer.chips} chips
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  
                  {/* Game Over or New Hand Button */}
                  {state.currentBettingRound === 'handover' && (
                    <>
                      {state.isGameOver ? (
                        <div className="space-y-4">
                          <div className="p-6 bg-gradient-to-r from-red-600 to-red-800 rounded-lg text-center">
                            <div className="text-3xl font-bold text-white mb-2">🏁 GAME OVER!</div>
                            {state.gameOverWinner !== undefined && (
                              <div className="text-xl text-red-100 mb-3">
                                {state.gameOverWinner === myPlayerIndex ? '🎊 YOU WON THE MATCH!' : '😢 Opponent won the match'}
                              </div>
                            )}
                            <div className="text-sm text-red-200">
                              {state.gameOverWinner === myPlayerIndex 
                                ? 'Opponent ran out of chips' 
                                : 'You ran out of chips'}
                            </div>
                          </div>
                          <button
                            onClick={handlePlayAgain}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-lg transition-colors"
                          >
                            🔄 Play Again
                          </button>
                        </div>
                      ) : countdown !== null ? (
                        <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg text-center">
                          <div className="text-2xl font-bold text-white mb-2">
                            Next hand starting in...
                          </div>
                          <div className="text-6xl font-bold text-yellow-300 my-4">
                            {countdown}
                          </div>
                          <button
                            onClick={() => {
                              setCountdown(null);
                              handleAction('Skip Countdown');
                              actions.startNewHand();
                            }}
                            className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-lg transition-colors"
                          >
                            ⏭️ Skip
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <GameLog entries={gameLog} />
            <div className="mt-6 p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-semibold mb-3 text-gray-400 uppercase tracking-wider">Game Status</h3>
              <div className="text-xs text-gray-500 space-y-1.5">
                <div className="flex justify-between">
                  <span>Round</span>
                  <span className="text-gray-300 capitalize">{state.currentBettingRound}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your Chips</span>
                  <span className="text-gray-300">{myPlayer.chips}</span>
                </div>
                <div className="flex justify-between">
                  <span>Opponent Chips</span>
                  <span className="text-gray-300">{opponent.chips}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pot</span>
                  <span className="text-yellow-400 font-semibold">{state.pot}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">ZK Status</div>
                <div className="text-xs text-gray-400">
                  {state.currentBettingRound === 'showdown'
                    ? '🔐 Generating ZK proof…'
                    : '✅ Noir circuit active'}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                <a
                  href={`https://stellar.expert/explorer/testnet/contract/CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-purple-400 hover:underline truncate"
                >
                  🔗 Game Hub on Explorer
                </a>
                <a
                  href={`https://stellar.expert/explorer/testnet/contract/CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-purple-400 hover:underline truncate"
                >
                  🔗 Poker Contract
                </a>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-600 break-all">ID: {id}</div>
              </div>
            </div>

            {/* AI Chat Panel */}
            <div className="mt-4 flex flex-col bg-gray-800 rounded-lg overflow-hidden" style={{ height: '300px' }}>
              <div className="px-4 py-2 border-b border-gray-700">
                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  💬 {aiOpponent?.name ?? 'AI'} Chat
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {aiChatMessages.length === 0 && (
                  <div className="text-xs text-gray-600 text-center mt-4">Waiting for game to start…</div>
                )}
                {aiChatMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${!msg.fromAI ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                      !msg.fromAI
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                    }`}>{msg.text}</div>
                  </div>
                ))}
                <div ref={aiChatEndRef} />
              </div>
              <div className="px-3 py-2 border-t border-gray-700 flex gap-2">
                <input
                  type="text"
                  value={aiChatInput}
                  onChange={e => setAiChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && aiChatInput.trim()) {
                      sendAIMessage(aiChatInput.trim());
                      setAiChatInput('');
                    }
                  }}
                  placeholder="Say something…"
                  className="flex-1 bg-gray-700 text-white text-sm px-3 py-1.5 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => {
                    if (aiChatInput.trim()) {
                      sendAIMessage(aiChatInput.trim());
                      setAiChatInput('');
                    }
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                >➤</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
