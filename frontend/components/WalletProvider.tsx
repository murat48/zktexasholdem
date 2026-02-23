'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useWallet } from '@/hooks/useWallet';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction?: (xdr: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWalletContext must be used within WalletProvider');
  }
  return context;
}
