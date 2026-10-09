import { Contract, JsonRpcProvider, encodeBase58, getAddress, getBytes, hexlify } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import { ACTIVE_NETWORK_CONFIG } from "./config";
import { getAddressActivity } from "./bitcoin";
import { QUORUM_EXIT_CSV_BLOCKS, QuorumKey, QuorumVault, generateQuorumVault } from "./quorum";

/**
 * Reading a multisig vault's keys from the VaultKeyRegistry on Base.
 *
 * The position owner signs once to save the vault's keys, threshold and
 * address index there, and the registry only accepts them if they hash to the
 * commitment VaultManager stored for that position. So what comes back here
 * is the vault, verified on chain, readable by anyone with a Base RPC. One
 * EVM address has one vault.
 */

const REGISTRY_ABI = [
  "function getVaultKeysOfAddress(address owner) view returns ((bytes xpub, bytes4 masterFingerprint, uint32[] path)[] keys, uint8 threshold, uint32 addressIndex, uint256 nftId, bool registered)",
];

const HARDENED = 0x80000000;

export type RegisteredVault = {
  nftId: bigint;
  vault: QuorumVault;
  txCount: number;
  balance: number;
};

export function registryConfigured(): boolean {
  return !!ACTIVE_NETWORK_CONFIG.registry.address;
}

/** The 78-byte BIP-32 serialization as the familiar base58check string. */
export function xpubFromBytes(raw: string): string {
  const payload = Buffer.from(getBytes(raw));
  if (payload.length !== 78) throw new Error(`A registered xpub is ${payload.length} bytes, expected 78`);
  const checksum = Buffer.from(bitcoin.crypto.hash256(payload)).subarray(0, 4);
  return encodeBase58(Buffer.concat([payload, checksum]));
}

export function pathToString(path: readonly bigint[]): string {
  return path
    .map((p) => {
      const n = Number(p);
      return n >= HARDENED ? `${n - HARDENED}'` : String(n);
    })
    .join("/");
}

/**
 * The multisig vault the registry holds for this owner, rebuilt locally, or
 * an empty list when the address has registered none.
 *
 * The address is derived here from the registered keys rather than read from
 * anywhere, so what the user exits is exactly what those keys control.
 */
export async function loadVaultsFromBase(
  evmAddress: string,
  opts: { timelockBlocks?: number } = {},
): Promise<RegisteredVault[]> {
  const { address, rpcUrl } = ACTIVE_NETWORK_CONFIG.registry;
  if (!address) throw new Error(`The vault key registry is not deployed on ${ACTIVE_NETWORK_CONFIG.networkLabel} yet.`);
  let owner: string;
  try {
    owner = getAddress(evmAddress.trim());
  } catch {
    throw new Error("That is not a valid EVM address");
  }

  const registry = new Contract(address, REGISTRY_ABI, new JsonRpcProvider(rpcUrl));
  const [keys, threshold, addressIndex, nftId, registered] = await registry.getVaultKeysOfAddress(owner);
  if (!registered) return [];

  const quorumKeys: QuorumKey[] = keys.map((k: any, i: number) => ({
    xpub: xpubFromBytes(k.xpub),
    fingerprint: hexlify(k.masterFingerprint).slice(2).toLowerCase(),
    path: pathToString(k.path),
    label: `Key ${i + 1}`,
  }));
  const vault = generateQuorumVault({
    keys: quorumKeys,
    threshold: Number(threshold),
    addressIndex: Number(addressIndex),
    loanXpub: ACTIVE_NETWORK_CONFIG.quorum.loanXpub,
    numsXpub: ACTIVE_NETWORK_CONFIG.quorum.numsXpub,
    timelockBlocks: opts.timelockBlocks ?? QUORUM_EXIT_CSV_BLOCKS,
  });
  const activity = await getAddressActivity(vault.address);
  return [{ nftId: BigInt(nftId), vault, ...activity }];
}
