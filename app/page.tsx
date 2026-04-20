"use client";

import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import ImportWallet from "@/components/ImportWallet";
import VaultDashboard from "@/components/VaultDashboard";
import { WalletInfo, walletFromPublicKey } from "@/lib/wallet";
import { VaultInfo, generateVault } from "@/lib/vault";
import packageJson from "@/package.json";

const FORM_STORAGE_KEY = "surge-vault-connect-form";
const SESSION_STORAGE_KEY = "surge-vault-session";

function VaultLoadingState() {
  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-6">
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="h-6 w-32 animate-pulse rounded bg-gray-800" />
          <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
        </div>
        <div className="rounded-lg bg-gray-800 p-4">
          <div className="h-4 w-full animate-pulse rounded bg-gray-700" />
          <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-gray-700" />
          <div className="mt-3 h-8 w-28 animate-pulse rounded-lg bg-gray-700" />
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-6 w-28 animate-pulse rounded bg-gray-800" />
          <div className="flex items-center gap-3">
            <div className="h-5 w-28 animate-pulse rounded bg-gray-800" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-800" />
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-700" />
            <div className="mt-3 h-7 w-24 animate-pulse rounded bg-gray-700" />
            <div className="mt-2 h-3 w-14 animate-pulse rounded bg-gray-700" />
          </div>
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-700" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-700" />
          </div>
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-700" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-gray-700" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-gray-700" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 1 }).map((_, index) => (
            <div key={index} className="rounded-lg bg-gray-800 p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="h-4 w-40 animate-pulse rounded bg-gray-700" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-700" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-5 w-36 animate-pulse rounded bg-gray-700" />
                <div className="h-4 w-40 animate-pulse rounded bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 h-6 w-28 animate-pulse rounded bg-gray-800" />
        <div className="rounded-lg bg-gray-800 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="h-3 w-20 animate-pulse rounded bg-gray-700" />
              <div className="mt-3 h-6 w-12 animate-pulse rounded bg-gray-700" />
            </div>
            <div>
              <div className="h-3 w-24 animate-pulse rounded bg-gray-700" />
              <div className="mt-3 h-6 w-20 animate-pulse rounded bg-gray-700" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-gray-700" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ensure Buffer is available globally in browser
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

export default function Home() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [hasStoredSession, setHasStoredSession] = useState<boolean | null>(null);
  const [vaultReady, setVaultReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    try {
      const saved = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!saved) {
        setHasStoredSession(false);
        return;
      }

      setHasStoredSession(true);

      const parsed = JSON.parse(saved) as {
        publicKeyHex?: string;
        paymentAddress?: string;
        evmAddress?: string;
      };

      if (!parsed.publicKeyHex?.trim() || !parsed.evmAddress?.trim()) {
        setHasStoredSession(false);
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
      setHasStoredSession(false);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      if (!cancelled) {
        setHydrated(true);
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const handleWalletImported = (w: WalletInfo) => {
    setWallet(w);
    setHasStoredSession(true);
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
    setHasStoredSession(false);
    setVaultReady(false);
    setMenuOpen(false);
    window.localStorage.removeItem(FORM_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const walletLabel = wallet?.paymentAddress
    ? `${wallet.paymentAddress.slice(0, 6)}...${wallet.paymentAddress.slice(-4)}`
    : null;
  const appVersion = packageJson.version;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div>
              <h1 className="text-xl font-bold text-orange-500">
                Surge Taproot Vault Sovereign Recovery Tool
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Recover BTC from your Surge Taproot Vault via the timelock exit path. Non-custodial, on-chain, verifiable.
              </p>
            </div>
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
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
        {!hydrated ? (
          hasStoredSession ? (
            <VaultLoadingState />
          ) : hasStoredSession === false ? (
            <ImportWallet onWalletImported={handleWalletImported} />
          ) : null
        ) : !wallet || !vault ? (
          <ImportWallet onWalletImported={handleWalletImported} />
        ) : (
          <>
            {!vaultReady && <VaultLoadingState />}
            <VaultDashboard
              wallet={wallet}
              vault={vault}
              className={vaultReady ? "" : "hidden"}
              onInitialLoadComplete={() => setVaultReady(true)}
            />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <a
                href="https://twitter.com/surge_credit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-orange-400 transition-colors"
                aria-label="Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com/surgebuild"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-orange-400 transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
              <a
                href="https://linkedin.com/company/surgecreditd"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-orange-400 transition-colors"
                aria-label="LinkedIn"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
            <div className="text-xs text-gray-400 text-center sm:text-right">
              © 2026{" "}
              <a
                href="https://surge.build"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline hover:text-orange-400 transition-colors"
              >
                surge.build
              </a>{" "}
              · v{appVersion}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
