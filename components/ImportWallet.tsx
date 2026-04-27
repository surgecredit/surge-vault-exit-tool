"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Wallet, {
  AddressPurpose,
  BitcoinNetworkType,
  RpcErrorCode,
  isProviderInstalled,
} from "sats-connect";
import { WalletInfo, walletFromPublicKey } from "@/lib/wallet";
import { ACTIVE_NETWORK_CONFIG, APP_CONFIG } from "@/lib/config";

const XVERSE_PROVIDER_ID = "XverseProviders.BitcoinProvider";

function networkTypeForActive(): BitcoinNetworkType {
  switch (ACTIVE_NETWORK_CONFIG.networkLabel) {
    case "Mainnet":
      return BitcoinNetworkType.Mainnet;
    case "Signet":
      return BitcoinNetworkType.Signet;
    default:
      return BitcoinNetworkType.Mainnet;
  }
}

function hasXverseProvider() {
  if (typeof window === "undefined") return false;
  if (isProviderInstalled(XVERSE_PROVIDER_ID)) return true;
  const w = window as any;
  return Boolean(
    w.XverseProviders?.BitcoinProvider ||
      w.xverseProviders?.BitcoinProvider ||
      w.BitcoinProvider,
  );
}

type Props = {
  onWalletImported: (wallet: WalletInfo) => void;
};

const FORM_STORAGE_KEY = "surge-vault-connect-form";
const PROVIDER_LABELS: Record<WalletProvider, string> = {
  unisat: "UniSat",
  xverse: "Xverse",
  phantom: "Phantom",
};
const PROVIDER_INSTALL_URLS: Record<WalletProvider, string> = {
  unisat: "https://unisat.io/download",
  xverse: "https://www.xverse.app",
  phantom: "https://phantom.com",
};
const PROVIDER_ICONS: Record<WalletProvider, string> = {
  unisat: "/assets/unisat.webp",
  xverse: "/assets/xverse.webp",
  phantom: "/assets/phantom.webp",
};
const PHANTOM_BITCOIN_SUPPORTED = ACTIVE_NETWORK_CONFIG.networkLabel === "Mainnet";

function WalletIcon({ provider }: { provider: WalletProvider }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-black/40 p-1">
      <Image
        src={PROVIDER_ICONS[provider]}
        alt={`${PROVIDER_LABELS[provider]} logo`}
        width={32}
        height={32}
        className="h-7 w-7 object-contain"
      />
      </div>
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const message =
      "message" in err && typeof err.message === "string"
        ? err.message
        : "error" in err && typeof err.error === "string"
          ? err.error
          : "code" in err && typeof err.code === "string"
            ? err.code
            : null;

    if (message) return message;
  }

  return fallback;
}

function hasPhantomProvider() {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).phantom?.bitcoin?.isPhantom);
}

async function connectUniSat(evmAddress: string) {
  const unisat = (window as any).unisat;

  if (typeof window === "undefined" || !unisat) {
    window.open(PROVIDER_INSTALL_URLS.unisat, "_blank");
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

  return walletFromPublicKey(publicKeyHex, evmAddress, accounts[0], {
    signingAddress: accounts[0],
    walletProvider: "unisat",
  });
}

async function connectXverse(evmAddress: string) {
  if (!hasXverseProvider()) {
    window.open(PROVIDER_INSTALL_URLS.xverse, "_blank");
    throw new Error(
      "Xverse wallet not detected. Please install the extension.",
    );
  }

  const response = await Wallet.request("wallet_connect", {
    addresses: [AddressPurpose.Ordinals, AddressPurpose.Payment],
    network: networkTypeForActive(),
    message: "Connect to the Surge Unilateral Exit Tool",
  });

  if (response.status === "error") {
    if (response.error?.code === RpcErrorCode.USER_REJECTION) {
      throw new Error("Connection rejected in Xverse");
    }
    throw new Error(response.error?.message || "Xverse connection failed");
  }

  const addresses = response.result.addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("No Xverse account available");
  }

  const ordinalsAccount = addresses.find(
    (a) => a.purpose === AddressPurpose.Ordinals,
  );
  const paymentAccount = addresses.find(
    (a) => a.purpose === AddressPurpose.Payment,
  );

  if (!ordinalsAccount?.publicKey) {
    throw new Error("Failed to get ordinals public key from Xverse");
  }

  return walletFromPublicKey(
    ordinalsAccount.publicKey,
    evmAddress,
    paymentAccount?.address,
    {
      signingAddress: ordinalsAccount.address,
      walletProvider: "xverse",
    },
  );
}

async function connectPhantom(evmAddress: string) {
  const phantomBitcoin = (window as any).phantom?.bitcoin;

  if (typeof window === "undefined" || !phantomBitcoin?.isPhantom) {
    window.open(PROVIDER_INSTALL_URLS.phantom, "_blank");
    throw new Error(
      "Phantom wallet not detected. Please install the extension.",
    );
  }

  if (ACTIVE_NETWORK_CONFIG.networkLabel === "Signet") {
    throw new Error(
      "Phantom Bitcoin does not currently support Signet in this app. Use UniSat or Xverse on Signet, or switch the app to Mainnet for Phantom.",
    );
  }

  const addresses = await phantomBitcoin.requestAccounts();
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("No Phantom account available");
  }

  const ordinalsAccount = addresses.find(
    (a: any) => a.purpose === "ordinals",
  );
  const paymentAccount = addresses.find((a: any) => a.purpose === "payment");
  const selectedAccount = ordinalsAccount || paymentAccount;

  if (!selectedAccount?.publicKey) {
    throw new Error("Failed to get Bitcoin public key from Phantom");
  }

  return walletFromPublicKey(
    selectedAccount.publicKey,
    evmAddress,
    paymentAccount?.address || selectedAccount.address,
    {
      signingAddress: selectedAccount.address,
      walletProvider: "phantom",
    },
  );
}

type WalletProvider = "unisat" | "xverse" | "phantom";

async function connectWallet(
  evmAddress: string,
  preferredProvider?: WalletProvider,
) {
  if (preferredProvider === "unisat") {
    return connectUniSat(evmAddress);
  }

  if (preferredProvider === "xverse") {
    return connectXverse(evmAddress);
  }

  if (preferredProvider === "phantom") {
    return connectPhantom(evmAddress);
  }

  if ((window as any).unisat) {
    return connectUniSat(evmAddress);
  }

  if (hasXverseProvider()) {
    return connectXverse(evmAddress);
  }

  if (hasPhantomProvider()) {
    return connectPhantom(evmAddress);
  }

  window.open(PROVIDER_INSTALL_URLS.unisat, "_blank");
  throw new Error(
    "No supported wallet detected. Install UniSat, Xverse, or Phantom extension.",
  );
}

export default function ImportWallet({ onWalletImported }: Props) {
  const [evmInput, setEvmInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<
    Record<WalletProvider, boolean>
  >({
    unisat: false,
    xverse: false,
    phantom: false,
  });
  const [selectedProvider, setSelectedProvider] =
    useState<WalletProvider | null>(null);

  useEffect(() => {
    const detect = () => {
      const nextProviders = {
        unisat: Boolean((window as any).unisat),
        xverse: hasXverseProvider(),
        phantom: PHANTOM_BITCOIN_SUPPORTED && hasPhantomProvider(),
      };

      setAvailableProviders((current) => {
        if (
          current.unisat === nextProviders.unisat &&
          current.xverse === nextProviders.xverse &&
          current.phantom === nextProviders.phantom
        ) {
          return current;
        }

        return nextProviders;
      });

      setSelectedProvider((current) => {
        if (!current) return null;
        return nextProviders[current] ? current : null;
      });
    };
    detect();
    const interval = window.setInterval(detect, 1000);
    return () => window.clearInterval(interval);
  }, []);

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
      const parsed = JSON.parse(saved) as {
        evmInput?: string;
        walletProvider?: WalletProvider;
      };
      setEvmInput(parsed.evmInput || "");
      if (
        parsed.walletProvider === "unisat" ||
        parsed.walletProvider === "xverse" ||
        (parsed.walletProvider === "phantom" && PHANTOM_BITCOIN_SUPPORTED)
      ) {
        setSelectedProvider(parsed.walletProvider);
      }
    } catch {
      window.localStorage.removeItem(FORM_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({ evmInput, walletProvider: selectedProvider }),
    );
  }, [evmInput, selectedProvider]);

  const handleConnect = async (provider: WalletProvider) => {
    setError("");
    setLoading(true);

    try {
      const trimmed = evmInput.trim();
      if (!trimmed) {
        throw new Error("Please enter your credit address");
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        throw new Error(
          "Invalid credit address. Enter a valid EVM address (0x followed by 40 hex characters).",
        );
      }

      const wallet = await connectWallet(trimmed, provider);
      onWalletImported(wallet);
    } catch (err: any) {
      setError(getErrorMessage(err, "Failed to connect Bitcoin wallet"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWalletModal = () => {
    setError("");

    const trimmed = evmInput.trim();
    if (!trimmed) {
      setError("Please enter your credit address");
      return;
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setError(
        "Invalid credit address. Enter a valid EVM address (0x followed by 40 hex characters).",
      );
      return;
    }

    if (visibleProviders.length === 1) {
      const [provider] = visibleProviders;
      setSelectedProvider(provider);
      void handleConnect(provider);
      return;
    }

    if (visibleProviders.length === 0) {
      setSelectedProvider("unisat");
      void handleConnect("unisat");
      return;
    }

    setWalletModalOpen(true);
  };

  const buttonLabel = loading ? "Connecting..." : "Connect Bitcoin Wallet";
  const visibleProviders = (["unisat", "xverse", "phantom"] as WalletProvider[]).filter(
    (provider) => {
      if (provider === "phantom") {
        return PHANTOM_BITCOIN_SUPPORTED && availableProviders[provider];
      }

      return availableProviders[provider];
    },
  );

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

      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 sm:p-6 space-y-4">
        <div>
          <label className="text-gray-400 text-sm mb-1 block">
            Credit Address
          </label>
          <input
            type="text"
            value={evmInput}
            onChange={(e) => setEvmInput(e.target.value)}
            placeholder="0x..."
            className="w-full bg-gray-800 text-white rounded-lg p-3 text-xs sm:text-sm border border-gray-600 focus:border-orange-500 focus:outline-none font-mono"
          />
          <p className="text-gray-500 text-xs mt-1">
            The address you used when opening your Surge Credit Line.
          </p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleOpenWalletModal}
          disabled={loading}
          className="!mt-6 w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
        >
          {buttonLabel}
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

      {walletModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/80 p-3 sm:flex sm:items-center sm:justify-center sm:p-4 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-2xl sm:p-5 max-h-[calc(100vh-1.5rem)] overflow-y-auto sm:max-h-[85vh]">
            <div className="relative">
              <button
                type="button"
                onClick={() => setWalletModalOpen(false)}
                aria-label="Close wallet chooser"
                className="absolute right-0 top-0 rounded-lg border border-gray-700 p-2 text-gray-300 transition hover:border-gray-600 hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path strokeLinecap="round" d="M5 5l10 10M15 5 5 15" />
                </svg>
              </button>

              <div className="pr-12">
              <div>
                <h3 className="text-lg font-semibold text-white">Choose Bitcoin Wallet</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Pick the wallet you want to use for connection and signing.
                </p>
              </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {visibleProviders.map((provider) => {

                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={async () => {
                      if (loading) return;
                      setSelectedProvider(provider);
                      setWalletModalOpen(false);
                      await handleConnect(provider);
                    }}
                    className={[
                      "w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-left transition hover:border-gray-600",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2.5">
                      <WalletIcon provider={provider} />
                      <span className="text-sm font-medium text-white sm:text-base">
                        {PROVIDER_LABELS[provider]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {visibleProviders.length === 0 && (
              <div className="mt-5 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
                No supported Bitcoin wallet is currently detected. Install UniSat or Xverse to continue.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
