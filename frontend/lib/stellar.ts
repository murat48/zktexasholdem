import * as StellarSDK from '@stellar/stellar-sdk';
import { Networks, BASE_FEE, Contract, rpc, TransactionBuilder } from '@stellar/stellar-sdk';

// Contract addresses from environment
export const GAME_HUB_CONTRACT = process.env.NEXT_PUBLIC_GAME_HUB_CONTRACT || 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';
export const POKER_CONTRACT = process.env.NEXT_PUBLIC_POKER_CONTRACT || '';

// Stellar configuration
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

// Initialize Soroban RPC server
const server = new rpc.Server(SOROBAN_RPC_URL);

export async function callContract(
  contractId: string,
  method: string,
  args: StellarSDK.xdr.ScVal[],
  sourcePublicKey: string,
  signTransaction: (xdr: string) => Promise<string>
): Promise<rpc.Api.GetTransactionResponse> {
  try {
    // Get account
    const sourceAccount = await server.getAccount(sourcePublicKey);
    
    // Create contract instance
    const contract = new Contract(contractId);
    
    // Build operation
    const operation = contract.call(method, ...args);
    
    // Build transaction
    let transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(operation)
      .setTimeout(180)
      .build();
    
    // Simulate transaction
    const simulated = await server.simulateTransaction(transaction);
    
    if (rpc.Api.isSimulationSuccess(simulated)) {
      // Prepare transaction with simulation results
      transaction = rpc.assembleTransaction(transaction, simulated).build();
    } else {
      throw new Error('Simulation failed');
    }
    
    // Sign transaction using wallet
    const signedXdr = await signTransaction(transaction.toXDR());
    const signedTransaction = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
    
    // Submit transaction
    const response = await server.sendTransaction(signedTransaction as any);
    
    if (response.status === 'PENDING') {
      // Poll for result
      let getResponse = await server.getTransaction(response.hash);
      
      while (getResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        getResponse = await server.getTransaction(response.hash);
      }
      
      return getResponse;
    }
    
    return response as any;
  } catch (error) {
    console.error('Contract call failed:', error);
    throw error;
  }
}

export async function startGame(
  player1: string,
  player2: string,
  sourcePublicKey: string,
  signTransaction: (xdr: string) => Promise<string>
) {
  return await callContract(
    GAME_HUB_CONTRACT,
    'start_game',
    [
      StellarSDK.nativeToScVal(player1, { type: 'address' }),
      StellarSDK.nativeToScVal(player2, { type: 'address' })
    ],
    sourcePublicKey,
    signTransaction
  );
}

export async function endGame(
  gameId: string,
  winner: string,
  sourcePublicKey: string,
  signTransaction: (xdr: string) => Promise<string>
) {
  return await callContract(
    GAME_HUB_CONTRACT,
    'end_game',
    [
      StellarSDK.nativeToScVal(gameId, { type: 'string' }),
      StellarSDK.nativeToScVal(winner, { type: 'address' })
    ],
    sourcePublicKey,
    signTransaction
  );
}

// Poker game contract functions
export async function initGame(
  gameId: string,
  player1: string,
  player2: string,
  startingChips: number,
  sourcePublicKey: string,
  signTransaction: (xdr: string) => Promise<string>
) {
  return await callContract(
    POKER_CONTRACT,
    'init_game',
    [
      StellarSDK.nativeToScVal(gameId, { type: 'bytes' }),
      StellarSDK.nativeToScVal(player1, { type: 'address' }),
      StellarSDK.nativeToScVal(player2, { type: 'address' }),
      StellarSDK.nativeToScVal(startingChips, { type: 'i128' })
    ],
    sourcePublicKey,
    signTransaction
  );
}

export async function placeBet(
  player: string,
  amount: number,
  sourcePublicKey: string,
  signTransaction: (xdr: string) => Promise<string>
) {
  return await callContract(
    POKER_CONTRACT,
    'place_bet',
    [
      StellarSDK.nativeToScVal(player, { type: 'address' }),
      StellarSDK.nativeToScVal(amount, { type: 'i128' })
    ],
    sourcePublicKey,
    signTransaction
  );
}

export async function foldHand(
  player: string,
  sourcePublicKey: string,
  signTransaction: (xdr: string) => Promise<string>
) {
  return await callContract(
    POKER_CONTRACT,
    'fold',
    [
      StellarSDK.nativeToScVal(player, { type: 'address' })
    ],
    sourcePublicKey,
    signTransaction
  );
}
