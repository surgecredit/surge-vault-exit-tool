"use client";

import { useEffect, useState } from "react";
import { WalletInfo, walletFromPublicKey } from "@/lib/wallet";

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
    await unisat.switchNetwork("testnet");
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
        throw new Error("Please enter your EVM address");
      }

      const wallet = await connectUniSat(evmInput.trim());
      onWalletImported(wallet);
    } catch (err: any) {
      setError(err.message || "Failed to connect UniSat");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Access Your Vault
        </h2>
        <p className="text-gray-400 text-sm">
          Connect UniSat and enter your EVM address to load the matching vault.
        </p>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 space-y-4">
        <div>
          <label className="text-gray-400 text-sm mb-1 block">
            EVM Address
          </label>
          <input
            type="text"
            value={evmInput}
            onChange={(e) => setEvmInput(e.target.value)}
            placeholder="0x..."
            className="w-full bg-gray-800 text-white rounded-lg p-3 text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="!mt-6 w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
        >
          {loading ? "Connecting UniSat..." : "Connect UniSat"}
        </button>
      </div>
    </div>
  );
}
