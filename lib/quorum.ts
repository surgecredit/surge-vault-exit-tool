import * as bitcoin from "bitcoinjs-lib";
import { script } from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { HDKey } from "@scure/bip32";
import { NETWORK } from "./bitcoin";
import { ACTIVE_NETWORK_CONFIG } from "./config";

bitcoin.initEccLib(ecc);

/**
 * Policy 5: a k-of-n quorum of hardware keys plus the DCN key.
 *
 * Everything here is derived from public data (the users' xpubs, k, the
 * address index, and the DCN and NUMS xpubs), so the vault can be rebuilt
 * with no Surge service running. It mirrors the borrow SDK, the relayer and
 * the signer byte for byte; a difference does not throw, it derives a
 * different address.
 */

export const QUORUM_EXIT_CSV_BLOCKS = 53424;

const BRANCH_PRIMARY = 0;
const BRANCH_SECONDARY = 2;
const MAX_USER_KEYS = 5;

const XPUB_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e };
const TPUB_VERSIONS = { private: 0x04358394, public: 0x043587cf };

export type QuorumKey = {
  xpub: string;
  /** Master fingerprint, 8 hex chars. Needed only to sign. */
  fingerprint?: string;
  /** Account path without `m/`, e.g. `86'/1'/0'`. Needed only to sign. */
  path?: string;
  label?: string;
};

export type QuorumBackup = {
  threshold: number;
  addressIndex: number;
  keys: QuorumKey[];
  loanXpub: string;
  numsXpub: string;
  /** When the backup states the address, the rebuilt one must match it. */
  vaultAddress?: string;
  /** Exit timelock in blocks. Only test vaults differ from the real 53424. */
  timelockBlocks?: number;
};

export type QuorumVault = {
  address: string;
  threshold: number;
  addressIndex: number;
  /** Keys in canonical order: the order the scripts use. */
  keys: QuorumKey[];
  userExitKeys: Buffer[];
  internalXOnly: Buffer;
  scriptTree: [{ output: Buffer }, [{ output: Buffer }, { output: Buffer }]];
  repaymentScript: Buffer;
  liquidationScript: Buffer;
  exitScript: Buffer;
  timelockBlocks: number;
  payment: bitcoin.Payment;
  loanXpub: string;
  numsXpub: string;
};

export function parseXpub(key: string): HDKey {
  const trimmed = key.trim();
  try {
    return HDKey.fromExtendedKey(trimmed, XPUB_VERSIONS);
  } catch {
    try {
      return HDKey.fromExtendedKey(trimmed, TPUB_VERSIONS);
    } catch {
      throw new Error(`Not a valid xpub or tpub: ${trimmed.slice(0, 12)}...`);
    }
  }
}

/** Public key plus chain code: what identifies an account, whatever its prefix. */
export function xpubMaterial(key: string): Buffer {
  const node = parseXpub(key);
  return Buffer.concat([Buffer.from(node.publicKey!), Buffer.from(node.chainCode!)]);
}

/** The account's first receive address, `/0/0` as a taproot key: what wallets show as its address. */
export function accountAddress(xpub: string): string {
  return bitcoin.payments.p2tr({
    internalPubkey: childXOnly(parseXpub(xpub), 0, 0),
    network: NETWORK,
  }).address!;
}

function childXOnly(node: HDKey, branch: number, index: number): Buffer {
  const pub = node.deriveChild(branch).deriveChild(index).publicKey;
  if (!pub) throw new Error("Could not derive a child public key");
  return Buffer.from(pub).subarray(1, 33);
}

/**
 * `multi_a` does not sort, so every implementation sorts the account keys the
 * same way: by public key, then chain code. Never by the base58 string.
 */
export function canonicalOrder(keys: QuorumKey[]): QuorumKey[] {
  return [...keys].sort((a, b) => Buffer.compare(xpubMaterial(a.xpub), xpubMaterial(b.xpub)));
}

function multiA(keys: Buffer[], threshold: number, verify: boolean): (Buffer | number)[] {
  const chunks: (Buffer | number)[] = [];
  keys.forEach((key, i) => {
    chunks.push(key);
    chunks.push(i === 0 ? script.OPS.OP_CHECKSIG : script.OPS.OP_CHECKSIGADD);
  });
  chunks.push(script.number.encode(threshold));
  chunks.push(verify ? script.OPS.OP_NUMEQUALVERIFY : script.OPS.OP_NUMEQUAL);
  return chunks;
}

export function createQuorumRepaymentScript(users: Buffer[], loan: Buffer, threshold: number): Buffer {
  if (users.length === 1) return script.compile(multiA([users[0], loan], 2, false));
  return script.compile([...multiA(users, threshold, true), loan, script.OPS.OP_CHECKSIG]);
}

export function createQuorumLiquidationScript(loan: Buffer): Buffer {
  return script.compile([loan, script.OPS.OP_CHECKSIG]);
}

/** `and_v(v:multi_a(k, users), older(n))`, or `and_v(v:pk(user), older(n))` for one key. */
export function createQuorumExitScript(
  users: Buffer[],
  threshold: number,
  timelockBlocks = QUORUM_EXIT_CSV_BLOCKS,
): Buffer {
  const head: (Buffer | number)[] =
    users.length === 1 ? [users[0], script.OPS.OP_CHECKSIGVERIFY] : multiA(users, threshold, true);
  return script.compile([
    ...head,
    script.number.encode(timelockBlocks),
    script.OPS.OP_CHECKSEQUENCEVERIFY,
  ]);
}

function validate(backup: QuorumBackup) {
  const n = backup.keys.length;
  if (n === 0) throw new Error("The vault needs at least one key");
  if (n > MAX_USER_KEYS) throw new Error(`At most ${MAX_USER_KEYS} keys are supported`);
  if (!Number.isInteger(backup.threshold) || backup.threshold < 1 || backup.threshold > n) {
    throw new Error(`Threshold must be between 1 and ${n}`);
  }
  if (!Number.isInteger(backup.addressIndex) || backup.addressIndex < 0 || backup.addressIndex >= 2 ** 31) {
    throw new Error("Address index must be a whole number from 0");
  }
  const seen = new Set(backup.keys.map((k) => xpubMaterial(k.xpub).toString("hex")));
  if (seen.size !== n) throw new Error("The same key is listed twice");
}

export function generateQuorumVault(backup: QuorumBackup): QuorumVault {
  validate(backup);
  const i = backup.addressIndex;
  const keys = canonicalOrder(backup.keys);
  const nodes = keys.map((k) => parseXpub(k.xpub));
  const loan = parseXpub(backup.loanXpub);
  const userRepay = nodes.map((n) => childXOnly(n, BRANCH_PRIMARY, i));
  const userExit = nodes.map((n) => childXOnly(n, BRANCH_SECONDARY, i));
  const loanRepay = childXOnly(loan, BRANCH_PRIMARY, i);
  const loanLiq = childXOnly(loan, BRANCH_SECONDARY, i);
  const internalXOnly = childXOnly(parseXpub(backup.numsXpub), BRANCH_PRIMARY, i);

  const repaymentScript = createQuorumRepaymentScript(userRepay, loanRepay, backup.threshold);
  const liquidationScript = createQuorumLiquidationScript(loanLiq);
  const timelockBlocks = backup.timelockBlocks ?? QUORUM_EXIT_CSV_BLOCKS;
  if (!Number.isInteger(timelockBlocks) || timelockBlocks < 1 || timelockBlocks > 65535) {
    throw new Error("The exit timelock must be a whole number of blocks from 1 to 65535");
  }
  const exitScript = createQuorumExitScript(userExit, backup.threshold, timelockBlocks);
  const scriptTree: QuorumVault["scriptTree"] = [
    { output: repaymentScript },
    [{ output: liquidationScript }, { output: exitScript }],
  ];

  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalXOnly,
    scriptTree: scriptTree as any,
    network: NETWORK,
  });
  const address = payment.address!;
  if (backup.vaultAddress && backup.vaultAddress.trim() !== address) {
    throw new Error(
      `These keys rebuild ${address}, not the vault address in the backup (${backup.vaultAddress.trim()}). Check the keys, threshold and address index.`,
    );
  }

  return {
    address,
    threshold: backup.threshold,
    addressIndex: i,
    keys,
    userExitKeys: userExit,
    internalXOnly,
    scriptTree,
    repaymentScript,
    liquidationScript,
    exitScript,
    timelockBlocks,
    payment,
    loanXpub: backup.loanXpub,
    numsXpub: backup.numsXpub,
  };
}
