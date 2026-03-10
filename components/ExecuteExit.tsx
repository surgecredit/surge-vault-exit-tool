"use client";

import { useState } from "react";
import { Utxo, SIGNET_EXPLORER } from "@/lib/bitcoin";
import { VaultInfo } from "@/lib/vault";
import { WalletInfo } from "@/lib/wallet";
import {
  executeExitTransaction,
  ExitTransactionResult,
} from "@/lib/exit-transaction";

type Props = {
  wallet: WalletInfo;
  vault: VaultInfo;
  eligibleUtxos: Utxo[];
};

export default function ExecuteExit({ wallet, vault, eligibleUtxos }: Props) {
  const [destinationAddress, setDestinationAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExitTransactionResult | null>(null);

  const totalAmount = eligibleUtxos.reduce((sum, u) => sum + u.value, 0);
  const timelockBlocks = vault.timelockBlocks;

  const handleExecute = async () => {
    setError("");
    setResult(null);
    setLoading(true);

    try {
      if (!destinationAddress.trim()) {
        throw new Error("Please enter a destination address");
      }

      const txResult = await executeExitTransaction(
        vault,
        eligibleUtxos,
        destinationAddress.trim(),
        wallet.privateKey,
        wallet.xOnlyPublicKey,
      );

      setResult(txResult);
    } catch (err: any) {
      setError(err.message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  if (eligibleUtxos.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4">
          Step 4: Execute Exit
        </h2>
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-500">
            No eligible UTXOs yet. The vault needs confirmed UTXOs that are at
            least {timelockBlocks.toLocaleString()} blocks old.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold text-white mb-4">
        Step 4: Execute Exit
      </h2>

      {!result ? (
        <>
          <p className="text-gray-400 text-sm mb-4">
            Execute the exit script path to withdraw BTC using{" "}
            <span className="text-white">only your signature</span>. The
            timelock of {timelockBlocks.toLocaleString()} blocks has been
            satisfied for {eligibleUtxos.length} UTXO(s).
          </p>

          {/* Summary */}
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
                  {(totalAmount / 100_000_000).toFixed(8)} BTC
                </p>
                <p className="text-gray-500 text-xs">{totalAmount} sats</p>
              </div>
            </div>
          </div>

          {/* Destination address */}
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

          {/* Info box */}
          <div className="bg-blue-950 border border-blue-800 rounded-lg p-3 mb-4">
            <p className="text-blue-300 text-sm">
              This will sweep all eligible UTXOs to the destination address. The
              transaction fee will be deducted from the total. No vault
              co-signature is needed.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button
            onClick={handleExecute}
            disabled={loading || !destinationAddress.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
          >
            {loading
              ? "Building & Broadcasting..."
              : "Execute Exit Transaction"}
          </button>
        </>
      ) : (
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
                href={`${SIGNET_EXPLORER}/tx/${result.txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-blue-400 hover:text-blue-300 font-mono text-sm break-all"
              >
                {result.txid}
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-xs uppercase">
                  Amount Sent
                </span>
                <p className="text-white font-mono">
                  {(result.amountSent / 100_000_000).toFixed(8)} BTC
                </p>
                <p className="text-gray-500 text-xs">
                  {result.amountSent} sats
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">
                  Fee Paid
                </span>
                <p className="text-white font-mono">
                  {(result.fee / 100_000_000).toFixed(8)} BTC
                </p>
                <p className="text-gray-500 text-xs">{result.fee} sats</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <span className="text-gray-500 text-xs uppercase">
              Raw Transaction Hex
            </span>
            <pre className="text-gray-400 font-mono text-xs break-all mt-1 max-h-32 overflow-y-auto">
              {result.txHex}
            </pre>
          </div>

          <button
            onClick={() => {
              setResult(null);
              setDestinationAddress("");
            }}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded-lg transition"
          >
            Execute Another Transaction
          </button>
        </div>
      )}
    </div>
  );
}
