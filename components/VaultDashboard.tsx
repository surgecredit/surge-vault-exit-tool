"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as bitcoin from "bitcoinjs-lib";
import {
  BTC_EXPLORER,
  getTipHeight,
  NETWORK_LABEL,
  Utxo,
} from "@/lib/bitcoin";
import { VaultInfo } from "@/lib/vault";
import { WalletInfo } from "@/lib/wallet";
import {
  buildExitTransaction,
  ExitTransactionResult,
  finalizeAndBroadcastExitPsbt,
} from "@/lib/exit-transaction";
import {
  SPEND_PATH_LABEL,
  VaultHistoryEntry,
  getVaultHistory,
} from "@/lib/vault-history";
import TaprootTreeVisual from "./TaprootTreeVisual";

function getXverseProvider() {
  return (
    (window as any).XverseProviders?.BitcoinProvider ||
    (window as any).xverseProviders?.BitcoinProvider ||
    (window as any).BitcoinProvider
  );
}

function unwrapWalletResponse(response: any) {
  if (response?.status === "error") {
    throw new Error(response.error?.message || "Wallet request failed");
  }
  return response?.status === "success" ? response.result : response;
}

type Props = {
  wallet: WalletInfo;
  vault: VaultInfo;
  className?: string;
  onInitialLoadComplete?: () => void;
};

export default function VaultDashboard({
  wallet,
  vault,
  className = "",
  onInitialLoadComplete,
}: Props) {
  const [history, setHistory] = useState<VaultHistoryEntry[]>([]);
  const [tipHeight, setTipHeight] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Exit transaction state
  const [destinationAddress, setDestinationAddress] = useState(
    wallet.paymentAddress || "",
  );
  const [executing, setExecuting] = useState(false);
  const [exitError, setExitError] = useState("");
  const [exitResult, setExitResult] = useState<ExitTransactionResult | null>(
    null,
  );
  const initialLoadReportedRef = useRef(false);

  const timelockBlocks = vault.timelockBlocks;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [fetchedHistory, height] = await Promise.all([
        getVaultHistory(vault),
        getTipHeight(),
      ]);
      setHistory(fetchedHistory);
      setTipHeight(height);
    } catch (err: any) {
      setError(err.message || "Failed to fetch vault data");
    } finally {
      if (!initialLoadReportedRef.current) {
        initialLoadReportedRef.current = true;
        onInitialLoadComplete?.();
      }
      setLoading(false);
    }
  }, [onInitialLoadComplete, vault]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    setDestinationAddress(wallet.paymentAddress || "");
  }, [wallet.paymentAddress]);

  const copyAddress = () => {
    navigator.clipboard.writeText(vault.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unspentEntries = history.filter((e) => !e.spent);
  const totalBalance = unspentEntries.reduce((sum, e) => sum + e.value, 0);
  const eligibleEntries = unspentEntries.filter(
    (e) =>
      e.receivedBlockHeight !== undefined &&
      tipHeight - e.receivedBlockHeight >= timelockBlocks,
  );
  const eligibleBalance = eligibleEntries.reduce((sum, e) => sum + e.value, 0);
  const hasEligibleUtxos = eligibleEntries.length > 0;
  const hasAnyUtxos = history.length > 0;
  const shortVaultAddress = `${vault.address.slice(0, 10)}...${vault.address.slice(-10)}`;

  const eligibleUtxosForExit: Utxo[] = eligibleEntries.map((e) => ({
    txid: e.txid,
    vout: e.vout,
    value: e.value,
    status: {
      confirmed: e.receivedBlockHeight !== undefined,
      block_height: e.receivedBlockHeight ?? 0,
      block_hash: "",
      block_time: e.receivedBlockTime ?? 0,
    },
  }));

  const formatBtc = (sats: number) => {
    return (sats / 100_000_000).toFixed(8).replace(/\.0+$|0+$/g, "");
  };

  const handleExecuteExit = async () => {
    setExitError("");
    setExitResult(null);
    setExecuting(true);
    try {
      if (!destinationAddress.trim()) {
        throw new Error("Please enter a destination address");
      }

      const buildResult = await buildExitTransaction(
        vault,
        eligibleUtxosForExit,
        destinationAddress.trim(),
        wallet.xOnlyPublicKey,
      );

      const walletProvider = wallet.walletProvider || "unisat";
      let signedPsbtHex: string;

      if (walletProvider === "xverse") {
        const xverseProvider = getXverseProvider();
        if (typeof window === "undefined" || !xverseProvider) {
          throw new Error(
            "Xverse wallet not detected. Please install or unlock it.",
          );
        }

        const xverseSigningAddress = wallet.signingAddress || wallet.taprootAddress;
        const signResult = unwrapWalletResponse(
          await xverseProvider.request("signPsbt", {
            psbt: bitcoin.Psbt.fromHex(buildResult.psbtHex).toBase64(),
            signInputs: {
              [xverseSigningAddress]: Array.from(
                { length: eligibleUtxosForExit.length },
                (_, index) => index,
              ),
            },
            broadcast: false,
          }),
        );

        if (!signResult?.psbt) {
          throw new Error("Xverse did not return a signed PSBT");
        }

        signedPsbtHex = bitcoin.Psbt.fromBase64(signResult.psbt).toHex();
      } else {
        const unisat = (window as any).unisat;
        if (typeof window === "undefined" || !unisat) {
          throw new Error(
            "UniSat wallet not detected. Please install or unlock it.",
          );
        }

        signedPsbtHex = await unisat.signPsbt(buildResult.psbtHex, {
          toSignInputs: Array.from(
            { length: eligibleUtxosForExit.length },
            (_, index) => ({
              index,
              publicKey: wallet.publicKey.toString("hex"),
              disableTweakSigner: true,
            }),
          ),
          autoFinalized: false,
        });
      }

      const result = await finalizeAndBroadcastExitPsbt(
        signedPsbtHex,
        buildResult.fee,
        buildResult.amountSent,
      );

      setExitResult(result);
    } catch (err: any) {
      setExitError(err.message || "Transaction failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      className={`grid gap-4 lg:gap-6 lg:grid-cols-12 ${className}`.trim()}
    >
      <div className="min-w-0 lg:col-span-5 bg-gray-900 rounded-xl p-4 sm:p-6 space-y-6">
        {loading && !hasAnyUtxos ? (
        <div className="px-4 sm:px-8 py-12 sm:py-16 text-center">
          <div className="mx-auto max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.32em] text-gray-500">
              Taproot Vault Balance
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Loading Taproot Vault data...
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-gray-400">
              Checking your Taproot Vault balance and current unlock status.
            </p>
          </div>
        </div>
      ) : !hasAnyUtxos ? (
        <div className="px-4 sm:px-8 py-12 sm:py-16 text-center">
          <div className="mx-auto max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.32em] text-gray-500">
              Taproot Vault Balance
            </p>
            <h2 className="mt-2 flex items-center justify-center gap-2 text-5xl font-semibold tracking-tight text-white">
              <span>0</span>
              <span aria-hidden="true" className="text-3xl text-orange-400">
                ₿
              </span>
            </h2>

            <a
              href={`${BTC_EXPLORER}/address/${vault.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center justify-center gap-2 font-mono text-sm text-orange-400 transition hover:text-orange-300"
            >
              <span>{shortVaultAddress}</span>
              <span
                aria-hidden="true"
                className="shrink-0 text-sm text-orange-300"
              >
                ↗
              </span>
            </a>
            <p className="mt-10 text-3xl font-semibold tracking-tight text-white">
              This Taproot Vault currently holds no BTC.
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-gray-400">
              This Taproot Vault currently has no spendable UTXOs.
              <br />
              Recovery becomes possible once BTC is deposited into the Taproot Vault and
              the timelock period has passed.
            </p>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Taproot Vault Address</h2>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={`${BTC_EXPLORER}/address/${vault.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 text-orange-400 hover:text-orange-300 hover:underline font-mono text-sm break-all"
                >
                  {vault.address}
                </a>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`${BTC_EXPLORER}/address/${vault.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in explorer"
                    aria-label="Open in explorer"
                    className="rounded-md bg-gray-700 hover:bg-gray-600 p-2 text-gray-200 transition"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 1 0 0 2h2.586L8.293 10.293a1 1 0 1 0 1.414 1.414L15 6.414V9a1 1 0 1 0 2 0V3h-6Z" />
                      <path d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3H5V7h3a1 1 0 1 0 0-2H5Z" />
                    </svg>
                  </a>
                  <button
                    onClick={copyAddress}
                    title={copied ? "Copied" : "Copy address"}
                    aria-label={copied ? "Address copied" : "Copy address"}
                    className="rounded-md bg-gray-700 hover:bg-gray-600 p-2 text-gray-200 transition"
                  >
                    {copied ? (
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-8.01 8.08a1 1 0 0 1-1.421.002l-3.99-3.99a1 1 0 1 1 1.414-1.415l3.28 3.28 7.304-7.37a1 1 0 0 1 1.417-.001Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M7 3a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7Zm6 10V8a2 2 0 0 0-2-2H7V5h7v8h-1Zm-9-5h7v7H4V8Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Taproot Vault Timelock Status</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={refresh}
                  disabled={loading}
                  title="Refresh"
                  aria-label="Refresh"
                  className="rounded-md bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 p-2 text-gray-200 disabled:text-gray-500 transition"
                >
                  <svg
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10a7 7 0 0 1 12-4.95" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 2.5v3.6h-3.6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 10a7 7 0 0 1-12 4.95" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 17.5v-3.6h3.6" />
                  </svg>
                </button>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-500 text-xs uppercase">
                    Taproot Vault Balance
                  </span>
                  <p
                    className={`font-mono text-lg ${
                      totalBalance > 0 ? "text-green-400" : "text-white"
                    }`}
                  >
                    {formatBtc(totalBalance)}
                  </p>
                  <p className="text-gray-500 text-xs">{totalBalance} sats</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-500 text-xs uppercase">
                    Current Bitcoin Block
                  </span>
                  <a
                    href={`${BTC_EXPLORER}/block/${tipHeight}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View block on explorer"
                    className="block font-mono text-lg text-sky-400 hover:text-sky-300 hover:underline"
                  >
                    {tipHeight.toLocaleString()}
                  </a>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <span className="text-gray-500 text-xs uppercase">
                    Exit Eligible UTXOs
                  </span>
                  <p className="text-white font-mono text-lg">
                    {eligibleEntries.length} / {unspentEntries.length}
                  </p>
                  <p className="text-gray-500 text-xs">
                    Timelock: {timelockBlocks.toLocaleString()} blocks
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {history.map((entry) => {
                  const confirmed = entry.receivedBlockHeight !== undefined;
                  const blocksElapsed = confirmed
                    ? tipHeight - (entry.receivedBlockHeight ?? 0)
                    : 0;
                  const timelockMet = blocksElapsed >= timelockBlocks;
                  const blocksRemaining = confirmed
                    ? Math.max(0, timelockBlocks - blocksElapsed)
                    : timelockBlocks;
                  const recoverableAtBlock = confirmed
                    ? (entry.receivedBlockHeight ?? 0) + timelockBlocks
                    : null;
                  const pathLabel = entry.spendingPath
                    ? SPEND_PATH_LABEL[entry.spendingPath]
                    : "Unknown";

                  return (
                    <div
                      key={`${entry.txid}:${entry.vout}`}
                      className="bg-gray-800 rounded-lg p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
                        <a
                          href={`${BTC_EXPLORER}/tx/${entry.txid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 hover:underline font-mono text-xs break-all min-w-0"
                        >
                          UTXO: {entry.txid.slice(0, 8)}...
                          {entry.txid.slice(-8)}:{entry.vout}
                        </a>
                        <span
                          className={`font-mono text-sm shrink-0 ${
                            entry.spent ? "text-gray-400 line-through" : "text-white"
                          }`}
                        >
                          {formatBtc(entry.value)} BTC
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        {entry.spent ? (
                          <>
                            <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded">
                              Spent via {pathLabel}
                            </span>
                            {entry.spendingTxid && (
                              <a
                                href={`${BTC_EXPLORER}/tx/${entry.spendingTxid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-400 hover:text-green-300 hover:underline font-mono"
                              >
                                spending tx: {entry.spendingTxid.slice(0, 8)}...
                                {entry.spendingTxid.slice(-8)}
                              </a>
                            )}
                          </>
                        ) : !confirmed ? (
                          <span className="px-2 py-0.5 bg-yellow-900 text-yellow-300 rounded">
                            Unconfirmed
                          </span>
                        ) : timelockMet ? (
                          <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded">
                            Available for spend
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-red-900 text-red-300 rounded">
                            Recoverable at block {" "}
                            <strong className="font-bold">
                              {recoverableAtBlock?.toLocaleString()}
                            </strong>
                          </span>
                        )}
                        {!entry.spent && confirmed && !timelockMet && (
                          <span className="text-gray-500">
                            Remaining blocks: {blocksRemaining.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white mb-4">Construct Recovery Transaction</h2>

            {exitResult ? (
              <div className="space-y-4">
                <div className="bg-green-950 border border-green-800 rounded-lg p-4">
                  <h3 className="text-green-300 font-bold text-lg mb-2">
                    Transaction Broadcast Successfully!
                  </h3>
                  <p className="text-green-400 text-sm">
                    The Taproot Vault exit transaction has been signed with only your key and
                    broadcast to the network. Non-custodial, on-chain, verifiable.
                  </p>
                </div>

                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div>
                    <span className="text-gray-500 text-xs uppercase">
                      Transaction ID
                    </span>
                     <a
                       href={`${BTC_EXPLORER}/tx/${exitResult.txid}`}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="block text-blue-400 hover:text-blue-300 hover:underline font-mono text-sm break-all"
                     >
                       {exitResult.txid}
                     </a>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500 text-xs uppercase">
                        Amount Sent
                      </span>
                      <p className="text-white font-mono">
                        {formatBtc(exitResult.amountSent)} BTC
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
                        {formatBtc(exitResult.fee)} BTC
                      </p>
                      <p className="text-gray-500 text-xs">
                        {exitResult.fee} sats
                      </p>
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
            ) : eligibleEntries.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-500">
                  No UTXOs are currently eligible for recovery.
                  <br />
                  Taproot Vault exits require a timelock of {timelockBlocks.toLocaleString()} blocks (~1 year).
                  <br />
                  Once the timelock has passed, you will be able to construct and broadcast a recovery transaction.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500 text-xs uppercase">
                        Exit Eligible UTXOs
                      </span>
                      <p className="text-white font-mono">
                        {eligibleEntries.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs uppercase">
                        Total Available
                      </span>
                      <p className="text-white font-mono">
                        {formatBtc(eligibleBalance)} BTC
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
                    placeholder={`Enter ${NETWORK_LABEL.toLowerCase()} Bitcoin address`}
                    className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
                  />
                </div>

                {exitError && (
                  <p className="text-red-400 text-sm mb-3">{exitError}</p>
                )}

                <button
                  onClick={handleExecuteExit}
                  disabled={executing || !destinationAddress.trim()}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
                >
                  {executing
                    ? "Building & Broadcasting..."
                    : "Construct Recovery Transaction"}
                </button>
              </>
            )}
          </div>
        </>
      )}
      </div>

      <div className="min-w-0 lg:col-span-7">
        <div className="lg:sticky lg:top-24">
          <TaprootTreeVisual
            vault={vault}
            borrowerAddress={wallet.paymentAddress ?? wallet.taprootAddress}
          />
        </div>
      </div>
    </div>
  );
}
