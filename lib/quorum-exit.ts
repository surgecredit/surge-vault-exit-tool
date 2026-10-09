import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { NETWORK, Utxo } from "./bitcoin";
import { QuorumVault, xpubMaterial } from "./quorum";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const DUST_LIMIT = 546;

function exitLeaf(vault: QuorumVault) {
  const redeem = { output: vault.exitScript, redeemVersion: 0xc0 };
  const withRedeem = bitcoin.payments.p2tr({
    internalPubkey: vault.internalXOnly,
    scriptTree: vault.scriptTree as any,
    redeem,
    network: NETWORK,
  });
  const witness = withRedeem.witness!;
  return {
    leafVersion: 0xc0,
    script: vault.exitScript,
    controlBlock: witness[witness.length - 1],
    leafHash: Buffer.from(bitcoin.crypto.taggedHash("TapLeaf", Buffer.concat([
      Buffer.from([0xc0]),
      compactSize(vault.exitScript.length),
      vault.exitScript,
    ]))),
  };
}

export function exitLeafHash(vault: QuorumVault): Buffer {
  return exitLeaf(vault).leafHash;
}

function compactSize(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  const b = Buffer.alloc(3);
  b[0] = 0xfd;
  b.writeUInt16LE(n, 1);
  return b;
}

/** Witness per input: n slots (k signatures, the rest empty), the script, the control block. */
export function estimateQuorumExitVsize(vault: QuorumVault, inputCount: number): number {
  const n = vault.userExitKeys.length;
  const k = vault.threshold;
  const witnessPerInput =
    1 + k * 65 + (n - k) * 1 + (vault.exitScript.length + 3) + (1 + 33 + 64);
  const base = 10.5 + 1 + inputCount * 41 + 1 + 43;
  return Math.ceil((base * 4 + inputCount * witnessPerInput) / 4);
}

/**
 * Build the unsigned exit PSBT: every eligible UTXO through the exit leaf to
 * one destination. Each user key gets a BIP-32 derivation entry when its
 * origin is known, so a signer can tell which key it holds.
 */
export function buildQuorumExitPsbt(
  vault: QuorumVault,
  utxos: Utxo[],
  destinationAddress: string,
  feeRate: number,
): { psbt: bitcoin.Psbt; fee: number; amountSent: number } {
  if (utxos.length === 0) throw new Error("No coins have passed the timelock yet");
  bitcoin.address.toOutputScript(destinationAddress.trim(), NETWORK);

  const leaf = exitLeaf(vault);
  const psbt = new bitcoin.Psbt({ network: NETWORK });
  psbt.setVersion(2);

  const derivations = vault.keys
    .map((key, slot) =>
      key.fingerprint && key.path
        ? {
            masterFingerprint: Buffer.from(key.fingerprint, "hex"),
            pubkey: vault.userExitKeys[slot],
            path: `m/${key.path}/2/${vault.addressIndex}`,
            leafHashes: [leaf.leafHash],
          }
        : null,
    )
    .filter((d): d is NonNullable<typeof d> => d !== null);

  let total = 0;
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      sequence: vault.timelockBlocks,
      witnessUtxo: { script: vault.payment.output!, value: utxo.value },
      tapInternalKey: vault.internalXOnly,
      tapLeafScript: [
        { leafVersion: leaf.leafVersion, script: leaf.script, controlBlock: leaf.controlBlock },
      ],
      ...(derivations.length ? { tapBip32Derivation: derivations } : {}),
    });
    total += utxo.value;
  }

  const fee = Math.max(Math.ceil(estimateQuorumExitVsize(vault, utxos.length) * feeRate), 250);
  const amountSent = total - fee;
  if (amountSent <= DUST_LIMIT) {
    throw new Error(`After the ${fee} sat fee only ${amountSent} sats would be left, below the dust limit.`);
  }
  psbt.addOutput({ address: destinationAddress.trim(), value: amountSent });
  return { psbt, fee, amountSent };
}

/** Which user keys have signed every input. */
export function signedKeySlots(vault: QuorumVault, psbt: bitcoin.Psbt): boolean[] {
  return vault.userExitKeys.map((key) =>
    psbt.data.inputs.every((input) =>
      (input.tapScriptSig ?? []).some((s) => Buffer.from(s.pubkey).equals(key)),
    ),
  );
}

/**
 * Sign with one key's recovery words, for when the device itself is gone.
 *
 * The words never leave this page and are not stored. The derived account
 * must match one of the vault's keys, or nothing is signed.
 */
export function signWithRecoveryWords(
  vault: QuorumVault,
  psbt: bitcoin.Psbt,
  mnemonic: string,
  passphrase: string,
  accountPath: string,
): string {
  const words = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(words, wordlist)) throw new Error("Those recovery words are not valid");
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(words, passphrase));
  const path = accountPath.trim().replace(/^m\//, "");
  const account = root.derive(`m/${path}`);
  const material = Buffer.concat([Buffer.from(account.publicKey!), Buffer.from(account.chainCode!)]);
  const slot = vault.keys.findIndex((k) => xpubMaterial(k.xpub).equals(material));
  if (slot < 0) {
    throw new Error(
      `These words at m/${path} do not hold any of this vault's keys. Check the words, the passphrase and the account path.`,
    );
  }
  const child = account.deriveChild(2).deriveChild(vault.addressIndex);
  const signer = ECPair.fromPrivateKey(Buffer.from(child.privateKey!), { network: NETWORK });
  if (!Buffer.from(signer.publicKey).subarray(1, 33).equals(vault.userExitKeys[slot])) {
    throw new Error("The derived key does not match the vault's exit key");
  }
  const leafHash = exitLeafHash(vault);
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    psbt.signTaprootInput(i, signer, leafHash);
  }
  return vault.keys[slot].label || vault.keys[slot].fingerprint || `Key ${slot + 1}`;
}

/**
 * Finalize the exit leaf.
 *
 * `multi_a` reads signatures by position: every key gets a slot, empty when
 * it did not sign, and exactly k may be filled. A surplus valid signature
 * makes the count too high and the spend fails, so extras are dropped.
 */
export function finalizeQuorumExit(vault: QuorumVault, psbt: bitcoin.Psbt): bitcoin.Transaction {
  const keys = vault.userExitKeys;
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    psbt.finalizeInput(i, (_index: number, input: any) => {
      const leaf = input.tapLeafScript?.[0];
      if (!leaf) throw new Error("The exit leaf is missing from the PSBT");
      const sigs: { pubkey: Buffer; signature: Buffer }[] = input.tapScriptSig ?? [];
      const sigFor = (key: Buffer) => sigs.find((s) => Buffer.from(s.pubkey).equals(key))?.signature;
      const present = keys.filter((k) => sigFor(k));
      if (present.length < vault.threshold) {
        throw new Error(`Input ${i + 1} has ${present.length} of ${vault.threshold} signatures`);
      }
      const used = new Set(present.slice(0, vault.threshold).map((k) => k.toString("hex")));
      const slots = keys.map((k) => (used.has(k.toString("hex")) ? Buffer.from(sigFor(k)!) : Buffer.alloc(0)));
      const stack = [...slots.reverse(), Buffer.from(leaf.script), Buffer.from(leaf.controlBlock)];
      return { finalScriptWitness: witnessStack(stack) };
    });
  }
  return psbt.extractTransaction(true);
}

function witnessStack(stack: Buffer[]): Buffer {
  return Buffer.concat([compactSize(stack.length), ...stack.flatMap((item) => [compactSize(item.length), item])]);
}
