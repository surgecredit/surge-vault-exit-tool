import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ethers } from "ethers";
import { NETWORK } from "./bitcoin";
import { createScriptTree, DEFAULT_EXIT_TIMELOCK_BLOCKS } from "./scripts";

bitcoin.initEccLib(ecc);

// NUMS point — disables key-path spending
const NUMS_XONLY =
  process.env.NEXT_PUBLIC_TAPROOT_NUMS_XONLY ||
  "6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2";

// Loan vault public key (from the MPC/server)
const LOAN_VAULT_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_LOAN_VAULT_PUBLIC_KEY ||
  "4ea2cf04e6e1823c01e7658f14d822838c1f127451d5ab192460d4fe9fc89fa9";

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
