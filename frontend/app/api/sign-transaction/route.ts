/**
 * Server-side transaction signing API.
 * Stellar secret keys (DEPLOYER_SECRET, AI_BOT_SECRET) are ONLY read here —
 * never exposed to the client bundle via NEXT_PUBLIC_ prefix.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as StellarSDK from '@stellar/stellar-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function pollUntilConfirmed(
  server: StellarSDK.rpc.Server,
  hash: string,
  maxAttempts = 15,
  intervalMs = 3000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    // First check at 3s, subsequent every 3s → max 45s total
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const tx = await server.getTransaction(hash);
      if ((tx as any).status === 'SUCCESS') {
        console.log('✅ [sign-tx] Confirmed:', hash.slice(0, 12) + '…', `(poll ${i + 1})`);
        // Brief delay so RPC indices (account seq, storage) catch up
        await new Promise(r => setTimeout(r, 1200));
        return;
      }
      if ((tx as any).status === 'FAILED') {
        throw new Error(`Transaction FAILED on-chain: ${hash.slice(0, 12)}…`);
      }
    } catch (err: any) {
      // Re-throw our own FAILED error
      if (err?.message?.includes('FAILED on-chain')) throw err;
      // NOT_FOUND / PENDING — keep polling
    }
  }
  throw new Error(`Transaction confirmation timeout after ${maxAttempts * intervalMs / 1000}s: ${hash.slice(0, 12)}…`);
}

/**
 * Rebuild a transaction with a fresh account sequence while keeping the same
 * contract call operations.  Used to recover from txBadSeq when the Soroban
 * RPC returns a stale sequence number between back-to-back deployer txs.
 */
function rebuildTxWithFreshSequence(
  originalXdr: string,
  freshAccount: StellarSDK.Account,
): StellarSDK.Transaction {
  const origTx = StellarSDK.TransactionBuilder.fromXDR(
    originalXdr,
    StellarSDK.Networks.TESTNET,
  ) as StellarSDK.Transaction;

  // Extract raw XDR operations from the envelope
  const envelope = origTx.toEnvelope();
  const innerTx = envelope.switch().name === 'envelopeTypeTx'
    ? envelope.v1().tx()
    : envelope.v0().tx();
  const xdrOps = innerTx.operations();

  const baseFee = String(Math.ceil(Number(origTx.fee) / Math.max(xdrOps.length, 1)));
  const builder = new StellarSDK.TransactionBuilder(freshAccount, {
    fee: baseFee,
    networkPassphrase: StellarSDK.Networks.TESTNET,
  });
  for (const op of xdrOps) {
    builder.addOperation(op);
  }
  return builder.setTimeout(180).build();
}

export async function POST(req: NextRequest) {
  try {
    const { xdr, signerType, waitForConfirmation } = await req.json();

    // ── Pick secret key — server-side only, never in client bundle ──────────
    const secret =
      signerType === 'ai_bot'
        ? process.env.AI_BOT_SECRET
        : process.env.DEPLOYER_SECRET;

    if (!secret) {
      return NextResponse.json(
        { error: `${signerType ?? 'deployer'} secret not configured on server` },
        { status: 500 }
      );
    }

    const server = new StellarSDK.rpc.Server('https://soroban-testnet.stellar.org');
    const keypair = StellarSDK.Keypair.fromSecret(secret);

    // Reconstruct transaction from XDR sent by client
    const tx = StellarSDK.TransactionBuilder.fromXDR(xdr, StellarSDK.Networks.TESTNET);

    // prepareTransaction: Soroban simulation to get ledger footprint
    const preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(keypair);

    console.log('✅ [sign-tx] Signed as', keypair.publicKey().slice(0, 8) + '… (' + (signerType ?? 'deployer') + ')');

    let resp = await server.sendTransaction(preparedTx);

    // ── Auto-retry on txBadSeq (stale sequence from RPC lag) ─────────────
    if (resp.status === 'ERROR') {
      const errJson = JSON.stringify((resp as any).errorResult ?? {});
      if (errJson.includes('txBadSeq')) {
        for (let seqRetry = 1; seqRetry <= 2; seqRetry++) {
          const delay = seqRetry * 4000;   // 4s, 8s — enough for ledger close
          console.warn(`⚠️ [sign-tx] txBadSeq — retry ${seqRetry}/2 in ${delay / 1000}s…`);
          await new Promise(r => setTimeout(r, delay));
          try {
            const freshAccount = await server.getAccount(keypair.publicKey());
            const freshTx = rebuildTxWithFreshSequence(xdr, freshAccount);
            const freshPrepared = await server.prepareTransaction(freshTx);
            freshPrepared.sign(keypair);
            resp = await server.sendTransaction(freshPrepared);
            console.log(`🔄 [sign-tx] txBadSeq retry ${seqRetry} result:`, resp.status, resp.hash?.slice(0, 12) + '…');
            if (resp.status !== 'ERROR') break;
            const retryJson = JSON.stringify((resp as any).errorResult ?? {});
            if (!retryJson.includes('txBadSeq')) break; // different error → stop retrying
          } catch (retryErr: any) {
            console.error(`❌ [sign-tx] txBadSeq retry ${seqRetry} failed:`, retryErr?.message);
            // Fall through — original ERROR resp will be thrown below
          }
        }
      }
    }

    // Check final submission status
    if (resp.status === 'ERROR') {
      const diagMsg = (resp as any).errorResult
        ? `errorResult: ${JSON.stringify((resp as any).errorResult)}`
        : 'no diagnostic';
      throw new Error(`sendTransaction rejected (ERROR): ${diagMsg}`);
    }

    // ── Auto-retry on TRY_AGAIN_LATER (server overloaded) ────────────────
    if (resp.status === 'TRY_AGAIN_LATER') {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const backoff = attempt * 2000;   // 2s, 4s, 6s
        console.warn(`⚠️ [sign-tx] TRY_AGAIN_LATER — retry ${attempt}/3 in ${backoff / 1000}s…`);
        await new Promise(r => setTimeout(r, backoff));
        try {
          const freshAccount = await server.getAccount(keypair.publicKey());
          const freshTx = rebuildTxWithFreshSequence(xdr, freshAccount);
          const freshPrepared = await server.prepareTransaction(freshTx);
          freshPrepared.sign(keypair);
          resp = await server.sendTransaction(freshPrepared);
          console.log(`🔄 [sign-tx] TRY_AGAIN_LATER retry ${attempt} result:`, resp.status, resp.hash?.slice(0, 12) + '…');
          if (resp.status !== 'TRY_AGAIN_LATER') break;
        } catch (retryErr: any) {
          console.error(`❌ [sign-tx] TRY_AGAIN_LATER retry ${attempt} error:`, retryErr?.message);
        }
      }
      if (resp.status === 'TRY_AGAIN_LATER') {
        throw new Error('sendTransaction rejected: TRY_AGAIN_LATER after 3 retries — server still overloaded');
      }
    }

    console.log('📤 [sign-tx] Submitted:', resp.hash?.slice(0, 12) + '…', 'status:', resp.status);

    if (waitForConfirmation && resp.hash) {
      await pollUntilConfirmed(server, resp.hash);
    }

    return NextResponse.json({ hash: resp.hash });
  } catch (err: any) {
    console.error('❌ [sign-tx] Error:', err?.message);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
