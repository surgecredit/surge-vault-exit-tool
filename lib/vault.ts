import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ethers } from "ethers";
import { NETWORK } from "./bitcoin";
import { APP_CONFIG } from "./config";
import { createScriptTree, DEFAULT_EXIT_TIMELOCK_BLOCKS } from "./scripts";

bitcoin.initEccLib(ecc);

// NUMS point — disables key-path spending
const NUMS_XONLY = APP_CONFIG.key;

// Loan vault public key (from the MPC/server)
const LOAN_VAULT_PUBLIC_KEY = APP_CONFIG.pubkey;

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
  loanXOnly: Buffer;
  timelockBlocks: number;
  scriptTree: any;
  loanRepaymentScript: Buffer;
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
  const loanXOnly = Buffer.from(LOAN_VAULT_PUBLIC_KEY, "hex");
  const vaultId = getVaultId(evmAddress);

  const { scriptTree, loanRepaymentScript, liquidationScript, exitScript } =
    createScriptTree(userXOnly, loanXOnly, vaultId, timelockBlocks);

  const payment = bitcoin.payments.p2tr({
    internalPubkey: internalXOnly,
    scriptTree: scriptTree as any,
    network: NETWORK,
  });

  return {
    address: payment.address!,
    vaultId,
    internalXOnly,
    loanXOnly,
    timelockBlocks,
    scriptTree,
    loanRepaymentScript,
    liquidationScript,
    exitScript,
    payment,
  };
}
