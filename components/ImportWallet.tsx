"use client";

import { useEffect, useState } from "react";
import { WalletInfo, walletFromPublicKey } from "@/lib/wallet";
import { ACTIVE_NETWORK_CONFIG, APP_CONFIG } from "@/lib/config";

type Props = {
  onWalletImported: (wallet: WalletInfo) => void;
};

const FORM_STORAGE_KEY = "surge-vault-connect-form";

async function connectUniSat(evmAddress: string) {
  const unisat = (window as any).unisat;

  if (typeof window === "undefined" || !unisat) {
    window.open("https://unisat.io", "_blank");
    throw new Error(
      "UniSat wallet not detected. Please install the extension.",
    );
  }

  try {
    await unisat.switchNetwork(ACTIVE_NETWORK_CONFIG.unisatNetwork);
  } catch {
    // UniSat may already be on the correct network.
  }

  const accounts = await unisat.requestAccounts();
  if (!accounts.length) {
    throw new Error("No UniSat account available");
  }

  const publicKeyHex = await unisat.getPublicKey();
  if (!publicKeyHex) {
    throw new Error("Failed to get public key from UniSat");
  }

  return walletFromPublicKey(publicKeyHex, evmAddress, accounts[0]);
}

export default function ImportWallet({ onWalletImported }: Props) {
  const [evmInput, setEvmInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search)
        .get("address")
        ?.trim();
      if (fromUrl) {
        setEvmInput(fromUrl);
        return;
      }
    } catch {
      // ignore malformed URL search
    }

    const saved = window.localStorage.getItem(FORM_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as { evmInput?: string };
      setEvmInput(parsed.evmInput || "");
    } catch {
      window.localStorage.removeItem(FORM_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ evmInput }));
  }, [evmInput]);

  const handleConnect = async () => {
    setError("");
    setLoading(true);

    try {
      if (!evmInput.trim()) {
        throw new Error("Please enter your credit address");
      }

      const wallet = await connectUniSat(evmInput.trim());
      onWalletImported(wallet);
    } catch (err: any) {
      setError(err.message || "Failed to connect Bitcoin wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Access Your Taproot Vault
        </h2>
        <p className="text-gray-400 text-sm">
          Enter your credit address and connect your Bitcoin wallet to load your
          Taproot Vault on {ACTIVE_NETWORK_CONFIG.networkLabel}.
        </p>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 space-y-4">
        <div>
          <label className="text-gray-400 text-sm mb-1 block">
            Credit Address
          </label>
          <input
            type="text"
            value={evmInput}
            onChange={(e) => setEvmInput(e.target.value)}
            placeholder="0x..."
            className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
          />
          <p className="text-gray-500 text-xs mt-1">
            The address you used when opening your Surge Credit Line.
          </p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="!mt-6 w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
        >
          {loading ? "Connecting Bitcoin Wallet..." : "Connect Bitcoin Wallet"}
        </button>

        <p className="text-xs text-gray-500 text-center">
          Network mode:{" "}
          <span
            className={APP_CONFIG.mainnet ? "text-green-400" : "text-orange-400"}
          >
            {APP_CONFIG.mainnet ? "Mainnet" : "Signet"}
          </span>
        </p>
      </div>
    </div>
  );
}
