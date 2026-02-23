import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

const inter = Inter({ subsets: ["latin"] });

// Suppress unhandled promise rejections from API/blockchain calls so the
// Next.js dev error overlay doesn't pop up for non-fatal network errors.
const SUPPRESS_ERRORS_SCRIPT = `
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', function(e) {
      var msg = (e.reason && e.reason.message) || String(e.reason || '');
      if (
        msg.includes('fetch') ||
        msg.includes('net::') ||
        msg.includes('NetworkError') ||
        msg.includes('Failed to fetch') ||
        msg.includes('TRY_AGAIN_LATER') ||
        msg.includes('tx_bad_seq') ||
        msg.includes('TIMEOUT') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('sign-transaction') ||
        msg.includes('sendTransaction') ||
        msg.includes('getAccount')
      ) {
        e.preventDefault();
      }
    });
  }
`;

export const metadata: Metadata = {
  title: "ZK Poker — Stellar Game Studio Hackathon",
  description: "Zero-Knowledge Texas Hold'em Poker on Stellar Testnet. Noir ZK circuits + Soroban smart contracts. Cards committed on-chain, hand rank proven without revealing hole cards.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SUPPRESS_ERRORS_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
