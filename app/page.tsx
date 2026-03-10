"use client";

import { useState } from "react";
import { Buffer } from "buffer";
import ImportWallet from "@/components/ImportWallet";
import VaultDashboard from "@/components/VaultDashboard";
import { WalletInfo } from "@/lib/wallet";
import { VaultInfo, generateVault } from "@/lib/vault";

// Ensure Buffer is available globally in browser
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

export default function Home() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [vault, setVault] = useState<VaultInfo | null>(null);

  const handleWalletImported = (w: WalletInfo) => {
    setWallet(w);
    const v = generateVault(w.xOnlyPublicKey, w.evmAddress);
    setVault(v);
  };

  const handleReset = () => {
    setWallet(null);
    setVault(null);
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
              Switch Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {!wallet || !vault ? (
          <ImportWallet onWalletImported={handleWalletImported} />
        ) : (
          <VaultDashboard wallet={wallet} vault={vault} />
        )}
      </main>
    </div>
  );
}
