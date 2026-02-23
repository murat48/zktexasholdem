/**
 * ZK Proof Router
 * Routes proof generation to selected backend (Noir or RISC Zero).
 *
 * Noir  → Barretenberg WASM — READY ✅
 * RISC Zero → NethermindEth stellar-risc0-verifier — BETA ⏳
 *   Docs: https://dev.risczero.com/
 *   Verifier: https://github.com/NethermindEth/stellar-risc0-verifier
 */

import type { ZKBackend } from '@/components/ZKSetupWizard';
import { generateHandRankProof, type ProofInput, type ProofOutput } from './zkproof';

export { type ZKBackend };

const LS_KEY = 'zk_backend';

/** Save backend preference */
export function saveBackendChoice(backend: ZKBackend): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, backend);
  }
}

/** Read saved preference (default: 'noir') */
export function loadBackendChoice(): ZKBackend {
  if (typeof window === 'undefined') return 'noir';
  return (localStorage.getItem(LS_KEY) as ZKBackend) ?? 'noir';
}

/** Human-readable info for UI */
export function getBackendLabel(backend: ZKBackend) {
  return backend === 'risc0'
    ? { icon: '⚙️', name: 'RISC Zero', status: 'Beta' }
    : { icon: '🎨', name: 'Noir Lang', status: 'Active' };
}

/**
 * Generate a poker hand proof using the selected backend.
 *
 * @param input   - Proof inputs (cards, rank, commitment, salt)
 * @param backend - Which ZK system to use. Falls back to localStorage.
 */
export async function generateProof(
  input: ProofInput,
  backend?: ZKBackend
): Promise<ProofOutput> {
  const chosen = backend ?? loadBackendChoice();

  console.log(`🔐 Generating ZK proof [backend: ${chosen}]`);

  switch (chosen) {
    case 'noir':
      return generateNoirProof(input);

    case 'risc0':
      return generateRiscZeroProof(input);

    default:
      return generateNoirProof(input);
  }
}

// ─────────────────────────────────────────
// NOIR — Barretenberg WASM (READY ✅)
// ─────────────────────────────────────────

async function generateNoirProof(input: ProofInput): Promise<ProofOutput> {
  console.log('🎨 Noir: starting Barretenberg proof generation…');
  const result = await generateHandRankProof(input);
  console.log(`✅ Noir: proof ready (${result.proof.length} bytes)`);
  return result;
}

// ─────────────────────────────────────────
// RISC ZERO — NethermindEth verifier (BETA ⏳)
// Requires:
//   - circuits/guest/ — RISC-V guest program (Rust)
//   - circuits/host/  — proof generation host (Rust)
//   - /api/risc0-proof — Next.js API route calling host
//   - Deployed verifier contract from stellar-risc0-verifier
// ─────────────────────────────────────────

async function generateRiscZeroProof(input: ProofInput): Promise<ProofOutput> {
  console.log('⚙️ RISC Zero: requesting proof from host…');

  try {
    const res = await fetch('/api/risc0-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hole_cards: input.holeCards,
        community_cards: input.communityCards,
        claimed_rank: input.claimedRank,
        salt: input.salt,
      }),
    });

    if (!res.ok) {
      throw new Error(`RISC Zero API returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();

    const proof = new Uint8Array(
      Buffer.from(data.receipt as string, 'hex')
    );

    console.log(`✅ RISC Zero: receipt ready (${proof.length} bytes)`);

    return {
      proof,
      publicInputsRaw: new Uint8Array(0),  // RISC Zero doesn't have BN254 public inputs
      publicInputs: {
        commitment: input.commitment,
        communityCards: Array.from(input.communityCards),
        claimedRank: input.claimedRank,
      },
    };
  } catch (err: any) {
    console.warn('⚠️ RISC Zero proof failed, falling back to Noir:', err.message);
    // Graceful fallback — keeps the demo alive during Beta
    return generateNoirProof(input);
  }
}
