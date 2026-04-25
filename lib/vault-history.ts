import { EsploraTx, getAddressTxs } from "./bitcoin";
import { VaultInfo } from "./vault";

export type SpendPath =
  | "credit-repayment"
  | "liquidation"
  | "exit"
  | "key-path"
  | "unknown";

export const SPEND_PATH_LABEL: Record<SpendPath, string> = {
  "credit-repayment": "Credit Repayment",
  liquidation: "Liquidation",
  exit: "Exit",
  "key-path": "Key Path",
  unknown: "Unknown",
};

export type VaultHistoryEntry = {
  txid: string;
  vout: number;
  value: number;
  receivedBlockHeight?: number;
  receivedBlockTime?: number;
  spent: boolean;
  spendingTxid?: string;
  spendingTime?: number;
  spendingPath?: SpendPath;
};

function detectSpendPath(witness: string[] | undefined, vault: VaultInfo): SpendPath {
  if (!witness || witness.length === 0) return "unknown";
  if (witness.length === 1) return "key-path";

  const scriptHex = witness[witness.length - 2];
  if (!scriptHex) return "unknown";

  if (scriptHex === vault.creditRepaymentScript.toString("hex")) {
    return "credit-repayment";
  }
  if (scriptHex === vault.liquidationScript.toString("hex")) {
    return "liquidation";
  }
  if (scriptHex === vault.exitScript.toString("hex")) {
    return "exit";
  }
  return "unknown";
}

/**
 * Build the full vault output history (received + spent) from Esplora.
 * Returns one entry per output ever sent to the vault address.
 */
export async function getVaultHistory(
  vault: VaultInfo,
): Promise<VaultHistoryEntry[]> {
  const txs: EsploraTx[] = await getAddressTxs(vault.address);
  const entries = new Map<string, VaultHistoryEntry>();

  for (const tx of txs) {
    tx.vout.forEach((out, idx) => {
      if (out.scriptpubkey_address === vault.address) {
        const key = `${tx.txid}:${idx}`;
        if (!entries.has(key)) {
          entries.set(key, {
            txid: tx.txid,
            vout: idx,
            value: out.value,
            receivedBlockHeight: tx.status.block_height,
            receivedBlockTime: tx.status.block_time,
            spent: false,
          });
        }
      }
    });
  }

  for (const tx of txs) {
    for (const vin of tx.vin) {
      if (vin.prevout?.scriptpubkey_address !== vault.address) continue;
      const key = `${vin.txid}:${vin.vout}`;
      const entry = entries.get(key);
      if (!entry) continue;
      entry.spent = true;
      entry.spendingTxid = tx.txid;
      entry.spendingTime = tx.status.block_time;
      entry.spendingPath = detectSpendPath(vin.witness, vault);
    }
  }

  return Array.from(entries.values()).sort((a, b) => {
    const ah = a.receivedBlockHeight ?? Number.MAX_SAFE_INTEGER;
    const bh = b.receivedBlockHeight ?? Number.MAX_SAFE_INTEGER;
    return bh - ah;
  });
}
