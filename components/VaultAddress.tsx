"use client";

import { useState } from "react";
import { VaultInfo } from "@/lib/vault";
import { WalletInfo } from "@/lib/wallet";

type Props = {
  wallet: WalletInfo;
  vault: VaultInfo;
  hasBalance?: boolean;
};

export default function VaultAddress({ wallet, vault, hasBalance }: Props) {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(vault.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold text-white mb-4">
        Step 2: Vault Address
      </h2>

      {/* Wallet info */}
      <div className="mb-4 space-y-2">
        <div>
          <span className="text-gray-500 text-xs uppercase tracking-wide">
            Your Bitcoin Public Key (x-only)
          </span>
          <p className="text-gray-300 font-mono text-xs break-all">
            {wallet.xOnlyPublicKey.toString("hex")}
          </p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase tracking-wide">
            Your EVM Address
          </span>
          <p className="text-gray-300 font-mono text-xs break-all">
            {wallet.evmAddress}
          </p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase tracking-wide">
            Vault ID
          </span>
          <p className="text-gray-300 font-mono text-xs break-all">
            {vault.vaultId.toString("hex")}
          </p>
        </div>
      </div>

      {/* Vault address */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
        <span className="text-gray-500 text-xs uppercase tracking-wide">
          Taproot Vault Address (Signet)
        </span>
        <p className="text-orange-400 font-mono text-sm break-all mt-1">
          {vault.address}
        </p>
        <button
          onClick={copyAddress}
          className="mt-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition"
        >
          {copied ? "Copied!" : "Copy Address"}
        </button>
      </div>

      {/* Instructions - only show when vault is empty */}
      {!hasBalance && (
        <div className="mt-4 bg-orange-950 border border-orange-800 rounded-lg p-3">
          <p className="text-orange-300 text-sm">
            Send some Signet BTC to the vault address above. Once confirmed, you
            can proceed to check the vault status and execute the exit after{" "}
            {vault.timelockBlocks.toLocaleString()} blocks.
          </p>
        </div>
      )}
    </div>
  );
}
