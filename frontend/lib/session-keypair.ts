/**
 * Session Keypair — ephemeral Stellar keypair for PvP game actions.
 *
 * Why: Wallet (Freighter / xBull / …) popup on every fold/bet/call is
 * unplayable. Instead each player generates a throwaway keypair at game start,
 * stores it in sessionStorage (cleared when tab closes), and uses it to
 * auto-sign all in-game contract calls.
 *
 * Real wallet is required ONLY once per game: to sign the ZK proof at showdown.
 */

import * as StellarSDK from '@stellar/stellar-sdk';

const SESSION_SECRET_KEY = 'pvp_session_secret';
const SESSION_PUBLIC_KEY  = 'pvp_session_pub';

export interface SessionKeypair {
  publicKey: string;
  secretKey: string;
}

/** Generate a fresh ephemeral keypair and persist it for the current tab. */
export function generateSessionKeypair(): SessionKeypair {
  if (typeof window === 'undefined') throw new Error('Browser only');
  const kp = StellarSDK.Keypair.random();
  sessionStorage.setItem(SESSION_SECRET_KEY, kp.secret());
  sessionStorage.setItem(SESSION_PUBLIC_KEY,  kp.publicKey());
  return { secretKey: kp.secret(), publicKey: kp.publicKey() };
}

/** Return the stored session keypair, generating one if needed. */
export function getOrCreateSessionKeypair(): SessionKeypair {
  if (typeof window === 'undefined') throw new Error('Browser only');
  const secret = sessionStorage.getItem(SESSION_SECRET_KEY);
  const pub    = sessionStorage.getItem(SESSION_PUBLIC_KEY);
  if (secret && pub) return { secretKey: secret, publicKey: pub };
  return generateSessionKeypair();
}

/** Clear session keypair (call on disconnect / game end). */
export function clearSessionKeypair(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_SECRET_KEY);
  sessionStorage.removeItem(SESSION_PUBLIC_KEY);
}

/**
 * Sign a Stellar transaction XDR with the session keypair.
 * Used instead of wallet popup for every game action.
 *
 * @param xdr  — prepared transaction XDR (base64)
 * @returns signed XDR (base64)
 */
export function signWithSessionKeypair(xdr: string): string {
  const { secretKey } = getOrCreateSessionKeypair();
  const kp = StellarSDK.Keypair.fromSecret(secretKey);
  const envelope = StellarSDK.xdr.TransactionEnvelope.fromXDR(xdr, 'base64');
  const tx = new StellarSDK.Transaction(envelope, StellarSDK.Networks.TESTNET);
  tx.sign(kp);
  return tx.toEnvelope().toXDR('base64');
}
