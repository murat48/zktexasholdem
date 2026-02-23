// ZK Proof generation utilities  --  Poseidon2 Commit-Reveal
// Real Noir + Barretenberg proof generation via server-side /api/zk/prove + /api/zk/commit
// nargo@1.0.0-beta.18 + bb@3.0.0-nightly.20260102 (CLI on server)
//
// Architecture (github.com/kaankacar/zkgaming pattern):
//   1. Pre-flop:  computePoseidon2Commitment(cards, salt) via /api/zk/commit
//   2. Showdown:  generateHandRankProof(cards, salt, commitment, community, rank)
//                 Circuit verifies Poseidon2(card0, card1, salt) == card_commitment

export interface ProofInput {
  holeCards: [number, number];
  communityCards: [number, number, number, number, number];
  claimedRank: number;  // 0-9 hand rank
  salt: string;         // random nonce (decimal string) for Poseidon2 commitment
  commitment: string;   // Poseidon2(card0, card1, salt) hex "0x..." stored on-chain
}

export interface ProofOutput {
  proof: Uint8Array;             // Raw UltraHonk proof (~16KB)
  publicInputsRaw: Uint8Array;   // Raw public inputs bytes (224B = 7×32 BN254 fields)
  publicInputs: {
    commitment: string;       // Poseidon2 card commitment (public input)
    communityCards: number[];
    claimedRank: number;
  };
}

/**
 * Generate a real Noir/Barretenberg ZK proof via the server-side /api/zk/prove route.
 *
 * The server runs:
 *   1. nargo execute  → produces witness (.gz)
 *   2. ~/.bb/bb prove → produces real UltraHonk proof (~16 KB)
 *
 * Returns the proof as a Uint8Array (16 KB real proof).
 * On failure, throws — no silent fallback to mock.
 */
export async function generateHandRankProof(input: ProofInput): Promise<ProofOutput> {
  console.log('🔐 Generating Poseidon2-based ZK proof for hand rank:', input.claimedRank);

  // Use circuit-identical rank to guarantee claimed_rank == actual_rank in circuit
  const circuitRank = calculateHandRankCircuit(input.holeCards, input.communityCards);

  console.log('[generateHandRankProof] sending to /api/zk/prove:',
    'cards:', input.holeCards,
    'salt:', input.salt.slice(0, 16) + '...',
    'commitment:', input.commitment.slice(0, 20) + '...',
    'rank:', circuitRank);

  const res = await fetch('/api/zk/prove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      holeCards: input.holeCards,
      communityCards: input.communityCards,
      rank: circuitRank,
      salt: input.salt,
      commitment: input.commitment,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    const msg = errBody?.details || errBody?.error || res.statusText;
    console.error('❌ /api/zk/prove error:', msg);
    throw new Error(`ZK proof generation failed: ${msg}`);
  }

  const { proof: proofBase64, publicInputs: pubBase64, proofSize } = await res.json();
  const proofBytes = Uint8Array.from(Buffer.from(proofBase64, 'base64'));
  const publicInputsRaw = pubBase64
    ? Uint8Array.from(Buffer.from(pubBase64, 'base64'))
    : new Uint8Array(0);

  console.log('✅ Real ZK proof received:', proofSize, 'bytes,',
    'public inputs:', publicInputsRaw.length, 'bytes');

  return {
    proof: proofBytes,
    publicInputsRaw,
    publicInputs: {
      commitment: input.commitment,
      communityCards: input.communityCards,
      claimedRank: circuitRank,
    },
  };
}

/**
 * Verify ZK proof (client-side length check).
 * Real verification happens via zkVerify blockchain + on-chain via the Noir Verifier contract.
 */
export async function verifyProof(proof: Uint8Array, publicInputs: any): Promise<boolean> {
  console.log('🔍 Client-side proof check (length):', proof.length);
  return proof.length > 0;
}

/**
 * Submit proof to zkVerify blockchain for cryptographic verification.
 *
 * Flow:
 *   1. Send proof + public inputs to /api/zk/zkverify
 *   2. Server optionally runs `bb verify` locally (sanity check)
 *   3. Server submits proof to zkVerify chain (real pairing check)
 *   4. Returns attestation ID + verification result
 *
 * This is called during showdown after proof generation but before
 * the on-chain resolve_showdown call.
 */
export interface ZkVerifyResult {
  verified: boolean;
  attestationId: string | null;
  localVerified: boolean;
  zkVerifyTxHash: string | null;
  blockHash: string | null;
  proofType: string;
}

export async function submitToZkVerify(
  proof: Uint8Array,
  publicInputs?: Uint8Array
): Promise<ZkVerifyResult> {
  console.log('🔗 Submitting proof to zkVerify blockchain...');

  try {
    const res = await fetch('/api/zk/zkverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proof: Buffer.from(proof).toString('base64'),
        publicInputs: publicInputs ? Buffer.from(publicInputs).toString('base64') : '',
        localVerify: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.warn('⚠️ zkVerify API error:', err?.error || res.statusText);
      return {
        verified: false,
        attestationId: null,
        localVerified: false,
        zkVerifyTxHash: null,
        blockHash: null,
        proofType: 'ultraplonk_bn254',
      };
    }

    const result: ZkVerifyResult = await res.json();
    console.log('🔗 zkVerify result:', {
      verified: result.verified,
      attestationId: result.attestationId?.slice(0, 16),
      localVerified: result.localVerified,
    });
    return result;
  } catch (err: any) {
    console.warn('⚠️ zkVerify submission failed (non-fatal):', err?.message);
    return {
      verified: false,
      attestationId: null,
      localVerified: false,
      zkVerifyTxHash: null,
      blockHash: null,
      proofType: 'ultraplonk_bn254',
    };
  }
}

/**
 * Convert a hex salt string to a decimal string suitable for Noir Field input.
 * Uses first 31 bytes (248 bits) to stay below BN254 field modulus (~254 bits).
 */
export function saltHexToDecimal(hexSalt: string): string {
  try {
    const clean = hexSalt.replace(/^0x/i, '').slice(0, 62).padStart(62, '0');
    return BigInt('0x' + clean).toString();
  } catch {
    return '0';
  }
}

/**
 * Compute Poseidon2 commitment via the server-side /api/zk/commit endpoint.
 * commitment = Poseidon2_permutation([card0, card1, salt, 0], 4)[0]
 *
 * Uses nargo execute on the server — guarantees exact match with the ZK circuit.
 * No WASM version mismatch issues (everything runs through the same nargo binary).
 */
export async function computePoseidon2Commitment(
  cards: [number, number],
  salt: string
): Promise<string> {
  const saltDecimal = saltHexToDecimal(salt);
  console.log('[computePoseidon2Commitment] cards:', cards,
    'salt input:', salt.slice(0, 16) + '...',
    'saltDecimal:', saltDecimal.slice(0, 16) + '...');
  try {
    const res = await fetch('/api/zk/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holeCards: cards, salt: saltDecimal }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err?.details || err?.error || res.statusText);
    }
    const { commitment } = await res.json();
    console.log('🔐 Poseidon2 commitment:', commitment.slice(0, 20) + '...');
    return commitment;
  } catch (err) {
    console.error('❌ Poseidon2 commitment computation failed:', err);
    throw err;
  }
}

/** @deprecated Use computePoseidon2Commitment instead */
export async function generateCommitment(cards: [number, number], salt: string): Promise<string> {
  return computePoseidon2Commitment(cards, salt);
}

/**
 * Generate cryptographically secure random salt
 */
export function generateSalt(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for server-side
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Calculate poker hand rank (0-9)
 * This must match the circuit's calculate_poker_rank function
 */
export function calculateHandRank(
  holeCards: [number, number],
  communityCards: [number, number, number, number, number]
): number {
  const allCards = [...holeCards, ...communityCards];
  
  // Extract ranks and suits
  const ranks = allCards.map(card => card % 13);
  const suits = allCards.map(card => Math.floor(card / 13));
  
  // Count rank frequencies
  const rankCounts: number[] = new Array(13).fill(0);
  ranks.forEach(r => rankCounts[r]++);
  
  // Count suit frequencies
  const suitCounts: number[] = new Array(4).fill(0);
  suits.forEach(s => suitCounts[s]++);
  
  // Check for flush
  const isFlush = suitCounts.some(count => count >= 5);
  
  // Check for straight
  const isStraight = checkStraight(ranks);
  
  // Check for straight flush
  const isStraightFlush = isFlush && isStraight;
  
  // Check for royal flush (10-J-Q-K-A straight flush)
  const isRoyalFlush = isStraightFlush && ranks.includes(12) && ranks.includes(8);
  
  // Count pairs, trips, quads
  const maxCount = Math.max(...rankCounts);
  const pairCount = rankCounts.filter(c => c === 2).length;
  const hasThree = rankCounts.some(c => c === 3);
  const hasFour = rankCounts.some(c => c === 4);
  
  // Determine hand rank
  if (isRoyalFlush) return 9;
  if (isStraightFlush) return 8;
  if (hasFour) return 7;
  if (hasThree && pairCount >= 1) return 6; // Full house
  if (isFlush) return 5;
  if (isStraight) return 4;
  if (hasThree) return 3;
  if (pairCount >= 2) return 2;
  if (pairCount === 1) return 1;
  return 0; // High card
}

function checkStraight(ranks: number[]): boolean {
  const rankSet = new Set(ranks);
  
  // Check for 5 consecutive ranks
  for (let start = 0; start <= 8; start++) {
    if ([start, start+1, start+2, start+3, start+4].every(r => rankSet.has(r))) {
      return true;
    }
  }
  
  // Check for wheel (A-2-3-4-5)
  if (rankSet.has(12) && rankSet.has(0) && rankSet.has(1) && rankSet.has(2) && rankSet.has(3)) {
    return true;
  }
  
  return false;
}
/**
 * Hand rank calculator that EXACTLY mirrors the Noir circuit's calculate_hand_rank.
 * Must be used for claimed_rank when executing the circuit — any divergence causes
 * "Cannot satisfy constraint" (assertion actual_rank == claimed_rank fails).
 *
 * Key: Uses flush_rank_counts (suit-restricted) for straight flush detection,
 * matching the circuit's Poseidon2 commit-reveal version.
 */
export function calculateHandRankCircuit(
  holeCards: [number, number],
  communityCards: [number, number, number, number, number]
): number {
  const allCards = [holeCards[0], holeCards[1], ...communityCards];

  // Extract ranks (0-12) and suits (0-3)
  const ranks = allCards.map(c => c % 13);
  const suits = allCards.map(c => Math.floor(c / 13));

  // Count rank frequencies (rankCounts[0..12])
  const rankCounts = new Array(13).fill(0);
  ranks.forEach(r => rankCounts[r]++);

  // Count suit frequencies
  const suitCounts = new Array(4).fill(0);
  suits.forEach(s => suitCounts[s]++);

  // Flush detection: find flush suit (>= 5 cards)
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] >= 5) flushSuit = s;
  }
  const hasFlush = flushSuit !== -1;

  // Build rank counts restricted to flush suit (mirrors circuit flush_rank_counts)
  const flushRankCounts = new Array(13).fill(0);
  if (hasFlush) {
    for (let i = 0; i < 7; i++) {
      if (suits[i] === flushSuit) {
        flushRankCounts[ranks[i]]++;
      }
    }
  }

  // Straight detection over all cards (any suit mix)
  const hasStraight = checkStraightCircuit(rankCounts);
  // Straight flush: straight formed ONLY by flush-suit cards
  const hasStraightFlush = hasFlush && checkStraightCircuit(flushRankCounts);
  // Royal flush: T-J-Q-K-A all in flush suit
  const hasRoyalFlush = hasStraightFlush &&
    flushRankCounts[8] > 0 && flushRankCounts[9] > 0 &&
    flushRankCounts[10] > 0 && flushRankCounts[11] > 0 && flushRankCounts[12] > 0;

  // Find max and second-max rank counts (circuit algorithm)
  let maxCount = 0;
  let secondCount = 0;
  for (let i = 0; i < 13; i++) {
    if (rankCounts[i] > maxCount) {
      secondCount = maxCount;
      maxCount = rankCounts[i];
    } else if (rankCounts[i] > secondCount) {
      secondCount = rankCounts[i];
    }
  }

  // Sequential if assignments — exactly mirrors Noir circuit
  let rank = 0;  // High card (default)

  if (maxCount === 2 && secondCount < 2) rank = 1;           // One pair
  if (maxCount === 2 && secondCount === 2) rank = 2;         // Two pair
  if (maxCount === 3 && secondCount < 2) rank = 3;           // Trips
  if (hasStraight && !hasStraightFlush) rank = 4;            // Straight
  if (hasFlush && !hasStraightFlush) rank = 5;               // Flush
  if (maxCount === 3 && secondCount >= 2) rank = 6;          // Full house
  if (maxCount === 4) rank = 7;                               // Four of a kind
  if (hasStraightFlush && !hasRoyalFlush) rank = 8;          // Straight flush
  if (hasRoyalFlush) rank = 9;                                // Royal flush

  return rank;
}

/** Straight check matching circuit's check_straight: counts consecutive rank_counts */
function checkStraightCircuit(rankCounts: number[]): boolean {
  let consecutive = 0;
  let result = false;
  for (let i = 0; i < 13; i++) {
    if (rankCounts[i] > 0) {
      consecutive++;
      if (consecutive >= 5) result = true;
    } else {
      consecutive = 0;
    }
  }
  // Wheel: A-2-3-4-5
  const hasWheel = rankCounts[0] > 0 && rankCounts[1] > 0 && rankCounts[2] > 0 &&
                   rankCounts[3] > 0 && rankCounts[12] > 0;
  return result || hasWheel;
}