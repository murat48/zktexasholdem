'use client';

import { useState, useEffect, useRef } from 'react';
import {
  StellarWalletsKit,
  WalletNetwork,
  FreighterModule,
  xBullModule,
  AlbedoModule,
  LobstrModule,
  HanaModule,
  HotWalletModule,
  KleverModule,
} from '@creit.tech/stellar-wallets-kit';

// ── Singleton kit instance (browser-only) ──────────────────────────────────
// Lazily initialised on first use to avoid SSR issues in Next.js.
let kitInstance: StellarWalletsKit | null = null;

function getKit(): StellarWalletsKit {
  if (!kitInstance) {
    kitInstance = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      modules: [
        new FreighterModule(),
        new xBullModule(),
        new AlbedoModule(),
        new LobstrModule(),
        new HanaModule(),
        new HotWalletModule(),
        new KleverModule(),
      ],
    });
  }
  return kitInstance;
}

// ── Hook ───────────────────────────────────────────────────────────────────
interface WalletState {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction?: (xdr: string) => Promise<string>;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const connectingRef = useRef(false);

  // ── connect ───────────────────────────────────────────────────────────────
  const connect = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    try {
      const kit = getKit();
      console.log('🔗 Opening Stellar Wallets Kit modal...');

      await new Promise<void>((resolve, reject) => {
        kit.openModal({
          onWalletSelected: async (option) => {
            try {
              kit.setWallet(option.id);
              const { address: addr } = await kit.getAddress();
              setAddress(addr);
              setConnected(true);
              localStorage.setItem('wallet_address', addr);
              localStorage.setItem('wallet_id', option.id);
              console.log('✅ Wallet connected:', addr, '(', option.name, ')');
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          onClosed: (err) => {
            if (err) reject(err);
            else resolve(); // closed without selecting
          },
        });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ Connection failed:', msg);
      alert('Wallet connection failed:\n\n' + msg);
    } finally {
      connectingRef.current = false;
    }
  };

  // ── disconnect ────────────────────────────────────────────────────────────
  const disconnect = () => {
    try {
      getKit().disconnect().catch(() => {});
    } catch {}
    setAddress(null);
    setConnected(false);
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('wallet_id');
    console.log('👋 Wallet disconnected');
  };

  // ── signTransaction ───────────────────────────────────────────────────────
  const signTx = async (xdr: string): Promise<string> => {
    const addr = address;
    if (!addr) throw new Error('Wallet not connected');
    console.log('📝 Requesting transaction signature...');
    const kit = getKit();
    const { signedTxXdr } = await kit.signTransaction(xdr, {
      networkPassphrase: WalletNetwork.TESTNET,
      address: addr,
    });
    if (!signedTxXdr) throw new Error('Wallet returned empty signedTxXdr');
    console.log('✅ Transaction signed');
    return signedTxXdr;
  };

  // ── Auto-reconnect on mount ───────────────────────────────────────────────
  useEffect(() => {
    const savedAddress = localStorage.getItem('wallet_address');
    const savedWalletId = localStorage.getItem('wallet_id');
    if (!savedAddress || !savedWalletId) return;

    const kit = getKit();
    kit.setWallet(savedWalletId);

    kit.getAddress({ skipRequestAccess: true })
      .then(({ address: addr }) => {
        if (addr === savedAddress) {
          setAddress(addr);
          setConnected(true);
          console.log('✅ Auto-reconnected:', addr);
        } else {
          localStorage.removeItem('wallet_address');
          localStorage.removeItem('wallet_id');
        }
      })
      .catch(() => {
        // Wallet not available or access revoked — silently skip
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('wallet_id');
      });
  }, []);

  return {
    address,
    isConnected: connected,
    connect,
    disconnect,
    signTransaction: signTx,
  };
}
