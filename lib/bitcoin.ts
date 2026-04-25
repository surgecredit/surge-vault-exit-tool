import * as bitcoin from "bitcoinjs-lib";
import { ACTIVE_NETWORK_CONFIG, APP_CONFIG } from "./config";

export const NETWORK = APP_CONFIG.mainnet
  ? bitcoin.networks.bitcoin
  : bitcoin.networks.testnet;

const BTC_API = ACTIVE_NETWORK_CONFIG.btcApi;
const BTC_ESPLORA_API = ACTIVE_NETWORK_CONFIG.btcEsploraApi;
export const BTC_EXPLORER = ACTIVE_NETWORK_CONFIG.explorer;
export const NETWORK_LABEL = ACTIVE_NETWORK_CONFIG.networkLabel;
export const IS_MAINNET = APP_CONFIG.mainnet;

export type Utxo = {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
};

export type EsploraTxStatus = {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
};

export type EsploraTxVin = {
  txid: string;
  vout: number;
  prevout?: {
    scriptpubkey_address?: string;
    value?: number;
  };
  witness?: string[];
};

export type EsploraTxVout = {
  scriptpubkey_address?: string;
  value: number;
};

export type EsploraTx = {
  txid: string;
  status: EsploraTxStatus;
  vin: EsploraTxVin[];
  vout: EsploraTxVout[];
};

/**
 * Fetch UTXOs for an address from the Esplora API.
 */
export async function getUtxos(address: string): Promise<Utxo[]> {
  const res = await fetch(`${BTC_ESPLORA_API}/address/${address}/utxo`);
  if (!res.ok) throw new Error(`Failed to fetch UTXOs: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch the recent transaction history for an address from the Esplora API.
 */
export async function getAddressTxs(address: string): Promise<EsploraTx[]> {
  const res = await fetch(`${BTC_ESPLORA_API}/address/${address}/txs`);
  if (!res.ok) throw new Error(`Failed to fetch txs: ${res.statusText}`);
  return res.json();
}

/**
 * Get the current tip block height.
 */
export async function getTipHeight(): Promise<number> {
  const res = await fetch(`${BTC_ESPLORA_API}/blocks/tip/height`);
  if (!res.ok) throw new Error(`Failed to fetch tip height: ${res.statusText}`);
  const text = await res.text();
  return parseInt(text, 10);
}

/**
 * Broadcast a raw transaction hex to the network.
 * Returns the txid on success.
 */
export async function pushTx(rawTxHex: string): Promise<string> {
  const res = await fetch(`${BTC_ESPLORA_API}/tx`, {
    method: "POST",
    body: rawTxHex,
    headers: { "Content-Type": "text/plain" },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to broadcast tx: ${errorText}`);
  }
  return res.text();
}

/**
 * Fetch the fee rate recommendations.
 */
export async function getFeeRates(): Promise<{
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}> {
  const res = await fetch(`${BTC_API}/v1/fees/recommended`);
  if (!res.ok) {
    // Fallback to a sensible default if fee API is unavailable
    return {
      fastestFee: 2,
      halfHourFee: 1,
      hourFee: 1,
      economyFee: 1,
      minimumFee: 1,
    };
  }
  return res.json();
}

/**
 * Estimate the transaction virtual size for a Taproot script-path spend.
 * This is a simplified estimation for the exit script path.
 *
 * Exit script: CSV + DROP + pubkey + CHECKSIG = ~40 bytes script
 * Merkle depth for exit: 2 (2 hashes in control block)
 * Signatures: 1 (user only)
 */
export function estimateExitTxVsize(
  inputCount: number,
  hasChange: boolean,
): number {
  const outputCount = hasChange ? 2 : 1;

  // Base transaction overhead
  const txOverhead = 10.5; // version(4) + marker(0.25) + flag(0.25) + locktime(4) + segwit_discount

  // Input size (non-witness)
  const inputBase = 41; // prevout(36) + scriptSig_len(1) + sequence(4)

  // Output size
  const outputSize = 43; // value(8) + scriptPubKey(1+34) for P2TR

  // Witness for Taproot script-path exit:
  // - 1 Schnorr signature: 64 bytes
  // - Exit script: ~40 bytes
  // - Control block: 33 + 32*merkle_depth = 33 + 64 = 97 bytes
  // - witness item count: 1 byte
  // - length prefixes: ~4 bytes
  const witnessPerInput = 64 + 40 + 97 + 5; // ~206 bytes

  // Calculate weight
  const baseSize =
    txOverhead +
    1 + // input count varint
    inputCount * inputBase +
    1 + // output count varint
    outputCount * outputSize;

  const witnessSize = inputCount * witnessPerInput;

  // Weight = base * 4 + witness (witness already at 1x discount)
  const weight = baseSize * 4 + witnessSize;
  const vsize = Math.ceil(weight / 4);

  return vsize;
}
