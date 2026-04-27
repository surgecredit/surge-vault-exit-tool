"use client";

import { useEffect, useState } from "react";
import { Buffer } from "buffer";
import ImportWallet from "@/components/ImportWallet";
import VaultDashboard from "@/components/VaultDashboard";
import { WalletInfo, walletFromPublicKey } from "@/lib/wallet";
import { VaultInfo, generateVault } from "@/lib/vault";
import { BTC_EXPLORER } from "@/lib/bitcoin";
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
        signingAddress?: string;
        walletProvider?: "unisat" | "xverse" | "phantom";
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
        {
          signingAddress: parsed.signingAddress,
          walletProvider: parsed.walletProvider,
        },
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
          signingAddress: w.signingAddress,
          walletProvider: w.walletProvider,
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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-bold text-orange-500 leading-tight">
              Surge Unilateral Exit Tool
            </h1>
            <p className="hidden sm:block text-gray-500 text-xs mt-0.5">
              Recover BTC from your Surge Taproot Vault via the exit path. Non-custodial, on-chain, verifiable.
            </p>
          </div>
          {wallet && (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 px-2.5 py-2 sm:px-3 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg transition"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
                <span className="font-mono">{walletLabel}</span>
                <span className="text-gray-400">▾</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-lg border border-gray-700 bg-gray-900 shadow-xl p-1.5 space-y-1">
                  <a
                    href={vault ? `${BTC_EXPLORER}/address/${vault.address}` : BTC_EXPLORER}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 inline-flex items-center justify-between"
                  >
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 12.75l8.954-8.955a2.25 2.25 0 013.182 0l5.819 5.818a2.25 2.25 0 010 3.182l-8.955 8.955a2.25 2.25 0 01-3.182 0l-5.818-5.819a2.25 2.25 0 010-3.182z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 7.5h.008v.008H7.5V7.5z"
                        />
                      </svg>
                      View on Explorer
                    </span>
                    <svg
                      className="w-3.5 h-3.5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 17L17 7M17 7H8M17 7v9"
                      />
                    </svg>
                  </a>
                  <button
                    onClick={handleReset}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-gray-800 inline-flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 15l3-3m0 0l-3-3m3 3H6"
                      />
                    </svg>
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        {!hydrated ? (
          hasStoredSession ? (
            <VaultLoadingState />
          ) : hasStoredSession === false ? (
            <ImportWallet onWalletImported={handleWalletImported} />
          ) : (
            <VaultLoadingState />
          )
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
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2.5 text-center sm:text-left sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:items-start sm:gap-3">
                <span className="inline-flex shrink-0 items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                  Open Source
                </span>
                <p className="text-xs sm:text-sm text-gray-300 leading-5 sm:leading-6">
                  This is the Surge-hosted build. Audit the code on GitHub or
                  self-host your own instance for independent recovery.
                </p>
              </div>
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-2 sm:shrink-0">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                <a
                  href="https://github.com/surgecredit/surge-vault-exit-tool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-100 transition"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  View on GitHub
                </a>
                <a
                  href="https://github.com/surgecredit/surge-vault-exit-tool#run-locally"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-700 hover:border-orange-500/60 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-orange-300 transition"
                >
                  Self-host guide
                </a>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono sm:ml-1">
                  v{appVersion}
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
