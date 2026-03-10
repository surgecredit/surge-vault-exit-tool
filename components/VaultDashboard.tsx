"use client";

import { useState, useEffect, useCallback } from "react";
import { getUtxos, getTipHeight, Utxo, SIGNET_EXPLORER } from "@/lib/bitcoin";
import { VaultInfo } from "@/lib/vault";
import { WalletInfo } from "@/lib/wallet";
import {
  executeExitTransaction,
  ExitTransactionResult,
} from "@/lib/exit-transaction";

type Props = {
  wallet: WalletInfo;
  vault: VaultInfo;
};

export default function VaultDashboard({ wallet, vault }: Props) {
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [tipHeight, setTipHeight] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copied, setCopied] = useState(false);

  // Exit transaction state
  const [destinationAddress, setDestinationAddress] = useState("");
  const [executing, setExecuting] = useState(false);
  const [exitError, setExitError] = useState("");
  const [exitResult, setExitResult] = useState<ExitTransactionResult | null>(
    null,
  );

  const timelockBlocks = vault.timelockBlocks;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [fetchedUtxos, height] = await Promise.all([
        getUtxos(vault.address),
        getTipHeight(),
      ]);
      setUtxos(fetchedUtxos);
      setTipHeight(height);
    } catch (err: any) {
      setError(err.message || "Failed to fetch vault data");
    } finally {
      setLoading(false);
    }
  }, [vault.address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, refresh]);

  const copyAddress = () => {
    navigator.clipboard.writeText(vault.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0);
  const eligibleUtxos = utxos.filter(
    (u) =>
      u.status?.confirmed &&
      tipHeight - u.status.block_height >= timelockBlocks,
  );
  const eligibleBalance = eligibleUtxos.reduce((sum, u) => sum + u.value, 0);

  const handleExecuteExit = async () => {
    setExitError("");
    setExitResult(null);
    setExecuting(true);
    try {
      if (!destinationAddress.trim()) {
        throw new Error("Please enter a destination address");
      }
      const result = await executeExitTransaction(
        vault,
        eligibleUtxos,
        destinationAddress.trim(),
        wallet.privateKey,
        wallet.xOnlyPublicKey,
      );
      setExitResult(result);
    } catch (err: any) {
      setExitError(err.message || "Transaction failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Vault Overview</h2>
          <a
            href={`${SIGNET_EXPLORER}/address/${vault.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs"
          >
            View on Explorer
          </a>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-600 mb-4">
          <p className="text-orange-400 font-mono text-sm break-all">
            {vault.address}
          </p>
          <button
            onClick={copyAddress}
            className="mt-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition"
          >
            {copied ? "Copied!" : "Copy Address"}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Vault Status</h2>
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

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <span className="text-gray-500 text-xs uppercase">
              Total Balance
            </span>
            <p className="text-white font-mono text-lg">
              {(totalBalance / 100_000_000).toFixed(8)}
            </p>
            <p className="text-gray-500 text-xs">{totalBalance} sats</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <span className="text-gray-500 text-xs uppercase">
              Current Block
            </span>
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
              No UTXOs found. Send some Signet BTC to the vault address above.
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

      <div>
        <h2 className="text-lg font-bold text-white mb-4">Execute Exit</h2>

        {exitResult ? (
          <div className="space-y-4">
            <div className="bg-green-950 border border-green-800 rounded-lg p-4">
              <h3 className="text-green-300 font-bold text-lg mb-2">
                Transaction Broadcast Successfully!
              </h3>
              <p className="text-green-400 text-sm">
                The exit transaction has been signed with only your key and
                broadcast to the network.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <div>
                <span className="text-gray-500 text-xs uppercase">
                  Transaction ID
                </span>
                <a
                  href={`${SIGNET_EXPLORER}/tx/${exitResult.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 font-mono text-sm break-all"
                >
                  {exitResult.txid}
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500 text-xs uppercase">
                    Amount Sent
                  </span>
                  <p className="text-white font-mono">
                    {(exitResult.amountSent / 100_000_000).toFixed(8)} BTC
                  </p>
                  <p className="text-gray-500 text-xs">
                    {exitResult.amountSent} sats
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase">
                    Fee Paid
                  </span>
                  <p className="text-white font-mono">
                    {(exitResult.fee / 100_000_000).toFixed(8)} BTC
                  </p>
                  <p className="text-gray-500 text-xs">{exitResult.fee} sats</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setExitResult(null);
                setDestinationAddress("");
                refresh();
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded-lg transition"
            >
              Done
            </button>
          </div>
        ) : eligibleUtxos.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-500">
              No eligible UTXOs. The vault needs confirmed UTXOs that are at
              least {timelockBlocks.toLocaleString()} blocks old.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500 text-xs uppercase">
                    Eligible UTXOs
                  </span>
                  <p className="text-white font-mono">{eligibleUtxos.length}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase">
                    Total Available
                  </span>
                  <p className="text-white font-mono">
                    {(eligibleBalance / 100_000_000).toFixed(8)} BTC
                  </p>
                  <p className="text-gray-500 text-xs">
                    {eligibleBalance} sats
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-gray-400 text-sm mb-1 block">
                Destination Address
              </label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                placeholder="Enter signet Bitcoin address (tb1...)"
                className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
              />
            </div>

            {exitError && (
              <p className="text-red-400 text-sm mb-3">{exitError}</p>
            )}

            <button
              onClick={handleExecuteExit}
              disabled={executing || !destinationAddress.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
            >
              {executing
                ? "Building & Broadcasting..."
                : "Execute Exit Transaction"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
