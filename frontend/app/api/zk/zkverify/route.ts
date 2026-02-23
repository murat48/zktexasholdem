/**
 * zkVerify Integration — Server-side API route
 *
 * Two-layer real cryptographic verification:
 *   Layer 1: Local `bb verify` — Barretenberg UltraHonk pairing check (~2s)
 *   Layer 2: zkVerify blockchain — on-chain verification via zkverifyjs SDK
 *
 * Flow:
 *   1. Receive raw proof + publicInputs (base64) from client
 *   2. Run `bb verify` locally — real UltraHonk elliptic curve verification
 *   3. Submit proof to zkVerify Volta testnet via zkverifyjs SDK
 *   4. Return attestation + verification results
 *
 * zkVerify is a Substrate-based blockchain that runs the actual ZK pairing
 * check (BN254 elliptic curve verification equation) on-chain.  This creates
 * an immutable attestation that can be cross-referenced from Stellar.
 *
 * Docs: https://docs.zkverify.io
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ── Configuration ────────────────────────────────────────────────────────────
const BB_BIN = process.env.BB_BIN || path.join(os.homedir(), '.bb', 'bb');
const CIRCUITS_DIR = path.resolve(process.cwd(), '..', 'circuits');
const VK_PATH = path.join(CIRCUITS_DIR, 'target', 'vk', 'vk');

// zkVerify — Volta testnet (Substrate)
const ZKVERIFY_SEED = process.env.ZKVERIFY_SEED_PHRASE || '';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZkVerifyRequest {
  proof: string;           // base64-encoded raw UltraHonk proof bytes (~16KB)
  publicInputs: string;    // base64-encoded raw public inputs (224 bytes for 7 fields)
  localVerify?: boolean;   // also run `bb verify` locally (default: true)
}

export interface ZkVerifyResponse {
  verified: boolean;
  attestationId: string | null;
  localVerified: boolean;
  zkVerifyTxHash: string | null;
  blockHash: string | null;
  proofType: string;
  error?: string;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let tmpDir: string | null = null;

  try {
    const body: ZkVerifyRequest = await req.json();
    const { proof: proofBase64, publicInputs: pubBase64 } = body;
    const doLocalVerify = body.localVerify !== false;

    if (!proofBase64) {
      return NextResponse.json({ error: 'Missing proof' }, { status: 400 });
    }

    const proofBytes = Buffer.from(proofBase64, 'base64');
    const pubBytes = pubBase64 ? Buffer.from(pubBase64, 'base64') : Buffer.alloc(0);

    console.log('[zkverify] Proof size:', proofBytes.length, 'bytes');
    console.log('[zkverify] Public inputs size:', pubBytes.length, 'bytes');

    // ── Layer 1: Local `bb verify` — real UltraHonk pairing check ──────────
    let localVerified = false;
    if (doLocalVerify && fs.existsSync(BB_BIN) && fs.existsSync(VK_PATH)) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zkverify-'));

      const proofFile = path.join(tmpDir, 'proof');
      const pubFile = path.join(tmpDir, 'public_inputs');
      fs.writeFileSync(proofFile, proofBytes);
      if (pubBytes.length > 0) {
        fs.writeFileSync(pubFile, pubBytes);
      }

      console.log('[zkverify] Running local bb verify (UltraHonk pairing check)...');
      const bbResult = spawnSync(
        BB_BIN,
        [
          'verify',
          '-p', proofFile,
          '-i', pubFile,
          '-k', VK_PATH,
        ],
        {
          cwd: tmpDir,
          timeout: 60000,
          encoding: 'utf8',
          env: { ...process.env, HOME: os.homedir() },
        }
      );

      localVerified = bbResult.status === 0;
      if (localVerified) {
        console.log('[zkverify] ✅ bb verify PASSED — proof is cryptographically valid');
      } else {
        console.warn('[zkverify] ❌ bb verify FAILED — proof is INVALID');
        console.warn('[zkverify] stderr:', bbResult.stderr?.slice(0, 500));
        console.warn('[zkverify] stdout:', bbResult.stdout?.slice(0, 500));
      }
    } else {
      const missing: string[] = [];
      if (!fs.existsSync(BB_BIN)) missing.push('bb binary');
      if (!fs.existsSync(VK_PATH)) missing.push('verification key');
      console.warn('[zkverify] Skipping local verify — missing:', missing.join(', ') || 'localVerify=false');
    }

    // ── Layer 2: zkVerify blockchain — decentralized on-chain verification ──
    let attestationId: string | null = null;
    let zkVerifyTxHash: string | null = null;
    let blockHash: string | null = null;
    let zkVerified = false;

    if (!ZKVERIFY_SEED) {
      console.warn('[zkverify] ZKVERIFY_SEED_PHRASE not set — skipping zkVerify chain submission');
      console.log('[zkverify] To enable: set ZKVERIFY_SEED_PHRASE env var');
    } else {
      try {
        const result = await submitToZkVerifyChain(proofBytes, pubBytes);
        attestationId = result.attestationId;
        zkVerifyTxHash = result.txHash;
        blockHash = result.blockHash;
        zkVerified = result.verified;
        console.log('[zkverify] zkVerify chain result:', {
          verified: zkVerified,
          attestationId: attestationId?.slice(0, 20),
          txHash: zkVerifyTxHash?.slice(0, 16),
        });
      } catch (err: any) {
        console.error('[zkverify] zkVerify chain submission failed:', err?.message);
        // Non-fatal — local bb verify is the primary cryptographic check
      }
    }

    const response: ZkVerifyResponse = {
      verified: localVerified || zkVerified,
      attestationId,
      localVerified,
      zkVerifyTxHash,
      blockHash,
      proofType: 'ultrahonk',
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[zkverify] Unexpected error:', err);
    return NextResponse.json(
      { error: err?.message || 'Unknown error', verified: false },
      { status: 500 }
    );
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

// ── zkVerify Blockchain Submission via zkverifyjs SDK ────────────────────────

interface ZkVerifyChainResult {
  verified: boolean;
  attestationId: string;
  txHash: string;
  blockHash: string;
}

/**
 * Submit proof to the zkVerify Volta testnet using the official zkverifyjs SDK.
 *
 * Connects to the zkVerify Substrate chain via WebSocket, submits the
 * UltraHonk proof as an extrinsic, and waits for on-chain verification.
 *
 * The zkVerify chain runs the actual UltraHonk verification equation
 * (pairing check on BN254) — this is real cryptographic verification.
 */
async function submitToZkVerifyChain(
  proofBytes: Buffer,
  publicInputsBytes: Buffer,
): Promise<ZkVerifyChainResult> {
  // Dynamic import — avoids Next.js bundling issues with Polkadot WASM modules
  const { zkVerifySession, UltrahonkVariant, ZkVerifyEvents, TransactionStatus } =
    await import('zkverifyjs');

  // Read the verification key
  const vkBytes = fs.readFileSync(VK_PATH);

  // Convert to hex strings (zkverifyjs expects hex for UltraHonk)
  const proofHex = '0x' + proofBytes.toString('hex');
  const vkHex = '0x' + vkBytes.toString('hex');

  // Public inputs: 7 × 32-byte BN254 fields → array of hex strings
  const pubs: string[] = [];
  for (let i = 0; i < publicInputsBytes.length; i += 32) {
    const field = publicInputsBytes.subarray(i, i + 32);
    pubs.push('0x' + field.toString('hex'));
  }

  console.log('[zkverify] Connecting to zkVerify Volta testnet...');
  console.log('[zkverify] Proof hex length:', proofHex.length);
  console.log('[zkverify] VK hex length:', vkHex.length);
  console.log('[zkverify] Public inputs count:', pubs.length);

  // Start session with seed phrase for transaction signing
  const session = await zkVerifySession.start()
    .Volta()
    .withAccount(ZKVERIFY_SEED);

  try {
    console.log('[zkverify] Submitting UltraHonk proof to zkVerify chain...');

    const { events, transactionResult } = await session
      .verify()
      .ultrahonk({ variant: UltrahonkVariant.Plain })
      .execute({
        proofData: {
          proof: proofHex,
          publicSignals: pubs,
          vk: vkHex,
        },
      });

    // Listen for events
    events.on(ZkVerifyEvents.IncludedInBlock, (data: any) => {
      console.log('[zkverify] ✅ Proof included in block:', data?.blockHash?.slice(0, 16));
    });
    events.on(ZkVerifyEvents.Finalized, (data: any) => {
      console.log('[zkverify] ✅ Proof finalized on-chain');
    });
    events.on('ErrorEvent', (data: any) => {
      console.error('[zkverify] ❌ Error event:', JSON.stringify(data));
    });

    // Wait for final result
    const result = await transactionResult;
    console.log('[zkverify] Transaction result:', {
      status: result.status,
      txHash: result.txHash?.slice(0, 16),
      blockHash: result.blockHash?.slice(0, 16),
      attestation: result.statement?.slice(0, 20),
    });

    const verified = result.status === TransactionStatus.Finalized;

    return {
      verified,
      attestationId: result.statement || result.txHash || '',
      txHash: result.txHash || '',
      blockHash: result.blockHash || '',
    };
  } finally {
    await session.close();
  }
}
