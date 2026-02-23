'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PokerTable } from '@/components/PokerTable';
import { PlayerHand } from '@/components/PlayerHand';
import { CommunityCards } from '@/components/CommunityCards';
import { BettingControls } from '@/components/BettingControls';
import { ChipStack } from '@/components/ChipStack';
import { GameLog } from '@/components/GameLog';
import { useTexasHoldem } from '@/hooks/useTexasHoldem';
import type { TexasHoldemState } from '@/hooks/useTexasHoldem';
import { usePvP, type PvPAction, type ChatMessage } from '@/hooks/usePvP';
import { useWalletContext } from '@/components/WalletProvider';

// ─── HOST: full game logic + broadcast ────────────────────────────────────────

function HostGame({
  code,
  opponentAddress,
  pvp,
}: {
  code: string;
  opponentAddress: string;
  pvp: ReturnType<typeof usePvP>;
}) {
  const { address, signTransaction } = useWalletContext();
  const router = useRouter();
  const { state, isLoading, actions, isZkPending } = useTexasHoldem(
    `pvp-${code}`,
    address,
    signTransaction,
    opponentAddress,
  );

  const prevStateRef = useRef<TexasHoldemState | null>(null);
  // Stable ref so effects don't need `actions` in their dep arrays
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const [gameLog, setGameLog] = useState<{ timestamp: number; action: string; player: string; amount?: number }[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [forfeitOverlay, setForfeitOverlay] = useState<'me' | 'opponent' | null>(null);
  const pendingNewHandRef = useRef(false);
  const isZkPendingRef = useRef(isZkPending);
  isZkPendingRef.current = isZkPending;

  // Broadcast state to GUEST whenever it changes (use stable broadcastState callback)
  useEffect(() => {
    if (!state || state === prevStateRef.current) return;
    prevStateRef.current = state;
    pvp.broadcastState(state);
  }, [state, pvp.broadcastState]); // eslint-disable-line react-hooks/exhaustive-deps

  // If state just became available while a requestState was already pending, send it now
  useEffect(() => {
    if (!state) return;
    pvp.broadcastState(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state]); // fires exactly once when state transitions null → non-null

  // Apply pending action from GUEST via HTTP poll (reliable, SSE-independent).
  // Also handles the SSE-delivered pendingAction as an immediate fallback.
  const applyGuestAction = useCallback((action: { type: string; amount?: number }) => {
    const { type, amount } = action;
    console.log('📨 HOST applying GUEST action:', type, amount);
    if (type === 'requestState') {
      if (prevStateRef.current) pvp.broadcastState(prevStateRef.current);
      return;
    }
    switch (type) {
      case 'fold':         actionsRef.current.fold();              break;
      case 'check':        actionsRef.current.check();             break;
      case 'call':         actionsRef.current.call();              break;
      case 'bet':          amount && actionsRef.current.bet(amount); break;
      case 'startNewHand': actionsRef.current.startNewHand();      break;
      case 'forfeit':
        // GUEST forfeited → HOST (player 0) wins
        actionsRef.current.forfeit(0);
        setForfeitOverlay('opponent'); // "Opponent forfeited — you win"
        break;
    }
  }, [pvp.broadcastState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Primary path: poll HTTP endpoint every 400 ms.
  // This works even when SSE reconnects mid-game (the most common cause of lost actions).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pvp/pending/${code}`);
        if (!res.ok) return;
        const { action } = await res.json();
        if (action && !cancelled) applyGuestAction(action as { type: string; amount?: number });
      } catch {}
    };
    const id = setInterval(poll, 200);
    return () => { cancelled = true; clearInterval(id); };
  }, [code, applyGuestAction]);

  // Secondary path: if SSE delivers an action_request before the poll fires, apply immediately.
  useEffect(() => {
    if (!pvp.pendingAction) return;
    applyGuestAction(pvp.pendingAction as { type: string; amount?: number });
    pvp.clearPendingAction();
    // Also consume server-side so the HTTP poll doesn't double-apply
    fetch(`/api/pvp/pending/${code}`).catch(() => {});
  }, [pvp.pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // HOST leaves — forfeit: GUEST wins (player index 1)
  const handleLeave = useCallback(() => {
    if (!state) { pvp.disconnect(); router.push('/pvp/lobby'); return; }
    // Broadcast the forfeit state immediately so GUEST sees it before HOST disconnects
    const forfeitState: TexasHoldemState = {
      ...state,
      isGameOver: true,
      gameOverWinner: 1 as const,
      currentBettingRound: 'handover' as const,
      pot: 0,
    };
    pvp.broadcastState(forfeitState);
    actionsRef.current.forfeit(1); // also triggers notifyGameEnd locally
    setForfeitOverlay('me');
    setTimeout(() => { pvp.disconnect(); router.push('/pvp/lobby'); }, 3000);
  }, [state, pvp, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opponent disconnected mid-game → auto-win for HOST
  useEffect(() => {
    if (pvp.opponentConnected) return;
    if (!state || state.isGameOver) return;
    // Small delay: SSE jitter can briefly set opponentConnected=false on reconnect
    const t = setTimeout(() => {
      setForfeitOverlay('opponent');
      actionsRef.current.forfeit(0); // HOST wins
    }, 2500);
    return () => clearTimeout(t);
  }, [pvp.opponentConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown for next hand — mirrors AI game page, actions intentionally via ref
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
            setTimeout(() => actionsRef.current.startNewHand(), 100);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state?.currentBettingRound, state?.isGameOver, state?.lastHandWinner]); // actions via ref — intentional

  // Fire startNewHand as soon as ZK proof confirms (if countdown already expired)
  useEffect(() => {
    if (!isZkPending && pendingNewHandRef.current && state?.currentBettingRound === 'handover' && !state?.isGameOver) {
      pendingNewHandRef.current = false;
      setTimeout(() => actionsRef.current.startNewHand(), 100);
    }
  }, [isZkPending]); // actions via ref — intentional

  if (!state) {
    return <LoadingScreen />;
  }

  const myPlayerIndex = Math.max(0, state.players.findIndex(p => p.address === address)) as 0 | 1;
  return (
    <>
      {forfeitOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-4 p-10 bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl max-w-sm w-full mx-4">
            {forfeitOverlay === 'me' ? (
              <>
                <div className="text-5xl">🏳️</div>
                <h2 className="text-2xl font-bold text-white">You forfeited</h2>
                <p className="text-gray-400">Your opponent wins this match.</p>
              </>
            ) : (
              <>
                <div className="text-5xl">🎉</div>
                <h2 className="text-2xl font-bold text-white">You win!</h2>
                <p className="text-gray-400">Your opponent forfeited / disconnected.</p>
              </>
            )}
            <p className="text-sm text-gray-500">Returning to lobby in 3 seconds…</p>
          </div>
        </div>
      )}
      <GameLayout
        state={state}
        myPlayerIndex={myPlayerIndex}
        myAddress={address ?? ''}
        opponentLabel={opponentAddress}
        isHost
        setupPending={isLoading}
        actions={{
          fold: () => { logAction('Fold'); actionsRef.current.fold(); },
          check: () => { logAction('Check'); actionsRef.current.check(); },
          call: () => { logAction('Call'); actionsRef.current.call(); },
          bet: (amount: number) => { logAction('Bet', amount); actionsRef.current.bet(amount); },
          startNewHand: () => actionsRef.current.startNewHand(),
        }}
        countdown={countdown}
        setCountdown={setCountdown}
        skipCountdown={() => { setCountdown(null); actionsRef.current.startNewHand(); }}
        gameLog={gameLog}
        chatMessages={pvp.chatMessages}
        sendChat={pvp.sendChat}
        code={code}
        onLeave={handleLeave}
      />
    </>
  );

  function logAction(action: string, amount?: number) {
    setGameLog(prev => [...prev, { timestamp: Date.now(), action, player: address?.slice(0, 8) + '...', amount }]);
  }
}

// ─── GUEST: display synced state, send actions ────────────────────────────────

function GuestGame({
  code,
  opponentAddress,
  pvp,
}: {
  code: string;
  opponentAddress: string;
  pvp: ReturnType<typeof usePvP>;
}) {
  const { address } = useWalletContext();
  const router = useRouter();
  const [gameLog, setGameLog] = useState<{ timestamp: number; action: string; player: string; amount?: number }[]>([]);
  const [forfeitOverlay, setForfeitOverlay] = useState<'me' | 'opponent' | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Continuous state polling ──────────────────────────────────────────────
  // GUEST never fully trusts SSE delivery — poll HTTP on a fixed interval so
  // any missed/delayed broadcasts are healed automatically.
  // Also exposed via ref so actions can trigger an immediate re-poll.
  const doPoll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pvp/state/${code}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.gameState) pvp.receiveState(json.gameState);
    } catch {}
  }, [code, pvp.receiveState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Poll immediately on mount, then every 400 ms for the life of this component.
    doPoll();
    const id = setInterval(doPoll, 400);
    return () => clearInterval(id);
  }, [doPoll]);

  // After sending an action, poll quickly (HOST needs ~200 ms to process & broadcast)
  const pollSoon = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(doPoll, 100);
  }, [doPoll]);

  const state = pvp.syncedState as TexasHoldemState | null;

  // GUEST leaves — send forfeit signal to HOST then redirect
  const handleLeave = useCallback(() => {
    pvp.sendAction({ type: 'forfeit' });
    setForfeitOverlay('me');
    setTimeout(() => { pvp.disconnect(); router.push('/pvp/lobby'); }, 3000);
  }, [pvp, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opponent (HOST) disconnected mid-game → GUEST auto-wins
  useEffect(() => {
    if (pvp.opponentConnected) return;
    if (!state || state.isGameOver) return;
    const t = setTimeout(() => {
      setForfeitOverlay('opponent');
      setTimeout(() => { pvp.disconnect(); router.push('/pvp/lobby'); }, 3000);
    }, 2500);
    return () => clearTimeout(t);
  }, [pvp.opponentConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return <LoadingScreen message="Waiting for host to deal…" />;
  }

  // GUEST is always player index 1 (P2)
  const myPlayerIndex = 1 as 0 | 1;

  function logAction(action: string, amount?: number) {
    setGameLog(prev => [...prev, { timestamp: Date.now(), action, player: address?.slice(0, 8) + '...', amount }]);
  }

  const guestActions = {
    fold:         () => { logAction('Fold');      pvp.sendAction({ type: 'fold'        }); pollSoon(); },
    check:        () => { logAction('Check');     pvp.sendAction({ type: 'check'       }); pollSoon(); },
    call:         () => { logAction('Call');      pvp.sendAction({ type: 'call'        }); pollSoon(); },
    bet: (n: number) => { logAction('Bet', n);   pvp.sendAction({ type: 'bet', amount: n }); pollSoon(); },
    startNewHand: () => { pvp.sendAction({ type: 'startNewHand' }); pollSoon(); },
  };

  return (
    <>
      {forfeitOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-4 p-10 bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl max-w-sm w-full mx-4">
            {forfeitOverlay === 'me' ? (
              <>
                <div className="text-5xl">🏳️</div>
                <h2 className="text-2xl font-bold text-white">You forfeited</h2>
                <p className="text-gray-400">Your opponent wins this match.</p>
              </>
            ) : (
              <>
                <div className="text-5xl">🎉</div>
                <h2 className="text-2xl font-bold text-white">You win!</h2>
                <p className="text-gray-400">Your opponent forfeited / disconnected.</p>
              </>
            )}
            <p className="text-sm text-gray-500">Returning to lobby in 3 seconds…</p>
          </div>
        </div>
      )}
      <GameLayout
        state={state}
        myPlayerIndex={myPlayerIndex}
        myAddress={address ?? ''}
        opponentLabel={opponentAddress}
        isHost={false}
        actions={guestActions}
        countdown={null}
        setCountdown={() => {}}
        skipCountdown={() => pvp.sendAction({ type: 'startNewHand' })}
        gameLog={gameLog}
        chatMessages={pvp.chatMessages}
        sendChat={pvp.sendChat}
        code={code}
        onLeave={handleLeave}
      />
    </>
  );
}

// ─── Shared game layout (mirrors app/game/[id]/page.tsx) ──────────────────────

function GameLayout({
  state,
  myPlayerIndex,
  myAddress,
  opponentLabel,
  isHost,
  setupPending,
  actions,
  countdown,
  setCountdown,
  skipCountdown,
  gameLog,
  chatMessages,
  sendChat,
  code,
  onLeave,
}: {
  state: TexasHoldemState;
  myPlayerIndex: 0 | 1;
  myAddress: string;
  opponentLabel: string;
  isHost: boolean;
  setupPending?: boolean;
  actions: { fold(): void; check(): void; call(): void; bet(n: number): void; startNewHand(): void };
  countdown: number | null;
  setCountdown: (n: number | null) => void;
  skipCountdown: () => void;
  gameLog: { timestamp: number; action: string; player: string; amount?: number }[];
  chatMessages: ChatMessage[];
  sendChat: (text: string) => void;
  code: string;
  onLeave?: () => void;
}) {
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  const opponent = state.players[1 - myPlayerIndex];
  const myPlayer = state.players[myPlayerIndex];
  const isMyTurn = state.currentPlayer === myPlayerIndex;

  const myBetThisRound  = state.roundBets[myPlayer?.address] || 0;
  const oppBetThisRound = state.roundBets[opponent?.address] || 0;
  const callAmount      = Math.max(0, state.highestBet - myBetThisRound);
  const canCheck        = callAmount === 0;
  const minBet          = state.highestBet + 10;
  const myTotalPossibleBet  = myBetThisRound  + (myPlayer?.chips  ?? 0);
  const oppTotalPossibleBet = oppBetThisRound + (opponent?.chips ?? 0);
  const maxBet          = Math.min(myTotalPossibleBet, oppTotalPossibleBet);

  const showHandover = state.currentBettingRound === 'showdown' || state.currentBettingRound === 'handover';

  return (
    <main className="min-h-screen p-8 bg-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            {onLeave ? (
              <button
                onClick={onLeave}
                className="text-gray-400 hover:text-red-400 transition-colors text-sm"
                title="Leave game (you will forfeit)"
              >
                🚪 Leave
              </button>
            ) : (
              <a href="/pvp/lobby" className="text-gray-400 hover:text-white transition-colors text-sm">← Lobby</a>
            )}
            <h1 className="text-3xl font-bold">ZK Poker ⚔️</h1>
            <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">PvP</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isHost ? 'bg-yellow-800 text-yellow-200' : 'bg-green-800 text-green-200'}`}>
              {isHost ? '👑 Host' : '🎮 Guest'}
            </span>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">Room</div>
            <div className="font-mono font-bold text-yellow-400">{code}</div>
          </div>
        </div>

        {setupPending && (
          <div className="mb-6 flex items-center gap-3 px-5 py-3 bg-yellow-900/60 border border-yellow-700 rounded-xl text-yellow-200 text-sm animate-pulse">
            <span className="text-xl">⛓️</span>
            <span>Setting up game on Stellar blockchain… Betting will unlock when ready.</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <PokerTable pot={state.pot}>
              <div className="space-y-8">
                {/* Opponent */}
                <div className="flex justify-between items-center">
                  <ChipStack amount={opponent?.chips ?? 0} />
                  <PlayerHand
                    cards={
                      (state.currentBettingRound === 'showdown' || state.currentBettingRound === 'handover') && !opponent?.hasFolded
                        ? opponent?.holeCards ?? [0, 1]
                        : [0, 1]
                    }
                    position="top"
                    isHidden={
                      !((state.currentBettingRound === 'showdown' || state.currentBettingRound === 'handover') && !opponent?.hasFolded)
                    }
                  />
                  <div className="text-white">
                    <div className="font-semibold text-sm mb-0.5">Opponent</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {opponentLabel.slice(0, 8)}…{opponentLabel.slice(-6)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Bet: {oppBetThisRound}</div>
                    {opponent?.hasFolded && <div className="text-xs text-red-500 mt-1">🚫 Folded</div>}
                  </div>
                </div>

                <CommunityCards cards={state.communityCards} round={state.currentBettingRound} />

                {/* My Hand */}
                <div className="flex justify-between items-center">
                  <ChipStack amount={myPlayer?.chips ?? 0} />
                  <PlayerHand
                    cards={myPlayer?.holeCards ?? [0, 1]}
                    position="bottom"
                    isHidden={false}
                  />
                  <div className="text-white">
                    <div className="font-semibold text-sm mb-0.5">You</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {myAddress.slice(0, 8)}…{myAddress.slice(-6)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Bet: {myBetThisRound}</div>
                  </div>
                </div>
              </div>
            </PokerTable>

            {/* Betting / Status */}
            <div className="mt-8">
              <div className="mb-4 p-4 bg-blue-900 rounded-lg">
                <div className="text-sm text-blue-200">
                  {state.currentBettingRound === 'preflop' && '🎮 Pre-Flop'}
                  {state.currentBettingRound === 'flop'    && '🃏 Flop'}
                  {state.currentBettingRound === 'turn'    && '🃏 Turn'}
                  {state.currentBettingRound === 'river'   && '🃏 River'}
                  {state.currentBettingRound === 'showdown'&& '🎯 Showdown!'}
                  {state.currentBettingRound === 'handover'&& '✅ Hand Over'}
                </div>
                <div className="text-2xl font-bold text-white mt-1">Pot: {state.pot} 💰</div>
              </div>

              {!showHandover && (
                <>
                  {isMyTurn && !myPlayer?.hasFolded ? (
                    <BettingControls
                      onFold={actions.fold}
                      onCheck={actions.check}
                      onCall={actions.call}
                      onBet={actions.bet}
                      canCheck={canCheck}
                      callAmount={callAmount}
                      minBet={minBet}
                      maxBet={maxBet}
                      disabled={setupPending ?? false}
                    />
                  ) : (
                    <div className="text-center p-6 bg-gray-800 rounded-lg">
                      {myPlayer?.hasFolded
                        ? <p className="text-red-500 font-medium">🚫 You folded this hand</p>
                        : <p className="text-yellow-500 font-medium">⏳ Waiting for opponent…</p>
                      }
                    </div>
                  )}
                </>
              )}

              {showHandover && (
                <div className="space-y-4">
                  {state.lastHandWinner !== undefined && (
                    <div className="p-6 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-lg text-center">
                      {state.lastHandWinner === 'tie' ? (
                        <>
                          <div className="text-3xl font-bold text-white mb-2">🤝 TIE!</div>
                          <div className="text-lg text-yellow-100">Pot split: {state.lastHandWinAmount} chips each</div>
                        </>
                      ) : (
                        <>
                          <div className="text-3xl font-bold text-white mb-2">
                            {state.lastHandWinner === myPlayerIndex ? '🎉 YOU WIN!' : '😢 OPPONENT WINS'}
                          </div>
                          <div className="text-lg text-yellow-100">
                            {state.lastHandWinner === myPlayerIndex ? 'You won' : 'Opponent won'} {state.lastHandWinAmount} chips
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {state.currentBettingRound === 'handover' && (
                    state.isGameOver ? (
                      <div className="space-y-4">
                        <div className="p-6 bg-gradient-to-r from-red-600 to-red-800 rounded-lg text-center">
                          <div className="text-3xl font-bold text-white mb-2">🏁 GAME OVER!</div>
                          {state.gameOverWinner !== undefined && (
                            <div className="text-xl text-red-100 mb-3">
                              {state.gameOverWinner === myPlayerIndex ? '🎊 YOU WON THE MATCH!' : '😢 Opponent won the match'}
                            </div>
                          )}
                        </div>
                        <a
                          href="/pvp/lobby"
                          className="block w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-lg transition-colors text-center"
                        >
                          🔄 Play Again
                        </a>
                      </div>
                    ) : countdown !== null ? (
                      <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg text-center">
                        <div className="text-2xl font-bold text-white mb-2">Next hand in…</div>
                        <div className="text-6xl font-bold text-yellow-300 my-4">{countdown}</div>
                        <button
                          onClick={skipCountdown}
                          className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-lg transition-colors"
                        >
                          ⏭ Skip
                        </button>
                      </div>
                    ) : (
                      <div className="text-center p-6 bg-gray-800 rounded-lg text-gray-400">
                        ⏳ Waiting for next hand…
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="flex flex-col gap-4">
            {/* Game Status */}
            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-semibold mb-3 text-gray-400 uppercase tracking-wider">Game Status</h3>
              <div className="text-xs text-gray-500 space-y-1.5">
                <div className="flex justify-between">
                  <span>Round</span>
                  <span className="text-gray-300 capitalize">{state.currentBettingRound}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your Chips</span>
                  <span className="text-gray-300">{myPlayer?.chips}</span>
                </div>
                <div className="flex justify-between">
                  <span>Opponent Chips</span>
                  <span className="text-gray-300">{opponent?.chips}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pot</span>
                  <span className="text-yellow-400 font-semibold">{state.pot}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dealer</span>
                  <span className="text-gray-300">{state.dealerButton === myPlayerIndex ? 'You' : 'Opponent'}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-600 break-all">
                Room: {code}
              </div>
            </div>

            {/* ZK Status + Links */}
            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">ZK Status</div>
              <div className="text-xs text-gray-400">
                {state.currentBettingRound === 'showdown'
                  ? '🔐 Generating ZK proof…'
                  : '✅ Noir circuit active'}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                <a
                  href="https://stellar.expert/explorer/testnet/contract/CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-purple-400 hover:underline truncate"
                >
                  🔗 Game Hub on Explorer
                </a>
                <a
                  href="https://stellar.expert/explorer/testnet/contract/CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-purple-400 hover:underline truncate"
                >
                  🔗 Poker Contract
                </a>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-600 break-all">
                ID: pvp-{code}
              </div>
            </div>

            {/* Chat */}
            <div className="flex flex-col bg-gray-800 rounded-lg overflow-hidden" style={{ height: '340px' }}>
              <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">💬 Chat</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-gray-600 text-center mt-4">No messages yet. Say something! 👋</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.mine ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm break-words ${
                      msg.mine
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-gray-600 mt-0.5 px-1">
                      {msg.mine ? 'You' : msg.from}
                    </span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="px-3 py-2 border-t border-gray-700 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && chatInput.trim()) {
                      sendChat(chatInput);
                      setChatInput('');
                    }
                  }}
                  placeholder="Type a message…"
                  className="flex-1 bg-gray-700 text-white text-sm px-3 py-1.5 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  onClick={() => { if (chatInput.trim()) { sendChat(chatInput); setChatInput(''); } }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen({ message = 'Loading game…' }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900">
      <div className="text-center text-white">
        <div className="text-4xl mb-4 animate-pulse">🃏</div>
        <div className="text-xl">{message}</div>
      </div>
    </main>
  );
}

// ─── Page entry ───────────────────────────────────────────────────────────────

export default function PvPGamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const searchParams = useSearchParams();
  const urlRole = searchParams.get('role') as 'host' | 'guest' | null;

  const pvp = usePvP();
  const { address, isConnected, connect } = useWalletContext();

  // Fallback opponent address for GUEST: resolves from HTTP poll when pvp.opponentAddress
  // hasn't been restored yet (SSR hydration can nullify the sessionStorage lazy initializer).
  const [resolvedOpp, setResolvedOpp] = useState<string | null>(null);

  // GUEST: poll HTTP state endpoint until we have both syncedState AND opponentAddress.
  // Runs at PvPGamePage level so it fires immediately on navigation (no mount-order race).
  useEffect(() => {
    const role = pvp.role ?? urlRole;
    if (role !== 'guest') return;
    // Stop when both pieces of data are resolved
    const hasOpp = !!(pvp.opponentAddress ?? resolvedOpp);
    if (pvp.syncedState && hasOpp) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/pvp/state/${code.toUpperCase()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (json.gameState) pvp.receiveState(json.gameState);
        // Also grab p1Address to resolve opponentAddress even if SSE hasn't fired yet
        if (json.p1Address && !pvp.opponentAddress) setResolvedOpp(json.p1Address);
      } catch {}
    };

    poll(); // immediate first fetch
    const id = setInterval(poll, 600);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pvp.syncedState, !!(pvp.opponentAddress ?? resolvedOpp), pvp.role ?? urlRole, code]);

  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h2 className="text-2xl font-bold text-white">Connect wallet to play</h2>
          <button onClick={connect} className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl">
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  // Determine role from URL param or pvp hook
  const role = pvp.role ?? urlRole;
  // opponentAddress: prefer live value, fall back to HTTP-polled value for GUEST
  const opponentAddress = pvp.opponentAddress ?? resolvedOpp;

  if (!opponentAddress) {
    return <LoadingScreen message="Waiting for opponent to connect…" />;
  }

  return role === 'host' ? (
    <HostGame code={code.toUpperCase()} opponentAddress={opponentAddress} pvp={pvp} />
  ) : (
    <GuestGame code={code.toUpperCase()} opponentAddress={opponentAddress} pvp={pvp} />
  );
}
