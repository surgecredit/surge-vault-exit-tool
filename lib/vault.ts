import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ethers } from "ethers";
import { NETWORK } from "./bitcoin";
import { ACTIVE_NETWORK_CONFIG } from "./config";
import { createScriptTree, DEFAULT_EXIT_TIMELOCK_BLOCKS } from "./scripts";

bitcoin.initEccLib(ecc);

// NUMS point — disables key-path spending
const NUMS_XONLY = ACTIVE_NETWORK_CONFIG.key;

// Credit vault public key (from the MPC/server)
const CREDIT_VAULT_PUBLIC_KEY = ACTIVE_NETWORK_CONFIG.pubkey;

/**
 * Generate a vault ID from an EVM address and nonce.
 * vaultId = keccak256(abi.encodePacked(address, uint256))
 */
export function getVaultId(evmAddress: string, nonce: number = 0): Buffer {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "uint256"],
    [evmAddress, nonce],
  );
  return Buffer.from(hash.replace(/^0x/, ""), "hex");
}

export type VaultInfo = {
  address: string;
  vaultId: Buffer;
  internalXOnly: Buffer;
  creditXOnly: Buffer;
  timelockBlocks: number;
  scriptTree: any;
  creditRepaymentScript: Buffer;
  liquidationScript: Buffer;
  exitScript: Buffer;
  payment: bitcoin.Payment;
};

/**
 * Generate the complete vault (Taproot address + all scripts).
 */
export function generateVault(
  userXOnly: Buffer,
  evmAddress: string,
  timelockBlocks: number = DEFAULT_EXIT_TIMELOCK_BLOCKS,
): VaultInfo {
  const internalXOnly = Buffer.from(NUMS_XONLY, "hex");
  const creditXOnly = Buffer.from(CREDIT_VAULT_PUBLIC_KEY, "hex");
  const vaultId = getVaultId(evmAddress);

  const { scriptTree, creditRepaymentScript, liquidationScript, exitScript } =
    createScriptTree(userXOnly, creditXOnly, vaultId, timelockBlocks);

  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalXOnly,
    scriptTree: scriptTree as any,
    network: NETWORK,
  });

  return {
    address: payment.address!,
    vaultId,
    internalXOnly,
    creditXOnly,
    timelockBlocks,
    scriptTree,
    creditRepaymentScript,
    liquidationScript,
    exitScript,
    payment,
  };
}
