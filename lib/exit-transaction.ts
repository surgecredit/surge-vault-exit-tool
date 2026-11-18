import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import {
  NETWORK,
  Utxo,
  pushTx,
  estimateExitTxVsize,
  getFeeRates,
  getTipHeight,
} from "./bitcoin";
import { createExitScript } from "./scripts";
import { VaultInfo } from "./vault";

bitcoin.initEccLib(ecc);

// Refuse to build a sweep that spends more than this share of the vault on fees.
const MAX_FEE_SHARE = 0.2;

export type ExitTransactionResult = {
  txid: string;
  txHex: string;
  fee: number;
  amountSent: number;
};

export type ExitTransactionBuildResult = {
  psbtHex: string;
  fee: number;
  amountSent: number;
};

/**
 * Build an exit transaction PSBT for wallet signing.
 *
 * This uses the EXIT script path (user-only, after timelock).
 */
export async function buildExitTransaction(
  vault: VaultInfo,
  utxos: Utxo[],
  destinationAddress: string,
  userXOnly: Buffer,
): Promise<ExitTransactionBuildResult> {
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
  // Lock one block behind the tip, so a node that is a block behind still
  // accepts it.
  psbt.setLocktime(Math.max(0, (await getTipHeight()) - 1));

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

  const feeRates = await getFeeRates(); // validated: 1..MAX_FEE_RATE_SAT_VB
  const feeRate = Math.ceil(feeRates.halfHourFee);
  const vsize = estimateExitTxVsize(utxos.length, false); // no change, sweeping all
  const fee = Math.max(vsize * feeRate, 250); // minimum 250 sats

  if (fee > totalInput * MAX_FEE_SHARE) {
    throw new Error(
      `Fee of ${fee} sats (${feeRate} sat/vB) is more than ${MAX_FEE_SHARE * 100}% of the vault. Wait for lower fees.`,
    );
  }

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

  return {
    psbtHex: psbt.toHex(),
    fee,
    amountSent: amountToSend,
  };
}

export async function finalizeAndBroadcastExitPsbt(
  signedPsbtHex: string,
  fee: number,
  amountSent: number,
): Promise<ExitTransactionResult> {
  const psbt = bitcoin.Psbt.fromHex(signedPsbtHex, { network: NETWORK });

  const needsFinalize = psbt.data.inputs.some(
    (input) => !input.finalScriptWitness && !input.finalScriptSig,
  );

  if (needsFinalize) {
    psbt.finalizeAllInputs();
  }

  const tx = psbt.extractTransaction(true);

  // extractTransaction(true) skips the fee check: confirm output and fee match the build (fee only if the wallet kept input values).
  const outputTotal = tx.outs.reduce((sum, out) => sum + Number(out.value), 0);
  if (tx.outs.length !== 1 || outputTotal !== amountSent) {
    throw new Error(
      "Signed transaction does not match the one built (outputs changed). Not broadcasting.",
    );
  }
  if (psbt.data.inputs.every((input) => input.witnessUtxo)) {
    const inputTotal = psbt.data.inputs.reduce(
      (sum, input) => sum + Number(input.witnessUtxo!.value),
      0,
    );
    if (inputTotal - outputTotal !== fee) {
      throw new Error(
        "Signed transaction fee differs from the fee shown. Not broadcasting.",
      );
    }
  }

  const rawTxHex = tx.toHex();
  const txid = await pushTx(rawTxHex);

  return {
    txid,
    txHex: rawTxHex,
    fee,
    amountSent,
  };
}
