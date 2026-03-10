"use client";

import { useState, useEffect, useCallback } from "react";
import { getUtxos, getTipHeight, Utxo, SIGNET_EXPLORER } from "@/lib/bitcoin";
import { VaultInfo } from "@/lib/vault";

type Props = {
  vault: VaultInfo;
  onUtxosReady: (utxos: Utxo[]) => void;
  onTotalUtxoCount?: (count: number) => void;
};

export default function VaultStatus({
  vault,
  onUtxosReady,
  onTotalUtxoCount,
}: Props) {
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [tipHeight, setTipHeight] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const timelockBlocks = vault.timelockBlocks;
  const vaultAddress = vault.address;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [fetchedUtxos, height] = await Promise.all([
        getUtxos(vaultAddress),
        getTipHeight(),
      ]);
      setUtxos(fetchedUtxos);
      setTipHeight(height);
      onTotalUtxoCount?.(fetchedUtxos.length);

      // Filter eligible UTXOs (confirmed and timelock satisfied)
      const eligible = fetchedUtxos.filter(
        (u) =>
          u.status?.confirmed &&
          height - u.status.block_height >= timelockBlocks,
      );
      onUtxosReady(eligible);
    } catch (err: any) {
      setError(err.message || "Failed to fetch vault data");
    } finally {
      setLoading(false);
    }
  }, [vaultAddress, timelockBlocks, onUtxosReady, onTotalUtxoCount]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 30000); // every 30s
    return () => clearInterval(interval);
  }, [autoRefresh, refresh]);

  const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0);
  const confirmedUtxos = utxos.filter((u) => u.status?.confirmed);
  const eligibleUtxos = confirmedUtxos.filter(
    (u) => tipHeight - u.status.block_height >= timelockBlocks,
  );

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Step 3: Vault Status</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-xs rounded-lg transition"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <span className="text-gray-500 text-xs uppercase">Total Balance</span>
          <p className="text-white font-mono text-lg">
            {(totalBalance / 100_000_000).toFixed(8)}
          </p>
          <p className="text-gray-500 text-xs">{totalBalance} sats</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <span className="text-gray-500 text-xs uppercase">Current Block</span>
          <p className="text-white font-mono text-lg">
            {tipHeight.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <span className="text-gray-500 text-xs uppercase">
            Eligible UTXOs
          </span>
          <p className="text-white font-mono text-lg">
            {eligibleUtxos.length} / {utxos.length}
          </p>
          <p className="text-gray-500 text-xs">
            Timelock: {timelockBlocks.toLocaleString()} blocks
          </p>
        </div>
      </div>

      {/* UTXO list */}
      {utxos.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-500">
            No UTXOs found. Send some Signet BTC to the vault address.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {utxos.map((utxo) => {
            const confirmed = utxo.status?.confirmed;
            const blocksElapsed = confirmed
              ? tipHeight - utxo.status.block_height
              : 0;
            const timelockMet = blocksElapsed >= timelockBlocks;
            const blocksRemaining = confirmed
              ? Math.max(0, timelockBlocks - blocksElapsed)
              : timelockBlocks;

            return (
              <div
                key={`${utxo.txid}:${utxo.vout}`}
                className="bg-gray-800 rounded-lg p-3 border border-gray-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <a
                    href={`${SIGNET_EXPLORER}/tx/${utxo.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                  >
                    {utxo.txid.slice(0, 16)}...:{utxo.vout}
                  </a>
                  <span className="text-white font-mono text-sm">
                    {(utxo.value / 100_000_000).toFixed(8)} BTC
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {!confirmed ? (
                    <span className="px-2 py-0.5 bg-yellow-900 text-yellow-300 rounded">
                      Unconfirmed
                    </span>
                  ) : timelockMet ? (
                    <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded">
                      Timelock satisfied ({blocksElapsed.toLocaleString()}{" "}
                      blocks)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-red-900 text-red-300 rounded">
                      {blocksRemaining.toLocaleString()} blocks remaining (
                      {blocksElapsed.toLocaleString()}/
                      {timelockBlocks.toLocaleString()})
                    </span>
                  )}
                  {confirmed && (
                    <span className="text-gray-500">
                      Confirmed at block{" "}
                      {utxo.status.block_height.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
