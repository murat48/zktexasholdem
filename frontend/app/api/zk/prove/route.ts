import { NextRequest, NextResponse } from 'next/server';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 120; // bb prove can take 10-60s

/** Absolute paths to CLI tools */
const NARGO_BIN = process.env.NARGO_BIN || path.join(os.homedir(), '.nargo', 'bin', 'nargo');
const BB_BIN = process.env.BB_BIN || path.join(os.homedir(), '.bb', 'bb');

/** Circuit artifacts (committed to repo or pre-built) */
const CIRCUITS_DIR = path.resolve(process.cwd(), '..', 'circuits');
const CIRCUIT_JSON = path.join(CIRCUITS_DIR, 'target', 'zk_poker_circuits.json');
const VK_PATH = path.join(CIRCUITS_DIR, 'target', 'vk', 'vk');

export interface ProveRequest {
  holeCards: [number, number];
  communityCards: [number, number, number, number, number];
  rank: number;         // 0-9
  salt: string;         // random nonce for Poseidon2 commitment (decimal string)
  commitment: string;   // Poseidon2(card0, card1, salt) hex string "0x..."
}

export interface ProveResponse {
  proof: string;        // base64-encoded proof bytes
  publicInputs: string; // base64-encoded public_inputs bytes
  proofSize: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let tmpDir: string | null = null;

  try {
    const body: ProveRequest = await req.json();
    const { holeCards, communityCards, rank, salt, commitment } = body;

    // Validate inputs
    if (!holeCards || holeCards.length !== 2 ||
        !communityCards || communityCards.length !== 5 ||
        typeof rank !== 'number' ||
        !salt || !commitment) {
      return NextResponse.json({ error: 'Invalid input: need holeCards, communityCards, rank, salt, commitment' }, { status: 400 });
    }

    // Validate circuit files exist
    if (!fs.existsSync(CIRCUIT_JSON)) {
      return NextResponse.json(
        { error: `Circuit not found: ${CIRCUIT_JSON}` },
        { status: 500 }
      );
    }
    if (!fs.existsSync(VK_PATH)) {
      return NextResponse.json(
        { error: `VK not found: ${VK_PATH}. Run: ~/.bb/bb write_vk -b circuits/target/zk_poker_circuits.json -o circuits/target/vk` },
        { status: 500 }
      );
    }

    // Validate nargo and bb exist
    if (!fs.existsSync(NARGO_BIN)) {
      return NextResponse.json(
        { error: `nargo not found: ${NARGO_BIN}` },
        { status: 500 }
      );
    }
    if (!fs.existsSync(BB_BIN)) {
      return NextResponse.json(
        { error: `bb not found: ${BB_BIN}` },
        { status: 500 }
      );
    }

    // Create temp directory for nargo project
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-poker-'));
    const circuitSrcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(circuitSrcDir);

    // Write Nargo.toml (copy from circuits dir)
    const nargoTomlSrc = path.join(CIRCUITS_DIR, 'Nargo.toml');
    fs.copyFileSync(nargoTomlSrc, path.join(tmpDir, 'Nargo.toml'));

    // Copy main.nr from original circuits
    const mainNrSrc = path.join(CIRCUITS_DIR, 'src', 'main.nr');
    fs.copyFileSync(mainNrSrc, path.join(circuitSrcDir, 'main.nr'));

    // Write Prover.toml — Poseidon2 commit-reveal scheme.
    // Private inputs: hole_cards, salt   |   Public inputs: card_commitment, community_cards, claimed_rank
    // The circuit verifies: Poseidon2(card0, card1, salt) == card_commitment
    const commitmentValue = commitment.startsWith('0x') ? commitment : '0x' + commitment;
    const proverToml = `hole_cards = [${holeCards[0]}, ${holeCards[1]}]
salt = "${salt}"
card_commitment = "${commitmentValue}"
community_cards = [${communityCards.join(', ')}]
claimed_rank = ${rank}
`;
    fs.writeFileSync(path.join(tmpDir, 'Prover.toml'), proverToml);

    console.log('[zk/prove] Prover.toml:', proverToml);
    console.log('[zk/prove] tmpDir:', tmpDir);

    // ── Step 1: nargo execute → generates witness ───────────────────────────
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir, { recursive: true });

    const nargoResult = spawnSync(
      NARGO_BIN,
      ['execute', '--package', 'zk_poker_circuits'],
      {
        cwd: tmpDir,
        timeout: 60000,
        encoding: 'utf8',
        env: { ...process.env, HOME: os.homedir() },
      }
    );

    if (nargoResult.status !== 0) {
      const stderr = nargoResult.stderr || '';
      const stdout = nargoResult.stdout || '';
      console.error('[zk/prove] nargo execute failed:', stderr);
      console.error('[zk/prove] nargo stdout:', stdout);
      return NextResponse.json(
        {
          error: 'nargo execute failed',
          details: stderr || stdout,
        },
        { status: 500 }
      );
    }

    const witnessPath = path.join(targetDir, 'zk_poker_circuits.gz');
    if (!fs.existsSync(witnessPath)) {
      return NextResponse.json(
        { error: `Witness not generated at ${witnessPath}` },
        { status: 500 }
      );
    }

    const witnessSize = fs.statSync(witnessPath).size;
    console.log('[zk/prove] Witness OK:', witnessSize, 'bytes');

    // ── Step 2: bb prove → generates real proof ──────────────────────────────
    const proofOutputDir = path.join(tmpDir, 'proof_out');
    fs.mkdirSync(proofOutputDir, { recursive: true });

    const bbResult = spawnSync(
      BB_BIN,
      [
        'prove',
        '-b', CIRCUIT_JSON,
        '-w', witnessPath,
        '-k', VK_PATH,
        '-o', proofOutputDir,
      ],
      {
        cwd: tmpDir,
        timeout: 90000,
        encoding: 'utf8',
        env: { ...process.env, HOME: os.homedir() },
      }
    );

    if (bbResult.status !== 0) {
      const stderr = bbResult.stderr || '';
      const stdout = bbResult.stdout || '';
      console.error('[zk/prove] bb prove failed:', stderr);
      console.error('[zk/prove] bb stdout:', stdout);
      return NextResponse.json(
        {
          error: 'bb prove failed',
          details: stderr || stdout,
        },
        { status: 500 }
      );
    }

    const proofFile = path.join(proofOutputDir, 'proof');
    const publicInputsFile = path.join(proofOutputDir, 'public_inputs');

    if (!fs.existsSync(proofFile)) {
      return NextResponse.json(
        { error: `Proof file not found at ${proofFile}` },
        { status: 500 }
      );
    }

    const proofBytes = fs.readFileSync(proofFile);
    const publicInputsBytes = fs.existsSync(publicInputsFile)
      ? fs.readFileSync(publicInputsFile)
      : Buffer.alloc(0);

    console.log('[zk/prove] Proof OK:', proofBytes.length, 'bytes');

    const response: ProveResponse = {
      proof: proofBytes.toString('base64'),
      publicInputs: publicInputsBytes.toString('base64'),
      proofSize: proofBytes.length,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[zk/prove] Unexpected error:', err);
    return NextResponse.json(
      { error: err?.message || 'Unknown error' },
      { status: 500 }
    );
  } finally {
    // Cleanup temp directory
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
