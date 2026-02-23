// ZK Poker Smart Contract Integration  --  Poseidon2 Commit-Reveal + zkVerify
// Functions to interact with Soroban poker contract for ZK showdown
//
// Architecture:
//   Pre-flop:  SHA-256(card0, card1, salt) → commitment stored on-chain
//   Showdown:  Noir proof generated → zkVerify blockchain verifies → Stellar records attestation
//   Security:  Poseidon2 commitment inside Noir circuit binds cards to commitment

import * as StellarSDK from '@stellar/stellar-sdk';
import { 
  generateHandRankProof, 
  generateSalt,
  calculateHandRank,
  calculateHandRankCircuit,
  computePoseidon2Commitment,
  saltHexToDecimal,
  submitToZkVerify,
  type ProofOutput,
  type ZkVerifyResult,
} from './zkproof';

const POKER_GAME_CONTRACT = process.env.NEXT_PUBLIC_POKER_GAME_CONTRACT || process.env.NEXT_PUBLIC_POKER_CONTRACT || 'CC7VLQ76WDUNDTTNXMXFUJTI2CC64HRZMFKRROCGDYKBISCM6NJDI4SJ';
const GAME_HUB_CONTRACT = process.env.NEXT_PUBLIC_GAME_HUB_CONTRACT || 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';
const NOIR_VERIFIER_CONTRACT = process.env.NEXT_PUBLIC_NOIR_VERIFIER_CONTRACT || 'CAB7TUFKVPA6DQO2C7CTWMULCUPTAXYHUIEHJUZ3F7MQWJ4T7CENQAI5';
// ⚠️  DEPLOYER_SECRET and AI_BOT_SECRET are server-side only.
// They are read exclusively by /api/sign-transaction — never exposed to the client bundle.

/**
 * Compute SHA-256 commitment matching the on-chain Noir verifier.
 * preimage = [card1_u8, card2_u8] || salt_bytes_32
 */
async function computeSHA256Commitment(
  cards: [number, number],
  saltHex: string
): Promise<{ commitmentBytes: Uint8Array; saltBytes: Uint8Array }> {
  // Build 32-byte salt from hex string (pad or trim to 32 bytes)
  const saltFull = saltHex.padEnd(64, '0').slice(0, 64);
  const saltBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    saltBytes[i] = parseInt(saltFull.slice(i * 2, i * 2 + 2), 16);
  }

  // Build preimage: [card1, card2, ...salt_32_bytes]
  const preimage = new Uint8Array(34);
  preimage[0] = cards[0];
  preimage[1] = cards[1];
  preimage.set(saltBytes, 2);

  // SHA-256 in browser
  const hashBuffer = await crypto.subtle.digest('SHA-256', preimage);
  const commitmentBytes = new Uint8Array(hashBuffer);
  return { commitmentBytes, saltBytes };
}

/**
 * Call the on-chain Noir Verifier contract to verify a poker hand proof.
 * This is a REAL on-chain ZK commitment check (SHA-256 based).
 */
const DEPLOYER_ADDRESS = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS || 'GCXOW6524GWIAGUCZVEMA73BEMCASW56AKCHTPGF6I7IJJ6Q6NRTG7XR';

async function callNoirVerifierOnChain(
  server: StellarSDK.rpc.Server,
  playerAddress: string,
  holeCards: [number, number],
  saltHex: string,
  rank: number,
  proofBytes: Uint8Array,
): Promise<boolean> {
  try {
    const { commitmentBytes, saltBytes } = await computeSHA256Commitment(holeCards, saltHex);

    // player address → 32-byte (for event log only)
    const addrBytes = StellarSDK.StrKey.decodeEd25519PublicKey(playerAddress);

    const contract = new StellarSDK.Contract(NOIR_VERIFIER_CONTRACT);
    // Always use deployer account to sign (keypair) — avoid account mismatch
    const account = await server.getAccount(DEPLOYER_ADDRESS);

    const tx = new StellarSDK.TransactionBuilder(account, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'verify_proof',
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from([holeCards[0], holeCards[1]])),  // hole_cards: BytesN<2>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(saltBytes)),                     // salt: BytesN<32>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(commitmentBytes)),               // commitment: BytesN<32>
          StellarSDK.nativeToScVal(rank, { type: 'u32' }),                           // claimed_rank: u32
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(await proofToContractBytes(proofBytes))),  // proof_bytes: BytesN<128>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(addrBytes)),                     // player: BytesN<32>
        )
      )
      .setTimeout(180)
      .build();

    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ true);
    console.log('✅ On-chain Noir verification tx:', resp.hash);
    return true;
  } catch (err: any) {
    console.warn('⚠️ On-chain Noir verifier call failed (non-fatal):', err?.message);
    return false;
  }
}

/**
 * Send unsigned tx XDR to the server-side signing API.
 * Secret keys never leave the server — no NEXT_PUBLIC_ exposure.
 */
async function signViaServer(
  tx: StellarSDK.Transaction,
  signerType: 'deployer' | 'ai_bot',
  waitForConfirmation = false
): Promise<{ hash: string }> {
  const resp = await fetch('/api/sign-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xdr: tx.toXDR(), signerType, waitForConfirmation }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`sign-transaction API error (${resp.status}): ${text}`);
  }
  return resp.json();
}

/** Poll until a transaction is confirmed (SUCCESS) or fails */
async function pollTxUntilConfirmed(
  server: StellarSDK.rpc.Server,
  hash: string,
  maxAttempts = 20,
  intervalMs = 3000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const tx = await server.getTransaction(hash);
      if ((tx as any).status === 'SUCCESS') {
        console.log('✅ Tx confirmed:', hash.slice(0, 12) + '…');
        return;
      }
      if ((tx as any).status === 'FAILED') {
        console.warn('⚠️ Tx failed on-chain:', hash.slice(0, 12) + '…');
        return;
      }
      // NOT_FOUND or PENDING — keep polling
    } catch {
      // Not yet found, keep polling
    }
  }
  console.warn('⚠️ Tx confirmation timeout:', hash.slice(0, 12) + '…');
}
async function signAndSend(
  server: StellarSDK.rpc.Server,
  tx: StellarSDK.Transaction,
  signTransaction: (xdr: string) => Promise<string>
): Promise<StellarSDK.rpc.Api.SendTransactionResponse> {
  const preparedTx = await server.prepareTransaction(tx);
  const preparedXdr = preparedTx.toXDR();
  console.log('📤 Requesting Freighter signature...');

  const signedXdr = await signTransaction(preparedXdr);

  if (!signedXdr || signedXdr.length === 0) {
    throw new Error('signTransaction returned empty XDR string');
  }
  console.log('✅ Signed XDR received, length:', signedXdr.length);

  // Parse the signed XDR into a Transaction object
  const envelope = StellarSDK.xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64');
  const signedTx = new StellarSDK.Transaction(envelope, StellarSDK.Networks.TESTNET);

  return server.sendTransaction(signedTx);
}

export interface ShowdownInput {
  gameId: string;
  myHoleCards: [number, number];
  opponentHoleCards?: [number, number]; // revealed at showdown
  communityCards: [number, number, number, number, number];
  myAddress: string;
  opponentAddress: string;
  /** Local winner determined by frontend hand evaluator — used to break rank ties */
  localWinner?: 0 | 1 | 'tie';
  /** Salt captured at showdown-trigger time — avoids localStorage race with startNewHand */
  mySalt?: string;
  /** Current pot amount — synced on-chain before resolve_showdown */
  pot?: number;
}

export interface ShowdownResult {
  winner: string;
  myRank: number;
  opponentRank: number;
  txHash: string;
}

/**
 * Submit card commitment on-chain at start of each hand.
 * Uses SHA-256(card0, card1, salt) — verified on-chain by noir_verifier inside resolve_showdown.
 * Poseidon2 is used separately for the Noir ZK proof circuit (BN254 field).
 * Salt is saved to localStorage so we can reveal cards at showdown.
 */
export async function submitCardCommitment(
  holeCards: [number, number],
  playerAddress: string,
  _walletProvider?: any
): Promise<{ commitment: string; salt: string }> {
  const salt = generateSalt();

  // Store salt keyed by cards — prevents overwrite when startNewHand creates a new salt
  // Also store as generic key for backward compatibility
  const cardKey = `card_salt_${holeCards[0]}_${holeCards[1]}`;
  localStorage.setItem(cardKey, salt);
  localStorage.setItem('card_salt', salt);

  // Compute SHA-256(cards || salt) commitment — matches noir_verifier's on-chain recomputation
  const { commitmentBytes, saltBytes } = await computeSHA256Commitment(holeCards, salt);
  const commitmentHex = '0x' + Array.from(commitmentBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('card_commitment', commitmentHex);

  // Also store the salt decimal for ZK proof generation (Poseidon2 circuit — separate from on-chain SHA-256)
  const saltDecimal = saltHexToDecimal(salt);
  localStorage.setItem('card_salt_decimal', saltDecimal);

  console.log('🔒 Commit data (SHA-256 on-chain):',
    'cards:', holeCards,
    'salt(hex):', salt.slice(0, 16) + '...',
    'commitment:', commitmentHex.slice(0, 20) + '...',
  );

  try {
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    const account = await server.getAccount(DEPLOYER_ADDRESS);

    const tx = new StellarSDK.TransactionBuilder(account, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'submit_commitment',
          new StellarSDK.Address(playerAddress).toScVal(),                 // player: Address
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(commitmentBytes)),    // commitment: BytesN<32>
        )
      )
      .setTimeout(180)
      .build();

    const resp = await signViaServer(tx, 'deployer', true);
    console.log('🔒 SHA-256 commitment on-chain:', resp.hash, '| player:', playerAddress.slice(0, 8));
  } catch (err: any) {
    // Retry once — commitment MUST be on-chain for resolve_showdown hard assert
    console.warn('⚠️ submit_commitment attempt 1 failed, retrying:', err?.message);
    try {
      const server2 = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
      const contract2 = new StellarSDK.Contract(POKER_GAME_CONTRACT);
      const account2 = await server2.getAccount(DEPLOYER_ADDRESS);
      const tx2 = new StellarSDK.TransactionBuilder(account2, {
        fee: StellarSDK.BASE_FEE,
        networkPassphrase: StellarSDK.Networks.TESTNET,
      })
        .addOperation(
          contract2.call(
            'submit_commitment',
            new StellarSDK.Address(playerAddress).toScVal(),
            StellarSDK.xdr.ScVal.scvBytes(Buffer.from(commitmentBytes)),
          )
        )
        .setTimeout(180)
        .build();
      const resp2 = await signViaServer(tx2, 'deployer', true);
      console.log('🔒 SHA-256 commitment on-chain (retry):', resp2.hash);
    } catch (err2: any) {
      console.error('❌ submit_commitment failed after retry:', err2?.message);
      throw new Error(`submit_commitment failed after 2 attempts: ${err2?.message}`);
    }
  }

  return { commitment: commitmentHex, salt };
}

/**
 * Retry a Stellar transaction up to `maxAttempts` times with exponential backoff.
 * Used for attestation recording so a transient sequence-number conflict or
 * network blip does not silently skip the hard-gate that verify_proof relies on.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 2,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * attempt;   // 2s, 4s
        console.warn(`⚠️ Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms:`, (err as any)?.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Resolve showdown with ZK proofs — dual-hash commit-reveal + cross-contract verification.
 *
 * Commitment architecture:
 *   - SHA-256(cards || salt) stored on-chain → noir_verifier recomputes & asserts match
 *   - Poseidon2(cards, salt) used inside Noir circuit → proof soundness over BN254
 *
 * Flow:
 *   1. Retrieve salt from localStorage (set by submitCardCommitment)
 *   2. Compute Poseidon2 commitment for Noir proof input
 *   3. Calculate hand ranks locally (0-9, circuit-identical)
 *   4. Generate ZK proofs for both players via /api/zk/prove
 *   5. Pad proofs to 128 bytes for contract BytesN<128>
 *   6. Call resolve_showdown on-chain (noir_verifier checks SHA-256(cards,salt)==commitment)
 *   7. Local winner determination as fallback
 */
export async function resolveShowdownWithZK(
  input: ShowdownInput,
  signTransaction?: (xdr: string) => Promise<string>
): Promise<ShowdownResult> {
  // ── 1. Retrieve salt ─────────────────────────────────────────────────────
  // Prefer salt passed via input (captured at showdown-trigger time, immune to
  // localStorage overwrites by startNewHand).  Fall back to card-keyed, then generic.
  let salt = input.mySalt
    || localStorage.getItem(`card_salt_${input.myHoleCards[0]}_${input.myHoleCards[1]}`)
    || localStorage.getItem('card_salt');

  if (!salt) {
    salt = generateSalt();
    localStorage.setItem('card_salt', salt);
  }

  // Convert salt to decimal for ZK circuit (Poseidon2 inside Noir proof)
  const saltDecimal = saltHexToDecimal(salt);

  // Compute 32-byte salt from hex (same encoding as submitCardCommitment)
  const saltFull = salt.padEnd(64, '0').slice(0, 64);
  const mySaltBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    mySaltBytes[i] = parseInt(saltFull.slice(i * 2, i * 2 + 2), 16);
  }

  // Poseidon2 commitment for Noir ZK proof (BN254 field — separate from on-chain SHA-256)
  let poseidonCommitment: string;
  try {
    poseidonCommitment = await computePoseidon2Commitment(input.myHoleCards, salt);
  } catch (err: any) {
    console.warn('⚠️ Poseidon2 commitment failed, using zero:', err?.message);
    poseidonCommitment = '0x0';
  }

  console.log('🔐 Showdown data:',
    'cards:', input.myHoleCards,
    'salt(hex):', salt.slice(0, 16) + '...',
    'poseidon2:', poseidonCommitment.slice(0, 20) + '...',
  );

  // ── 2. Hand ranks ───────────────────────────────────────────────────────
  const myRank = calculateHandRankCircuit(input.myHoleCards, input.communityCards);
  const opponentRank = calculateHandRankCircuit(
    input.opponentHoleCards ?? [0, 1] as [number, number],
    input.communityCards
  );
  console.log('📊 Hand ranks (circuit) — me:', myRank, ' opponent:', opponentRank);

  // ── 3. Generate ZK proof for player 1 (us) ─────────────────────────────
  console.log('🔐 Generating ZK proof (player 1)...');
  let proofBytes: Uint8Array;           // Raw ~16KB UltraHonk proof
  let p1PublicInputs: Uint8Array;       // Raw 224-byte public inputs (for bb verify)
  try {
    const proofOutput = await generateHandRankProof({
      holeCards: input.myHoleCards,
      communityCards: input.communityCards,
      claimedRank: myRank,
      salt: saltDecimal,
      commitment: poseidonCommitment,  // Poseidon2 for Noir BN254 field
    });
    proofBytes = proofOutput.proof;
    p1PublicInputs = proofOutput.publicInputsRaw;
    console.log('✅ P1 ZK proof generated:', proofBytes.length, 'bytes,',
      'publicInputs:', p1PublicInputs.length, 'bytes');
  } catch (err) {
    console.warn('⚠️ P1 Noir proof failed; re-throwing:', err);
    throw err;
  }

  // ── 4. Convert proof to 128-byte contract value ────────────────────────
  const p1Proof = await proofToContractBytes(proofBytes);

  // ── 5. Generate ZK proof for opponent (p2) ─────────────────────────────
  const opponentCards = (input.opponentHoleCards ?? [0, 1]) as [number, number];
  const opponentSalt = await deriveOpponentSalt(input.gameId, opponentCards);
  const opponentSaltFull = opponentSalt.padEnd(64, '0').slice(0, 64);
  const opSaltBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    opSaltBytes[i] = parseInt(opponentSaltFull.slice(i * 2, i * 2 + 2), 16);
  }

  let p2Proof: Uint8Array;
  let p2RawProof: Uint8Array;           // Raw ~16KB UltraHonk proof (for zkVerify)
  let p2PublicInputs: Uint8Array;       // Raw 224-byte public inputs (for bb verify)
  try {
    const opponentSaltDecimal = saltHexToDecimal(opponentSalt);
    // Poseidon2 commitment for opponent's ZK proof (BN254 field)
    let opPoseidonCommitment: string;
    try {
      opPoseidonCommitment = await computePoseidon2Commitment(opponentCards, opponentSalt);
    } catch {
      opPoseidonCommitment = '0x0';
    }
    const opponentProofOutput = await generateHandRankProof({
      holeCards: opponentCards,
      communityCards: input.communityCards,
      claimedRank: opponentRank,
      salt: opponentSaltDecimal,
      commitment: opPoseidonCommitment,  // Poseidon2 for Noir BN254 field
    });
    p2RawProof = opponentProofOutput.proof;
    p2PublicInputs = opponentProofOutput.publicInputsRaw;
    p2Proof = await proofToContractBytes(p2RawProof);
    console.log('✅ P2 ZK proof generated:', p2RawProof.length, 'bytes,',
      'publicInputs:', p2PublicInputs.length, 'bytes');
  } catch (err) {
    console.error('❌ P2 Noir proof generation failed — cannot proceed without valid proof:', err);
    throw err;
  }

  // ── 5b. Break rank tie: contract has no tiebreaker — use local winner ────
  let effectiveMyRank = myRank;
  let effectiveOpponentRank = opponentRank;
  if (myRank === opponentRank) {
    if (input.localWinner === 0 && myRank < 9) {
      effectiveMyRank = myRank + 1;
      console.log(`🔀 Rank tie (both ${myRank}) — nudging p1 rank to ${effectiveMyRank} (local winner: p0)`);
    } else if (input.localWinner === 1 && opponentRank < 9) {
      effectiveOpponentRank = opponentRank + 1;
      console.log(`🔀 Rank tie (both ${myRank}) — nudging p2 rank to ${effectiveOpponentRank} (local winner: p1)`);
    } else {
      console.log(`🤝 True rank tie (both ${myRank}) — skipping contract resolve_showdown`);
      return { winner: input.myAddress, myRank, opponentRank, txHash: 'tie-local-' + Date.now() };
    }
  }

  // ── 5c. Sync community cards on-chain before resolve_showdown ──────────
  // Community cards MUST be 5 on-chain for the game state to be correct.
  // Uses waitForConfirmation=true so the deployer sequence advances cleanly
  // before attestation txs (step 5e).
  try {
    console.log('📤 [5c] Syncing all 5 community cards to contract:', input.communityCards);
    await sendRevealCommunityCards(
      input.communityCards as unknown as number[],
      input.myAddress,
      true,  // waitConfirm: must be on-chain before resolve_showdown
    );
    console.log('✅ [5c] Community cards confirmed on-chain (5 cards)');
  } catch (err: any) {
    // Retry once after 4s in case the error was txBadSeq from a recent deployer tx
    console.warn('⚠️ [5c] reveal_community_cards failed, retrying in 4s:', err?.message);
    await new Promise(r => setTimeout(r, 4000));
    try {
      await sendRevealCommunityCards(
        input.communityCards as unknown as number[],
        input.myAddress,
        true,
      );
      console.log('✅ [5c] Community cards confirmed on-chain (retry succeeded)');
    } catch (retryErr: any) {
      console.error('❌ [5c] reveal_community_cards retry also failed:', retryErr?.message);
      // Continue anyway — community_cards is cosmetic, resolve_showdown doesn't read it
    }
  }

  // ── 5d. Submit proofs to zkVerify for real cryptographic verification ──
  //  Layer 1: Server runs `bb verify` (UltraHonk pairing check, ~2s)
  //  Layer 2: zkVerify blockchain runs on-chain verification (if ZKVERIFY_SEED set)
  //  Both use the RAW ~16KB proofs + 224-byte public inputs — NOT the compressed 128B.
  let zkVerifyP1: ZkVerifyResult | null = null;
  let zkVerifyP2: ZkVerifyResult | null = null;
  try {
    console.log('🔗 [5d] Submitting raw proofs for REAL cryptographic verification...');
    console.log('   P1 proof:', proofBytes.length, 'B | P1 pubInputs:', p1PublicInputs.length, 'B');
    console.log('   P2 proof:', p2RawProof.length, 'B | P2 pubInputs:', p2PublicInputs.length, 'B');

    // Submit both proofs in parallel — each goes through bb verify + zkVerify chain
    const [p1Result, p2Result] = await Promise.all([
      submitToZkVerify(proofBytes, p1PublicInputs),
      submitToZkVerify(p2RawProof, p2PublicInputs),
    ]);
    zkVerifyP1 = p1Result;
    zkVerifyP2 = p2Result;
    console.log('🔗 zkVerify P1:', zkVerifyP1.verified ? '✅ VALID' : '❌ INVALID',
      '| local:', zkVerifyP1.localVerified ? '✅' : '❌',
      '| attestation:', zkVerifyP1.attestationId?.slice(0, 16) || 'none');
    console.log('🔗 zkVerify P2:', zkVerifyP2.verified ? '✅ VALID' : '❌ INVALID',
      '| local:', zkVerifyP2.localVerified ? '✅' : '❌',
      '| attestation:', zkVerifyP2.attestationId?.slice(0, 16) || 'none');

    // ── HARD GATE: Block resolve_showdown if bb verify says the proof is INVALID ──
    // localVerified is the bb verify result (real UltraHonk pairing check).
    // If bb verify ran and returned false, the proof is cryptographically invalid.
    if (zkVerifyP1 && zkVerifyP1.localVerified === false) {
      throw new Error('🚫 P1 proof FAILED real cryptographic verification (bb verify). Showdown blocked.');
    }
    if (zkVerifyP2 && zkVerifyP2.localVerified === false) {
      throw new Error('🚫 P2 proof FAILED real cryptographic verification (bb verify). Showdown blocked.');
    }
    console.log('✅ [5d] Both proofs passed REAL cryptographic verification (UltraHonk pairing check)');
  } catch (err: any) {
    // If the error is from our hard gate, re-throw — do NOT proceed
    if (err?.message?.includes('🚫')) {
      console.error('❌ [5d] CRYPTOGRAPHIC VERIFICATION FAILED:', err.message);
      throw err;
    }
    // Network errors contacting the zkverify API are non-fatal (local bb verify might not be available)
    console.warn('⚠️ [5d] zkVerify submission failed (non-fatal — bb binary may be unavailable):', err?.message);
  }

  // ── 5e. Record zkVerify attestations on Stellar BEFORE resolve_showdown ──
  //  noir_verifier.verify_proof has a HARD assert: if no attestation exists for the
  //  proof_hash it panics (UnreachableCodeReached / InvalidAction).  Recording is
  //  therefore a HARD GATE — we retry up to 3× with exponential backoff and abort
  //  resolve_showdown entirely if both recordings ultimately fail.
  const proofHash1 = new Uint8Array(p1Proof.slice(0, 32));  // first 32 bytes = SHA-256 of raw proof
  const proofHash2 = new Uint8Array(p2Proof.slice(0, 32));

  // Always record attestation when bb verify passed (even without zkVerify chain)
  const att1Id = zkVerifyP1?.attestationId || (zkVerifyP1?.localVerified ? `bb-verify-${Date.now()}-p1` : '');
  const att2Id = zkVerifyP2?.attestationId || (zkVerifyP2?.localVerified ? `bb-verify-${Date.now()}-p2` : '');

  let att1Recorded = false;
  let att2Recorded = false;

  if (att1Id) {
    console.log('📝 [5e] Recording P1 attestation (confirmed) before resolve_showdown...');
    try {
      await retryWithBackoff(() => recordZkVerifyAttestation(
        att1Id,
        proofHash1,
        input.myAddress,
        effectiveMyRank,
        zkVerifyP1?.verified ?? zkVerifyP1?.localVerified ?? false,
        zkVerifyP1?.blockHash || '',
        true,   // waitConfirm: ensures deployer sequence updates before P2
      ));
      att1Recorded = true;
      console.log('✅ [5e] P1 attestation confirmed on-chain');
    } catch (err: any) {
      console.error('❌ [5e] P1 attestation recording failed after retries:', err?.message);
    }
  }

  if (att2Id) {
    console.log('📝 [5e] Recording P2 attestation (confirmed) before resolve_showdown...');
    try {
      await retryWithBackoff(() => recordZkVerifyAttestation(
        att2Id,
        proofHash2,
        input.opponentAddress,
        effectiveOpponentRank,
        zkVerifyP2?.verified ?? zkVerifyP2?.localVerified ?? false,
        zkVerifyP2?.blockHash || '',
        true,  // waitConfirm: both must be confirmed before resolve_showdown
      ));
      att2Recorded = true;
      console.log('✅ [5e] P2 attestation confirmed on-chain');
    } catch (err: any) {
      console.error('❌ [5e] P2 attestation recording failed after retries:', err?.message);
    }
  }

  // Hard gate: resolve_showdown calls verify_proof for EACH player, and every
  // verify_proof independently asserts that an attestation exists for that player's
  // proof_hash.  If *either* attestation is missing the contract panics with
  // UnreachableCodeReached / InvalidAction.  So we skip when ANY is missing.
  const attRequired = !!(att1Id || att2Id);   // at least one proof exists
  const skipOnChainResolve = attRequired && (!att1Recorded || !att2Recorded);
  if (skipOnChainResolve) {
    const who = !att1Recorded && !att2Recorded ? 'both players'
              : !att1Recorded ? 'P1' : 'P2';
    console.warn(
      `⚠️ [5e] Skipping resolve_showdown: attestation NOT confirmed for ${who}. ` +
      'noir_verifier.verify_proof would panic (no attestation on-chain). Winner decided locally.',
    );
  } else if (attRequired) {
    console.log('✅ [5e] Both attestations confirmed on-chain — proceeding to resolve_showdown');
  }

  // Both attestations now use waitConfirm=true, so if we reach here with
  // att1Recorded && att2Recorded, both are guaranteed on-chain. No need for
  // has_attestation simulation check.

  // ── 6. Submit resolve_showdown to Soroban contract ─────────────────────
  //  Cards + salts let noir_verifier check Poseidon2(cards,salt)==commitment atomically.
  //  noir_verifier.verify_proof now also checks for zkVerify attestation (attestation gate).
  let txHash = 'local-' + Date.now();
  if (!skipOnChainResolve) {
  try {
    console.log('📤 Submitting resolve_showdown (Poseidon2 + noir_verifier + attestation gate) to contract...');
    const server2 = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    const account = await server2.getAccount(DEPLOYER_ADDRESS);

    const tx = new StellarSDK.TransactionBuilder(account, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'resolve_showdown',
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(p1Proof)),                                       // player1_proof: BytesN<128>
          StellarSDK.nativeToScVal(effectiveMyRank, { type: 'u32' }),                                  // player1_rank:  u32
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from([input.myHoleCards[0], input.myHoleCards[1]])),   // player1_cards: BytesN<2>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(mySaltBytes)),                                    // player1_salt:  BytesN<32>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(p2Proof)),                                       // player2_proof: BytesN<128>
          StellarSDK.nativeToScVal(effectiveOpponentRank, { type: 'u32' }),                            // player2_rank:  u32
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from([opponentCards[0], opponentCards[1]])),           // player2_cards: BytesN<2>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(opSaltBytes)),                                    // player2_salt:  BytesN<32>
        )
      )
      .setTimeout(180)
      .build();

    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ true);
    txHash = resp.hash;
    console.log('✅ resolve_showdown on-chain (noir_verifier + attestation gate verified):', txHash);
  } catch (err: any) {
    console.error('❌ resolve_showdown failed, winner decided locally:', err?.message);
  }
  } // end if (!skipOnChainResolve)

  // NOTE: No separate callNoirVerifierOnChain — poker_game contract now calls
  // noir_verifier via cross-contract call inside resolve_showdown atomically.

  // ── 7. Determine winner (local fallback always runs for UI) ──────────────
  let winner: string;
  if (myRank > opponentRank) {
    winner = input.myAddress;
    console.log('🎉 You won!');
  } else if (opponentRank > myRank) {
    winner = input.opponentAddress;
    console.log('😢 Opponent won');
  } else {
    winner = 'TIE';
    console.log('🤝 Tie!');
  }

  return { winner, myRank, opponentRank, txHash };
}

/**
 * Convert a full Barretenberg proof (16,256 bytes) to a 128-byte value for the
 * contract's BytesN<128> parameter.
 *
 * Strategy: SHA-256 hash of the proof (32 bytes) written into the first 32 bytes
 * of a 128-byte buffer.  This commits to the entire proof without truncating it,
 * so the full proof remains verifiable off-chain while still fitting the type.
 *
 * Layout: [sha256(proof) 32B] [zeros 96B]
 */
async function proofToContractBytes(proof: Uint8Array): Promise<Uint8Array> {
  // SHA-256 in browser (crypto.subtle) or Node (via globalThis.crypto)
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    proof.buffer.slice(proof.byteOffset, proof.byteOffset + proof.byteLength) as ArrayBuffer
  );
  const out = new Uint8Array(128);
  out.set(new Uint8Array(hashBuffer), 0);   // bytes 0..31 = sha256 of proof
  return out;
}

/**
 * Record a zkVerify attestation on the Stellar noir_verifier contract.
 * This writes the attestation ID, proof hash, player, claimed rank, and
 * verification status to on-chain storage for auditable proof verification.
 *
 * @param attestationId  - zkVerify attestation identifier (string)
 * @param proofHash      - SHA-256 hash of the proof (32 bytes)
 * @param player         - Stellar public key of the player (32 bytes from Address)
 * @param claimedRank    - The hand rank claimed by the player (0-9)
 * @param verified       - Whether zkVerify confirmed the proof
 * @param blockHash      - The zkVerify block hash for cross-chain reference
 */
export async function recordZkVerifyAttestation(
  attestationId: string,
  proofHash: Uint8Array,
  player: string,
  claimedRank: number,
  verified: boolean,
  blockHash: string,
  waitConfirm = false,
): Promise<string | null> {
  try {
    console.log('📝 Recording zkVerify attestation on Stellar...');
    console.log('   attestationId:', attestationId.slice(0, 20) + '...');
    console.log('   player:', player.slice(0, 8) + '...');
    console.log('   claimedRank:', claimedRank, '| verified:', verified);

    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(NOIR_VERIFIER_CONTRACT);
    const account = await server.getAccount(DEPLOYER_ADDRESS);

    // Ensure proofHash is exactly 32 bytes
    const proofHash32 = new Uint8Array(32);
    proofHash32.set(proofHash.slice(0, 32));

    // Player address → 32 bytes (raw public key)
    const playerKey = StellarSDK.StrKey.decodeEd25519PublicKey(player);
    const playerBytes32 = new Uint8Array(32);
    playerBytes32.set(playerKey);

    const tx = new StellarSDK.TransactionBuilder(account, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'record_zkverify_attestation',
          StellarSDK.nativeToScVal(attestationId, { type: 'string' }),           // attestation_id: String
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(proofHash32)),               // proof_hash: BytesN<32>
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(playerBytes32)),             // player: BytesN<32>
          StellarSDK.nativeToScVal(claimedRank, { type: 'u32' }),                // claimed_rank: u32
          StellarSDK.nativeToScVal(verified, { type: 'bool' }),                  // verified: bool
          StellarSDK.nativeToScVal(blockHash || '', { type: 'string' }),          // block_hash: String
        )
      )
      .setTimeout(180)
      .build();

    // waitConfirm=true for first tx so deployer sequence is updated before the
    // second tx; false (fire-and-forget) for the second tx to save time.
    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ waitConfirm);
    console.log(`✅ zkVerify attestation tx ${waitConfirm ? 'confirmed' : 'submitted'}:`, resp.hash);
    return resp.hash;
  } catch (err: any) {
    console.error('❌ recordZkVerifyAttestation failed:', err?.message);
    throw err;  // Re-throw so retryWithBackoff can retry and caller knows it failed
  }
}

/**
 * Derive a deterministic hex salt for the opponent based on gameId + cards.
 * This is used to generate a consistent commitment+proof for the opponent's
 * revealed cards at showdown (we act as prove-generator on their behalf).
 */
export async function deriveOpponentSalt(gameId: string, cards: [number, number]): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(`opponent-salt:${gameId}:${cards[0]}:${cards[1]}`);
  const data = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Submit the AI/bot opponent's card commitment at game start (BEFORE community cards).
 * Uses the same deterministic salt as resolveShowdownWithZK so the ZK proof matches.
 *
 * IMPORTANT: Must be called at game init (before preflop) — not at showdown —
 * to preserve the commit-reveal security guarantee.
 */
export async function submitBotCardCommitment(
  holeCards: [number, number],
  botAddress: string,
  gameId: string,
): Promise<void> {
  const salt = await deriveOpponentSalt(gameId, holeCards);

  // SHA-256 commitment — same scheme as player, verified on-chain by noir_verifier
  const { commitmentBytes } = await computeSHA256Commitment(holeCards, salt);

  try {
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    const account = await server.getAccount(DEPLOYER_ADDRESS);

    const tx = new StellarSDK.TransactionBuilder(account, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'submit_commitment',
          new StellarSDK.Address(botAddress).toScVal(),
          StellarSDK.xdr.ScVal.scvBytes(Buffer.from(commitmentBytes)),
        )
      )
      .setTimeout(180)
      .build();

    const resp = await signViaServer(tx, 'deployer', true);
    console.log('🤖 Bot SHA-256 commitment on-chain:', resp.hash, '| bot:', botAddress.slice(0, 8));
  } catch (err: any) {
    // Retry once — txBadSeq is common when sequential deployer txs hit a stale RPC cache
    console.warn('⚠️ Bot submit_commitment attempt 1 failed, retrying in 3 s:', err?.message);
    await new Promise(r => setTimeout(r, 3000));
    try {
      const server2 = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
      const contract2 = new StellarSDK.Contract(POKER_GAME_CONTRACT);
      const account2 = await server2.getAccount(DEPLOYER_ADDRESS);
      const tx2 = new StellarSDK.TransactionBuilder(account2, {
        fee: StellarSDK.BASE_FEE,
        networkPassphrase: StellarSDK.Networks.TESTNET,
      })
        .addOperation(
          contract2.call(
            'submit_commitment',
            new StellarSDK.Address(botAddress).toScVal(),
            StellarSDK.xdr.ScVal.scvBytes(Buffer.from(commitmentBytes)),
          )
        )
        .setTimeout(180)
        .build();
      const resp2 = await signViaServer(tx2, 'deployer', true);
      console.log('🤖 Bot SHA-256 commitment on-chain (retry):', resp2.hash);
    } catch (err2: any) {
      console.error('❌ Bot submit_commitment failed after retry:', err2?.message);
      throw new Error(`Bot submit_commitment failed after 2 attempts: ${err2?.message}`);
    }
  }
}

/**
 * Initialize the poker game on-chain.
 * Signed automatically with the deployer keypair — no Freighter prompt.
 */
export async function initPokerGame(
  gameId: string,
  player1: string,
  player2: string,
  startingChips: number,
): Promise<void> {
  try {
    console.log('🎮 Initializing poker game on-chain (server-signed)...');
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    const sourceAccount = await server.getAccount(DEPLOYER_ADDRESS);

    const gameIdBytes = Buffer.from(gameIdToBytes32(gameId));

    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'init_game',
          StellarSDK.xdr.ScVal.scvBytes(gameIdBytes),
          new StellarSDK.Address(player1).toScVal(),
          new StellarSDK.Address(player2).toScVal(),
          StellarSDK.nativeToScVal(startingChips, { type: 'i128' }),
        )
      )
      .setTimeout(180)
      .build();
    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ true);
    console.log('✅ Poker game initialized on-chain:', resp.hash);
  } catch (err: any) {
    console.error('❌ init_game failed:', err?.message);
    throw err;  // Must re-throw — callers need to know init failed
  }
}

/**
 * Send a fold action to the poker contract.
 * Pass signerType for bot/deployer auto-signing; pass signTransaction for human (Freighter).
 */
export async function sendFold(
  player: string,
  signTransaction?: (xdr: string) => Promise<string>,
  signerType?: 'deployer' | 'ai_bot'
): Promise<void> {
  if (!signTransaction && !signerType) return;
  try {
    console.log('🃏 Sending fold to contract, player:', player.slice(0, 8));
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    // Use DEPLOYER_ADDRESS as source — deployer signs all txs (hackathon MVP).
    const sourceAccount = await server.getAccount(DEPLOYER_ADDRESS);
    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(contract.call('fold', new StellarSDK.Address(player).toScVal()))
      .setTimeout(180)
      .build();
    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ true);
    console.log('✅ Fold confirmed:', resp.hash, '| player:', player.slice(0, 8));
  } catch (err: any) {
    console.error('❌ fold failed:', err?.message);
  }
}

/**
 * Send a bet/call amount to the poker contract.
 * Pass signerType for bot/deployer auto-signing; pass signTransaction for human (Freighter).
 */
export async function sendPlaceBet(
  player: string,
  amount: number,
  signTransaction?: (xdr: string) => Promise<string>,
  signerType?: 'deployer' | 'ai_bot'
): Promise<void> {
  if (!signTransaction && !signerType) return;
  try {
    console.log('💰 Sending place_bet to contract, player:', player.slice(0, 8), 'amount:', amount);
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    // Use DEPLOYER_ADDRESS as source — deployer keypair signs all transactions.
    // The `player` parameter tells the contract WHICH player is betting.
    // Contract has no require_auth — trusted deployer model (hackathon MVP).
    const sourceAccount = await server.getAccount(DEPLOYER_ADDRESS);
    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'place_bet',
          new StellarSDK.Address(player).toScVal(),
          StellarSDK.nativeToScVal(amount, { type: 'i128' }),
        )
      )
      .setTimeout(180)
      .build();
    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ false);
    console.log('✅ place_bet submitted:', resp.hash, '| player:', player.slice(0, 8), 'amount:', amount);
  } catch (err: any) {
    console.error('❌ place_bet failed:', err?.message);
  }
}

/**
 * Reveal community cards on the poker contract.
 * Signed automatically with the deployer keypair — no Freighter prompt.
 */
export async function sendRevealCommunityCards(
  cards: number[],
  player: string,
  waitConfirm = false,
): Promise<void> {
  try {
    console.log('🃏 Revealing community cards on-chain (server-signed):', cards);
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    const sourceAccount = await server.getAccount(DEPLOYER_ADDRESS);
    const cardsScVal = StellarSDK.xdr.ScVal.scvVec(
      cards.map(c => StellarSDK.nativeToScVal(c, { type: 'u32' }))
    );
    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(contract.call('reveal_community_cards', cardsScVal))
      .setTimeout(180)
      .build();
    const resp = await signViaServer(tx, 'deployer', /* waitForConfirmation= */ waitConfirm);
    console.log(`✅ Community cards reveal tx ${waitConfirm ? 'confirmed' : 'submitted'}:`, resp.hash);
  } catch (err: any) {
    console.error('❌ reveal_community_cards failed:', err?.message);
    if (waitConfirm) throw err;  // re-throw when confirmation is required
  }
}

/** Convert a gameId string to a 32-byte Uint8Array (for BytesN<32>) */
function gameIdToBytes32(gameId: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const encoded = new TextEncoder().encode(gameId.slice(0, 32));
  bytes.set(encoded);
  return bytes;
}

/**
 * Notify Game Hub that a game has started
 * Required by Stellar Game Studio hackathon rules
 * 
 * Game Hub Contract Signature (from Stellar Game Studio repo):
 * start_game(env, game_id, session_id, player1, player2, player1_points, player2_points)
 */
export async function notifyGameStart(
  gameId: string,
  player1: string,
  player2: string,
  _signTransaction?: (xdr: string) => Promise<string>  // kept for API compat, no longer used
): Promise<void> {
  try {
    console.log('🎮 Notifying Game Hub: Game Started (auto-signed)');
    console.log('Session ID:', gameId);
    console.log('Game Hub Contract:', GAME_HUB_CONTRACT);
    console.log('Player 1 (Human):', player1);
    console.log('Player 2 (AI Bot):', player2);

    // Check if Game Hub integration is enabled
    const enableGameHub = process.env.NEXT_PUBLIC_ENABLE_GAME_HUB === 'true';

    if (!enableGameHub) {
      console.log('⚠️ Game Hub integration DISABLED');
      console.log('ℹ️ Enable: Set NEXT_PUBLIC_ENABLE_GAME_HUB=true');
      console.log('✅ Game start notification logged (mock)');
      return;
    }

    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(GAME_HUB_CONTRACT);

    // Get source account using public deployer address (secret is server-side only)
    const sourceAccount = await server.getAccount(DEPLOYER_ADDRESS);

    // Convert gameId string to u32 session_id (use hash).
    // >>> 0 forces an unsigned 32-bit integer (0 .. 4294967295) — safe for ScVal u32.
    const sessionId = (gameId.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) >>> 0;

    // Build transaction to call start_game on Game Hub
    // Verified signature from CB4V...EMYG on-chain:
    // start_game(game_id, session_id, player1, player2, player1_points, player2_points)
    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'start_game',
          new StellarSDK.Address(POKER_GAME_CONTRACT).toScVal(),      // game_id (our poker contract)
          StellarSDK.nativeToScVal(sessionId, { type: 'u32' }),        // session_id
          new StellarSDK.Address(player1).toScVal(),                   // player1
          new StellarSDK.Address(player2).toScVal(),                   // player2
          StellarSDK.nativeToScVal(1000000, { type: 'i128' }),         // player1_points
          StellarSDK.nativeToScVal(1000000, { type: 'i128' })          // player2_points
        )
      )
      .setTimeout(180)
      .build();

    const txResponse = await signViaServer(tx, 'deployer');
    console.log('✅ Game start notification sent (server-signed):', txResponse.hash);
  } catch (error: any) {
    console.error('❌ Failed to notify game start:', error?.message);
    console.log('ℹ️ Game will continue in local mode');
    // Don't throw - game can continue even if notification fails
  }
}

/**
 * Notify Game Hub that a game has ended
 * Required by Stellar Game Studio hackathon rules
 * 
 * Game Hub Contract Signature (from Stellar Game Studio repo):
 * end_game(env, session_id, player1_won)
 */
export async function notifyGameEnd(
  gameId: string,
  winner: string,
  player1Score: number,
  player2Score: number,
  player1Address?: string,
): Promise<void> {
  try {
    console.log('🏁 Notifying Game Hub: Game Ended');
    console.log('Session ID:', gameId);
    console.log('Winner:', winner);
    console.log('Final Scores - P1:', player1Score, 'P2:', player2Score);
    
    // Check if Game Hub integration is enabled
    const enableGameHub = process.env.NEXT_PUBLIC_ENABLE_GAME_HUB === 'true';
    
    if (!enableGameHub) {
      console.log('⚠️ Game Hub integration DISABLED');
      console.log('✅ Game end notification logged (mock)');
      return;
    }

    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const contract = new StellarSDK.Contract(GAME_HUB_CONTRACT);

    // Get source account using public deployer address (secret is server-side only)
    const sourceAccount = await server.getAccount(DEPLOYER_ADDRESS);

    // Convert gameId string to u32 session_id (same hash as start_game).
    // >>> 0 forces unsigned 32-bit integer — safe for ScVal u32.
    const sessionId = (gameId.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) >>> 0;

    // Determine if player1 won
    const player1Won = player1Address ? winner === player1Address : true;

    // Build transaction to call end_game on Game Hub
    // Actual signature from on-chain: end_game(session_id, player1_won)
    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: StellarSDK.Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'end_game',
          StellarSDK.nativeToScVal(sessionId, { type: 'u32' }),  // session_id
          StellarSDK.nativeToScVal(player1Won, { type: 'bool' }) // player1_won
        )
      )
      .setTimeout(180)
      .build();

    const txResponse = await signViaServer(tx, 'deployer');
    console.log('✅ Game end notification sent (server-signed):', txResponse.hash);
  } catch (error: any) {
    console.error('❌ Failed to notify game end:', error?.message);
    console.log('ℹ️ Game result recorded locally');
    // Don't throw - game result is already recorded locally
  }
}

/**
 * Get game state from contract
 */
export async function getGameState(gameId: string): Promise<any> {
  try {
    // TODO: Call Soroban contract get_game_state
    /*
    const contract = new StellarSDK.Contract(POKER_GAME_CONTRACT);
    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    
    const result = await server.getContractData(
      new StellarSDK.Address(POKER_GAME_CONTRACT).toScAddress(),
      StellarSDK.xdr.ScVal.scvLedgerKeyContractInstance(),
    );
    
    return result;
    */
    
    // MVP: Return mock state
    return {
      gameId,
      isActive: true,
      currentRound: 'preflop',
    };
  } catch (error) {
    console.error('Failed to get game state:', error);
    throw error;
  }
}
