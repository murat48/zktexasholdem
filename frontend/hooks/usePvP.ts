'use client';

/**
 * usePvP — Player vs Player game sync via SSE.
 *
 * Architecture:
 *   HOST (P1, room creator): runs full game logic (useTexasHoldem),
 *     broadcasts state to SSE after every change, receives P2 action requests.
 *
 *   GUEST (P2, code joiner): state is entirely driven by SSE state_update events,
 *     actions are sent as requests to the SSE server → relayed to HOST → applied
 *     locally by HOST → new state broadcast back.
 *
 * Wallet signatures:
 *   fold / bet / call → DEPLOYER auto-signs (same as AI mode, no popup)
 *   ZK showdown proof  → real wallet signs ONCE per game
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrCreateSessionKeypair } from '@/lib/session-keypair';

export type PvPRole = 'host' | 'guest';

export interface PvPAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'startNewHand' | 'requestState' | 'forfeit';
  amount?: number;
}

export interface ChatMessage {
  id: string;
  from: string;   // wallet address (short)
  text: string;
  ts: number;
  mine: boolean;
}

interface UsePvPReturn {
  role: PvPRole | null;
  roomCode: string | null;
  opponentAddress: string | null;
  opponentConnected: boolean;
  syncedState: unknown | null;
  isPvPLoading: boolean;
  errorMessage: string | null;
  chatMessages: ChatMessage[];
  broadcastState: (state: unknown) => void;
  sendAction: (action: PvPAction) => void;
  receiveState: (state: unknown) => void;
  sendChat: (text: string) => void;
  pendingAction: PvPAction | null;
  clearPendingAction: () => void;
  createRoom: (walletAddress: string) => Promise<string>;
  joinRoom: (code: string, walletAddress: string) => Promise<void>;
  disconnect: () => void;
}

const SESSION_KEY = 'pvp_session';

interface PersistedSession {
  role: PvPRole;
  roomCode: string;
  opponentAddress: string;
  walletAddress: string;
}

function saveSession(s: PersistedSession) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}
function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export function usePvP(): UsePvPReturn {
  // ── Lazy initializers: read sessionStorage synchronously on first render ──
  // This eliminates the useEffect-delay that caused "Waiting for opponent"
  // flash after lobby → game page navigation.
  const [role, setRole] = useState<PvPRole | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadSession()?.role ?? null;
  });
  const [roomCode, setRoomCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadSession()?.roomCode ?? null;
  });
  const [opponentAddress, setOpponentAddress] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadSession()?.opponentAddress ?? null;
  });
  const [opponentConnected, setOpponentConnected] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !!loadSession()?.opponentAddress;
  });
  const [syncedState, setSyncedState] = useState<unknown | null>(null);
  const [isPvPLoading, setIsPvPLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PvPAction | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const sseRef      = useRef<EventSource | null>(null);
  const walletRef   = useRef<string>('');
  const roomCodeRef = useRef<string>(loadSession()?.roomCode ?? '');
  const roleRef     = useRef<PvPRole | null>(loadSession()?.role ?? null);

  const setRoleSync = (r: PvPRole) => {
    roleRef.current = r;
    setRole(r);
  };

  // ── SSE connect ────────────────────────────────────────────────────────────
  const connectSSE = useCallback((code: string, walletAddress: string) => {
    sseRef.current?.close();
    const es = new EventSource(
      `/api/pvp/room/${code.toUpperCase()}?wallet=${encodeURIComponent(walletAddress)}`
    );

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case 'room_waiting':
            console.log('⌛ PvP: waiting for opponent…');
            break;

          case 'game_start': {
            console.log('🎮 PvP: game start!', msg.p1.walletAddress, 'vs', msg.p2.walletAddress);
            const oppAddr = msg.p1.walletAddress === walletAddress
              ? msg.p2.walletAddress
              : msg.p1.walletAddress;
            setOpponentConnected(true);
            setOpponentAddress(oppAddr);
            setIsPvPLoading(false);
            // Persist so the game page can restore after navigation
            if (roleRef.current) {
              saveSession({
                role: roleRef.current,
                roomCode: code.toUpperCase(),
                opponentAddress: oppAddr,
                walletAddress,
              });
            }
            break;
          }

          case 'state_update':
            // Only GUEST applies incoming state
            if (roleRef.current === 'guest' || !roleRef.current) {
              setSyncedState(msg.state);
            }
            break;

          case 'action_request':
            // Only HOST receives action requests
            if (roleRef.current === 'host') {
              setPendingAction(msg.action as PvPAction);
            }
            break;

          case 'chat':
            setChatMessages(prev => [...prev, {
              id: `${msg.ts}-${msg.from}`,
              from: (msg.from as string).slice(0, 6) + '…',
              text: msg.text as string,
              ts: msg.ts as number,
              mine: msg.from === walletRef.current,
            }]);
            break;

          case 'opponent_disconnected':
            setOpponentConnected(false);
            setErrorMessage('Opponent disconnected.');
            break;

          case 'ping':
            break; // keepalive
        }
      } catch {}
    };

    es.onerror = () => {
      console.warn('PvP SSE error — will reconnect');
      // Browser auto-reconnects EventSource
    };

    sseRef.current = es;
  }, []);

  // ── Reconnect SSE on mount if session exists ──────────────────────────────
  // Also unconditionally restores React state from sessionStorage because
  // Next.js App Router SSR renders with typeof window === 'undefined', so
  // all lazy initializers return null on the server. After client hydration
  // React may still start with null (depends on build mode). By always
  // setting these here we guarantee a stable, correct state within the first
  // useEffect tick regardless of SSR hydration behaviour.
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;

    // Always restore — React bails out if the value hasn't changed (Object.is).
    setRole(saved.role);
    setRoomCode(saved.roomCode); roomCodeRef.current = saved.roomCode;
    setOpponentAddress(saved.opponentAddress);
    setOpponentConnected(true);
    roleRef.current  = saved.role;
    walletRef.current = saved.walletAddress;

    if (sseRef.current) return; // SSE already connected (lobby → game navigation)
    console.log('♻️ PvP: reconnecting SSE for', saved.roomCode);
    connectSSE(saved.roomCode, saved.walletAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create room (HOST) ─────────────────────────────────────────────────────
  const createRoom = useCallback(async (walletAddress: string): Promise<string> => {
    setIsPvPLoading(true);
    setErrorMessage(null);
    const { publicKey: sessionPub } = getOrCreateSessionKeypair();
    walletRef.current = walletAddress;

    const res = await fetch('/api/pvp/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, sessionPub }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { code } = await res.json();

    setRoleSync('host');
    setRoomCode(code);
    roomCodeRef.current = code;
    connectSSE(code, walletAddress);
    return code;
  }, [connectSSE]);

  // ── Join room (GUEST) ──────────────────────────────────────────────────────
  const joinRoom = useCallback(async (code: string, walletAddress: string): Promise<void> => {
    setIsPvPLoading(true);
    setErrorMessage(null);
    const { publicKey: sessionPub } = getOrCreateSessionKeypair();
    walletRef.current = walletAddress;

    // Set role/code BEFORE SSE connect so the game_start handler sees correct role
    const upperCode = code.toUpperCase();
    setRoleSync('guest');
    setRoomCode(upperCode);
    roomCodeRef.current = upperCode;

    // Connect SSE first so we don't miss the game_start broadcast
    connectSSE(upperCode, walletAddress);

    const res = await fetch('/api/pvp/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: upperCode, walletAddress, sessionPub }),
    });
    if (!res.ok) {
      sseRef.current?.close();
      setIsPvPLoading(false);
      setRoleSync('guest'); // keep, just cleanup loading
      throw new Error(await res.text());
    }

    const { p1Address } = await res.json();
    setOpponentAddress(p1Address);
    setOpponentConnected(true);
    // Persist immediately so game page can restore after navigation
    saveSession({ role: 'guest', roomCode: upperCode, opponentAddress: p1Address, walletAddress });
  }, [connectSSE]);

  // ── HOST: push state to relay ──────────────────────────────────────────────
  const broadcastState = useCallback((state: unknown) => {
    const code = roomCodeRef.current;
    if (!code) return;
    fetch('/api/pvp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, from: 'p1', payload: state }),
    }).catch(() => {});
  }, []);

  // ── GUEST: send action request ─────────────────────────────────────────────
  const sendAction = useCallback((action: PvPAction) => {
    const code = roomCodeRef.current;
    if (!code) return;
    fetch('/api/pvp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, from: 'p2', payload: action }),
    }).catch(() => {});
  }, []);

  const clearPendingAction = useCallback(() => setPendingAction(null), []);

  // Allow GuestGame to inject state fetched via HTTP poll
  const receiveState = useCallback((state: unknown) => {
    setSyncedState(state);
  }, []);

  // ── Chat ────────────────────────────────────────────────────────────────────
  const sendChat = useCallback((text: string) => {
    const code = roomCodeRef.current;
    const wallet = walletRef.current;
    if (!code || !text.trim()) return;
    fetch('/api/pvp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        from: 'chat',
        payload: { from: wallet, text: text.trim(), ts: Date.now() },
      }),
    }).catch(() => {});
  }, []);

  const disconnect = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
    clearSession();
    roleRef.current = null;
    setRole(null);
    setRoomCode(null);
    setOpponentAddress(null);
    setOpponentConnected(false);
    setSyncedState(null);
    setIsPvPLoading(false);
    setErrorMessage(null);
    setChatMessages([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  return {
    role,
    roomCode,
    opponentAddress,
    opponentConnected,
    syncedState,
    isPvPLoading,
    errorMessage,
    broadcastState,
    sendAction,
    receiveState,
    sendChat,
    chatMessages,
    pendingAction,
    clearPendingAction,
    createRoom,
    joinRoom,
    disconnect,
  };
}
