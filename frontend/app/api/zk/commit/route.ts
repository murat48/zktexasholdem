import { NextRequest, NextResponse } from 'next/server';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const runtime = 'nodejs';

/**
 * POST /api/zk/commit
 *
 * Computes Poseidon2(card0, card1, salt) using nargo execute on a minimal
 * commitment circuit.  This produces the same hash that the main ZK poker
 * circuit will verify at showdown — ensuring consistency between the
 * pre-flop commitment stored on-chain and the proof generated later.
 *
 * Architecture inspired by github.com/kaankacar/zkgaming:
 *   commit = Poseidon2_sponge(card0_as_Field, card1_as_Field, salt, 0)[0]
 *
 * Request:  { holeCards: [number, number], salt: string }
 * Response: { commitment: string }   // hex string "0x..."
 */

const NARGO_BIN = process.env.NARGO_BIN || path.join(os.homedir(), '.nargo', 'bin', 'nargo');

/** Minimal Noir circuit for Poseidon2 commitment computation */
const COMMIT_CIRCUIT = `fn main(card0: u8, card1: u8, salt: Field) -> pub Field {
    let hash_state: [Field; 4] = [card0 as Field, card1 as Field, salt, 0];
    let result = std::hash::poseidon2_permutation(hash_state, 4);
    result[0]
}
`;

const NARGO_TOML = `[package]
name = "poseidon2_commit"
type = "bin"
authors = [""]
compiler_version = ">=0.31.0"
[dependencies]
`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let tmpDir: string | null = null;

  try {
    const body = await req.json();
    const { holeCards, salt } = body as {
      holeCards: [number, number];
      salt: string;
    };

    // Validate
    if (!holeCards || holeCards.length !== 2 || !salt) {
      return NextResponse.json(
        { error: 'Invalid input: need holeCards [card0, card1] and salt string' },
        { status: 400 }
      );
    }
    if (holeCards[0] < 0 || holeCards[0] > 51 || holeCards[1] < 0 || holeCards[1] > 51) {
      return NextResponse.json(
        { error: 'Cards must be in range 0-51' },
        { status: 400 }
      );
    }

    // Create temp project
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-commit-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(tmpDir, 'Nargo.toml'), NARGO_TOML);
    fs.writeFileSync(path.join(srcDir, 'main.nr'), COMMIT_CIRCUIT);

    // The caller (computePoseidon2Commitment) already converts hex→decimal via
    // saltHexToDecimal().  Only re-convert if we receive a raw 0x-prefixed or
    // clearly-hex string (contains a-f letters).  Pure decimal strings must NOT
    // be touched — the old regex /^[0-9a-fA-F]{8,}$/ matched decimal digits too,
    // causing a double-conversion bug.
    let saltDecimal: string;
    if (salt.startsWith('0x') || salt.startsWith('0X')) {
      const clean = salt.replace(/^0x/i, '').slice(0, 62).padStart(62, '0');
      saltDecimal = BigInt('0x' + clean).toString();
    } else if (/[a-fA-F]/.test(salt)) {
      // Contains hex letters → treat as hex
      const clean = salt.slice(0, 62).padStart(62, '0');
      saltDecimal = BigInt('0x' + clean).toString();
    } else {
      // Pure digits → already decimal, use as-is
      saltDecimal = salt;
    }

    console.log('[zk/commit] salt input:', salt.slice(0, 20) + '...', '→ saltDecimal:', saltDecimal.slice(0, 20) + '...');

    const proverToml = `card0 = ${holeCards[0]}\ncard1 = ${holeCards[1]}\nsalt = "${saltDecimal}"\n`;
    fs.writeFileSync(path.join(tmpDir, 'Prover.toml'), proverToml);

    // Run nargo execute — extracts commitment from "Circuit output: 0x..." line
    const result = spawnSync(
      NARGO_BIN,
      ['execute', '--package', 'poseidon2_commit'],
      {
        cwd: tmpDir,
        timeout: 30000,
        encoding: 'utf8',
        env: { ...process.env, HOME: os.homedir() },
      }
    );

    if (result.status !== 0) {
      console.error('[zk/commit] nargo execute failed:', result.stderr);
      return NextResponse.json(
        { error: 'Poseidon2 commitment computation failed', details: result.stderr },
        { status: 500 }
      );
    }

    // Parse "Circuit output: 0x..." from stdout/stderr
    const allOutput = (result.stdout || '') + (result.stderr || '');
    const match = allOutput.match(/Circuit output:\s*(0x[0-9a-fA-F]+)/);

    if (!match) {
      console.error('[zk/commit] No circuit output found:', allOutput);
      return NextResponse.json(
        { error: 'Could not extract Poseidon2 commitment from circuit output' },
        { status: 500 }
      );
    }

    const commitment = match[1];
    console.log('[zk/commit] Poseidon2 commitment:', commitment.slice(0, 20) + '...');

    return NextResponse.json({ commitment });
  } catch (err: any) {
    console.error('[zk/commit] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
