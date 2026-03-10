"use client";

import { useEffect, useState } from "react";
import {
  WalletInfo,
  walletFromMnemonic,
  walletFromPrivateKey,
} from "@/lib/wallet";

type Props = {
  onWalletImported: (wallet: WalletInfo) => void;
};

const STORAGE_KEY = "surge-vault-import";

export default function ImportWallet({ onWalletImported }: Props) {
  const [mode, setMode] = useState<"mnemonic" | "privatekey">("mnemonic");
  const [input, setInput] = useState("");
  const [evmInput, setEvmInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        mode?: "mnemonic" | "privatekey";
        input?: string;
        evmInput?: string;
      };

      if (parsed.mode === "mnemonic" || parsed.mode === "privatekey") {
        setMode(parsed.mode);
      }
      setInput(parsed.input || "");
      setEvmInput(parsed.evmInput || "");
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, input, evmInput }),
    );
  }, [mode, input, evmInput]);

  const handleImport = () => {
    setError("");
    setLoading(true);
    try {
      let wallet: WalletInfo;
      if (mode === "mnemonic") {
        wallet = walletFromMnemonic(input);
      } else {
        if (!evmInput) {
          throw new Error(
            "EVM address is required when importing by private key (needed for vault ID generation)",
          );
        }
        wallet = walletFromPrivateKey(input, evmInput);
      }
      onWalletImported(wallet);
    } catch (err: any) {
      setError(err.message || "Failed to import wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Import Your Wallet
        </h2>
        <p className="text-gray-400 text-sm">
          Enter your mnemonic phrase or private key to view your vault status.
        </p>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("mnemonic")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === "mnemonic"
                ? "bg-orange-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Mnemonic Phrase
          </button>
          <button
            onClick={() => setMode("privatekey")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === "privatekey"
                ? "bg-orange-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Private Key
          </button>
        </div>

        {/* Input fields */}
        {mode === "mnemonic" ? (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your 12 or 24 word mnemonic phrase..."
            className="w-full h-28 bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none resize-none font-mono"
          />
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter 32-byte hex private key (64 chars)..."
              className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
            />
            <input
              type="text"
              value={evmInput}
              onChange={(e) => setEvmInput(e.target.value)}
              placeholder="Enter EVM address (0x...) for vault ID generation..."
              className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        <button
          onClick={handleImport}
          disabled={loading || !input.trim()}
          className="mt-4 w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
        >
          {loading ? "Importing..." : "View Vault"}
        </button>
      </div>
    </div>
  );
}
