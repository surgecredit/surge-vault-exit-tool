import { script } from "bitcoinjs-lib";

// Default timelock matching production (52416 blocks ~ 1 year)
export const DEFAULT_EXIT_TIMELOCK_BLOCKS = 1;

/**
 * Loan Repayment Script (2-of-2 multisig with vaultId tag)
 *
 * Script: <vaultId> OP_DROP <userPK> OP_CHECKSIG <loanPK> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
 *
 * Requires both user and loan vault signatures.
 */
export function createLoanRepaymentScript(
  userXOnly: Buffer,
  loanXOnly: Buffer,
  vaultId: Buffer,
): Buffer {
  if (userXOnly.length !== 32 || loanXOnly.length !== 32) {
    throw new Error("Public keys must be 32-byte x-only for Tapscript");
  }
  if (vaultId.length !== 32) {
    throw new Error("VaultId must be 32 bytes");
  }

  return script.compile([
    vaultId,
    script.OPS.OP_DROP,
    userXOnly,
    script.OPS.OP_CHECKSIG,
    loanXOnly,
    script.OPS.OP_CHECKSIGADD,
    script.OPS.OP_2,
    script.OPS.OP_NUMEQUAL,
  ]);
}

/**
 * Liquidation Script (single-sig, loan vault only)
 *
 * Script: <loanPK> OP_CHECKSIG
 *
 * Only the loan vault can spend (for liquidation).
 */
export function createLiquidationScript(loanXOnly: Buffer): Buffer {
  if (loanXOnly.length !== 32) {
    throw new Error("Public key must be 32-byte x-only for Tapscript");
  }

  return script.compile([loanXOnly, script.OPS.OP_CHECKSIG]);
}

/**
 * Exit Script (timelock + user single-sig)
 *
 * Script: <timelockBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP <userPK> OP_CHECKSIG
 *
 * User can spend alone after timelockBlocks have passed since the UTXO was confirmed.
 */
export function createExitScript(
  userXOnly: Buffer,
  timelockBlocks: number = DEFAULT_EXIT_TIMELOCK_BLOCKS,
): Buffer {
  if (userXOnly.length !== 32) {
    throw new Error("Public key must be 32-byte x-only for Tapscript");
  }
  if (timelockBlocks < 1 || timelockBlocks > 65535) {
    throw new Error("Timelock must be between 1 and 65535 blocks");
  }

  return script.compile([
    script.number.encode(timelockBlocks),
    script.OPS.OP_CHECKSEQUENCEVERIFY,
    script.OPS.OP_DROP,
    userXOnly,
    script.OPS.OP_CHECKSIG,
  ]);
}

/**
 * Build the full Taproot script tree.
 *
 * Tree structure:
 *        root
 *       /    \
 *  repayment  [branch]
 *             /      \
 *      liquidation   exit
 *
 * Repayment is at depth 1 (cheapest to spend).
 * Liquidation and exit are at depth 2.
 */
export function createScriptTree(
  userXOnly: Buffer,
  loanXOnly: Buffer,
  vaultId: Buffer,
  timelockBlocks: number = DEFAULT_EXIT_TIMELOCK_BLOCKS,
) {
  const loanRepaymentScript = createLoanRepaymentScript(
    userXOnly,
    loanXOnly,
    vaultId,
  );
  const liquidationScript = createLiquidationScript(loanXOnly);
  const exitScript = createExitScript(userXOnly, timelockBlocks);

  const scriptTree = [
    { output: loanRepaymentScript },
    [{ output: liquidationScript }, { output: exitScript }],
  ];

  return {
    scriptTree,
    loanRepaymentScript,
    liquidationScript,
    exitScript,
  };
}
