import * as bitcoin from "bitcoinjs-lib";
import { crypto as bcrypto } from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import {
  NETWORK,
  Utxo,
  pushTx,
  estimateExitTxVsize,
  getFeeRates,
} from "./bitcoin";
import { createExitScript } from "./scripts";
import { VaultInfo } from "./vault";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

function tapleafHash(leafVersion: number, scriptBuf: Buffer): Buffer {
  if (scriptBuf.length >= 0xfd) throw new Error("script too large");
  const ver = Buffer.from([leafVersion]);
  const len = Buffer.from([scriptBuf.length]);
  return Buffer.from(
    bcrypto.taggedHash("TapLeaf", Buffer.concat([ver, len, scriptBuf])),
  );
}

export type ExitTransactionResult = {
  txid: string;
  txHex: string;
  fee: number;
  amountSent: number;
};

/**
 * Build, sign, and broadcast an exit transaction.
 *
 * This uses the EXIT script path (user-only, after timelock).
 * The user signs alone with their private key — no vault co-signature needed.
 */
export async function executeExitTransaction(
  vault: VaultInfo,
  utxos: Utxo[],
  destinationAddress: string,
  userPrivateKey: Buffer,
  userXOnly: Buffer,
): Promise<ExitTransactionResult> {
  if (utxos.length === 0) {
    throw new Error("No UTXOs available in the vault");
  }

  // --- Step 1: Rebuild the exit script and get its control block ---

  const exitScript = createExitScript(userXOnly, vault.timelockBlocks);

  const redeemExit = {
    output: exitScript,
    redeemVersion: 0xc0,
  };

  // p2tr with redeem to get the control block for the exit leaf
  const paymentWithRedeem = bitcoin.payments.p2tr({
    internalPubkey: vault.internalXOnly,
    scriptTree: vault.scriptTree as any,
    redeem: redeemExit,
    network: NETWORK,
  });

  const controlBlock =
    paymentWithRedeem.witness![paymentWithRedeem.witness!.length - 1];

  const tapLeafScriptExit = {
    leafVersion: redeemExit.redeemVersion,
    script: redeemExit.output,
    controlBlock,
  };

  // --- Step 2: Create the PSBT ---

  const psbt = new bitcoin.Psbt({ network: NETWORK });

  // Transaction version must be >= 2 for CSV (OP_CHECKSEQUENCEVERIFY)
  psbt.setVersion(2);

  // Use the vault's output script (no redeem — just the overall Taproot output)
  const vaultPayment = bitcoin.payments.p2tr({
    internalPubkey: vault.internalXOnly,
    scriptTree: vault.scriptTree as any,
    network: NETWORK,
  });

  // Use all UTXOs (sweep the vault)
  let totalInput = 0;
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: vaultPayment.output!,
        value: utxo.value,
      },
      tapInternalKey: vault.internalXOnly,
      tapLeafScript: [tapLeafScriptExit as any],
      // nSequence must be >= timelockBlocks for CSV to pass
      sequence: vault.timelockBlocks,
    });
    totalInput += utxo.value;
  }

  // --- Step 3: Estimate fee ---

  const feeRates = await getFeeRates();
  const feeRate = feeRates.halfHourFee || 1;
  const vsize = estimateExitTxVsize(utxos.length, false); // no change, sweeping all
  const fee = Math.max(vsize * feeRate, 250); // minimum 250 sats

  const amountToSend = totalInput - fee;

  if (amountToSend <= 546) {
    throw new Error(
      `Amount after fee (${amountToSend} sats) is below dust limit. Need more BTC in vault.`,
    );
  }

  // --- Step 4: Add output ---

  psbt.addOutput({
    address: destinationAddress,
    value: amountToSend,
  });

  // --- Step 5: Compute sighashes and sign ---

  const unsignedTx = bitcoin.Transaction.fromBuffer(
    psbt.data.globalMap.unsignedTx.toBuffer(),
  );

  const leafHash = tapleafHash(0xc0, Buffer.from(exitScript));

  const prevOutScripts = psbt.data.inputs.map(
    (inp: any) => inp.witnessUtxo?.script!,
  );
  const inputValues = psbt.data.inputs.map(
    (inp: any) => inp.witnessUtxo?.value!,
  );

  const keyPair = ECPair.fromPrivateKey(userPrivateKey, { network: NETWORK });

  // Sign each input
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const hash = unsignedTx.hashForWitnessV1(
      i,
      prevOutScripts,
      inputValues,
      bitcoin.Transaction.SIGHASH_DEFAULT,
      Buffer.from(leafHash),
    );

    const signature = keyPair.signSchnorr(Buffer.from(hash));

    psbt.updateInput(i, {
      tapScriptSig: [
        {
          pubkey: userXOnly,
          signature: Buffer.from(signature),
          leafHash,
        },
      ],
    });
  }

  // --- Step 6: Finalize and broadcast ---

  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction(true);
  const rawTxHex = tx.toHex();

  const txid = await pushTx(rawTxHex);

  return {
    txid,
    txHex: rawTxHex,
    fee,
    amountSent: amountToSend,
  };
}
