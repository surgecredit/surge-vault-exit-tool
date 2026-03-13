"use client";

import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import ImportWallet from "@/components/ImportWallet";
import VaultDashboard from "@/components/VaultDashboard";
import { WalletInfo, walletFromPublicKey } from "@/lib/wallet";
import { VaultInfo, generateVault } from "@/lib/vault";

const FORM_STORAGE_KEY = "surge-vault-connect-form";
const SESSION_STORAGE_KEY = "surge-vault-session";

// Ensure Buffer is available globally in browser
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

export default function Home() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [vaultReady, setVaultReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setHydrated(true);
      }
    }, 1500);

    try {
      const saved = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as {
        publicKeyHex?: string;
        paymentAddress?: string;
        evmAddress?: string;
      };

      if (!parsed.publicKeyHex?.trim() || !parsed.evmAddress?.trim()) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        return;
      }

      const restoredWallet = walletFromPublicKey(
        parsed.publicKeyHex,
        parsed.evmAddress,
        parsed.paymentAddress,
      );

      if (!cancelled) {
        setWallet(restoredWallet);
        setVaultReady(false);
        setVault(
          generateVault(
            restoredWallet.xOnlyPublicKey,
            restoredWallet.evmAddress,
          ),
        );
      }
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      window.clearTimeout(fallbackTimer);
      if (!cancelled) {
        setHydrated(true);
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const handleWalletImported = (w: WalletInfo) => {
    setWallet(w);
    setVaultReady(false);
    const v = generateVault(w.xOnlyPublicKey, w.evmAddress);
    setVault(v);
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        publicKeyHex: w.publicKey.toString("hex"),
        paymentAddress: w.paymentAddress,
        evmAddress: w.evmAddress,
      }),
    );
  };

  const handleReset = () => {
    setWallet(null);
    setVault(null);
    setVaultReady(false);
    setMenuOpen(false);
    window.localStorage.removeItem(FORM_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const walletLabel = wallet?.paymentAddress
    ? `${wallet.paymentAddress.slice(0, 6)}...${wallet.paymentAddress.slice(-4)}`
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-500">
              Surge Vault Sovereign Tool
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Taproot Script-Path Exit
            </p>
          </div>
          {wallet && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg transition"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
                <span className="font-mono">{walletLabel}</span>
                <span className="text-gray-400">▾</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-36  rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                  <button
                    onClick={handleReset}
                    className="w-full rounded-md px-3 py-2 text-center text-sm text-red-300 hover:bg-gray-800"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {!hydrated ? (
          <div className="max-w-lg mx-auto bg-gray-900 rounded-xl p-6 border border-gray-700 text-center text-gray-400">
            Loading vault data...
          </div>
        ) : !wallet || !vault ? (
          <ImportWallet onWalletImported={handleWalletImported} />
        ) : (
          <>
            {!vaultReady && (
              <div className="max-w-lg mx-auto bg-gray-900 rounded-xl p-6 border border-gray-700 text-center text-gray-400">
                Loading vault data...
              </div>
            )}
            <VaultDashboard
              wallet={wallet}
              vault={vault}
              className={vaultReady ? "" : "hidden"}
              onInitialLoadComplete={() => setVaultReady(true)}
            />
          </>
        )}
      </main>
    </div>
  );
}
