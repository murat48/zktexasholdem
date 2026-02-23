import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import { readFileSync } from 'fs';

const circuit = JSON.parse(readFileSync('/home/muratkeskin/zkstellar/texasholdem/circuits/target/zk_poker_circuits.json', 'utf8'));

const saltDec = '123456789';
const holeCards = [0, 13];
const communityCards = [1, 2, 3, 4, 5];
const rank = 8; // straight flush
const commitment = (BigInt(saltDec) + BigInt(holeCards[0]) * 100n + BigInt(holeCards[1])).toString();
const inputs = { hole_cards: holeCards, salt: saltDec, card_commitment: commitment, community_cards: communityCards, claimed_rank: rank };

console.log('Executing circuit...');
const noir = new Noir(circuit);
const { witness } = await noir.execute(inputs);
console.log('Witness OK:', witness.length, 'bytes');

console.log('Generating Barretenberg proof (15-60s)...');
const t = Date.now();
const backend = new BarretenbergBackend(circuit, { threads: 1 });
const proofData = await backend.generateProof(witness);
console.log('PROOF DONE in', ((Date.now()-t)/1000).toFixed(1), 's —', proofData.proof.length, 'bytes');
await backend.destroy();
