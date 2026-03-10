"use client";

import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import ImportWallet from "@/components/ImportWallet";
import VaultDashboard from "@/components/VaultDashboard";
import { WalletInfo, walletFromPrivateKey } from "@/lib/wallet";
import { VaultInfo, generateVault } from "@/lib/vault";

const IMPORT_STORAGE_KEY = "surge-vault-import";
const SESSION_STORAGE_KEY = "surge-vault-session";

// Ensure Buffer is available globally in browser
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

export default function Home() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!saved) {
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as {
        privateKeyHex?: string;
        evmAddress?: string;
      };

      if (!parsed.privateKeyHex?.trim()) {
        setHydrated(true);
        return;
      }

      const restoredWallet = walletFromPrivateKey(
        parsed.privateKeyHex,
        parsed.evmAddress,
      );

      setWallet(restoredWallet);
      setVault(
        generateVault(restoredWallet.xOnlyPublicKey, restoredWallet.evmAddress),
      );
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  const handleWalletImported = (w: WalletInfo) => {
    setWallet(w);
    const v = generateVault(w.xOnlyPublicKey, w.evmAddress);
    setVault(v);
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        privateKeyHex: w.privateKey.toString("hex"),
        evmAddress: w.evmAddress,
      }),
    );
  };

  const handleReset = () => {
    setWallet(null);
    setVault(null);
    window.localStorage.removeItem(IMPORT_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-500">
              Surge Vault Exit Demo
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Taproot Script-Path Exit | Bitcoin Signet |{" "}
              <span className="text-orange-400">
                52,416-block timelock (~1 year)
              </span>
            </p>
          </div>
          {wallet && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {!hydrated ? (
          <div className="max-w-lg mx-auto bg-gray-900 rounded-xl p-6 border border-gray-700 text-center text-gray-400">
            Restoring wallet...
          </div>
        ) : !wallet || !vault ? (
          <ImportWallet onWalletImported={handleWalletImported} />
        ) : (
          <VaultDashboard wallet={wallet} vault={vault} />
        )}
      </main>
    </div>
  );
}
