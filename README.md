# Surge Taproot Vault Exit Tool

Recover BTC from your Surge Taproot Vault independently using the timelock exit path. Non-custodial, on-chain, verifiable.

This tool lets a borrower construct, sign, and broadcast a valid recovery transaction without relying on Surge backend services or the Surge DCN (Distributed Custody Network).

## What this tool does

- Loads your Taproot Vault address from your credit address and connected Bitcoin wallet
- Inspects vault UTXOs (current + spent) and per-output timelock status
- Detects which Taproot leaf was used on every spent UTXO (Credit Repayment, Liquidation, or Exit)
- Renders the full Taproot script tree with TapLeaf hashes, Merkle root, and decoded scripts (mempool-style)
- Builds an exit-path PSBT (script-path spend, user-only after timelock)
- Signs the PSBT with the connected wallet (UniSat) and broadcasts the raw transaction to the Bitcoin network

## How recovery works

The vault is a Taproot output (P2TR) with a NUMS internal key (key-path is provably unspendable) and three script leaves:

```
            Public Key (tweaked output key)
            /                              \
   Internal Key (NUMS)              Taproot (merkle root)
                                    /                   \
                          Credit Repayment           Branch
                          (depth 1)                  /      \
                                              Liquidation   Exit
                                              (depth 2)     (depth 2)
```

| Leaf              | Path                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| Credit Repayment  | 2-of-2 cooperative: borrower + Surge DCN                             |
| Liquidation       | DCN-only spend, used when credit terms are breached                  |
| Exit              | Borrower-only exit after the timelock (52,416 blocks)                |

The exit leaf is the path used by this tool. It enforces `<timelock> OP_CHECKSEQUENCEVERIFY OP_DROP <userPK> OP_CHECKSIG` and requires `nSequence >= timelockBlocks` on the spending input.

The internal key is the NUMS point `sha256("SURGE-NUMS")`. You can verify it locally:

```bash
echo -n "SURGE-NUMS" | shasum -a 256
# 6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2
```

## Recovery flow

1. Connect your Bitcoin wallet (UniSat) and enter your credit address.
2. The vault address is derived deterministically from your x-only public key and your credit address (`vaultId = keccak256(abi.encodePacked(creditAddress, 0))`).
3. The dashboard shows balance, current block height, eligible UTXOs, and the full Taproot tree on the right.
4. Each UTXO row shows confirmation status, blocks elapsed since confirmation, and unlock height.
5. Once the 52,416-block timelock has passed on a UTXO, "Construct Recovery Transaction" builds a script-path PSBT, hands it to UniSat to sign, finalizes, and broadcasts via Esplora.

## Vault Inspector

Click any node in the Taproot Tree visual to see its details:

- **Public Key** — vault address and tweaked output key (link to mempool)
- **Internal Key** — the NUMS point with derivation and verify commands
- **Taproot** — Merkle root of the script tree
- **Credit Repayment / Liquidation / Exit** — TapLeaf hash, decoded opcodes, and the spending path with linked DCN reference

Spent UTXOs are listed with the leaf used, e.g. "Spent via Exit", with a link to the spending transaction.

## Run locally

Requirements:

- Node.js 18+
- npm

Install and start:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Network

Network selection lives in `lib/config.ts`. Mainnet is the default.

```ts
export const APP_CONFIG = {
  mainnet: true, // set to false to target Signet
  signet: {
    btcApi: "https://signet.surge.dev/api",
    btcEsploraApi: "https://esplora.signet.surge.dev",
    explorer: "https://signet.surge.dev",
    unisatNetwork: "testnet",
    networkLabel: "Signet",
    key: "...", // NUMS internal key (x-only)
    pubkey: "...", // Surge DCN x-only pubkey
  },
  mainnetConfig: {
    btcApi: "https://mempool.space/api",
    btcEsploraApi: "https://blockstream.info/api",
    explorer: "https://mempool.space",
    unisatNetwork: "livenet",
    networkLabel: "Mainnet",
    key: "...",
    pubkey: "...",
  },
};
```

- To run against Signet, flip `mainnet: true` to `mainnet: false`
- Both blocks accept the same fields. Edit `btcApi`, `explorer`, `key`, `pubkey`, etc. independently

## Architecture

| File                       | Responsibility                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `lib/config.ts`            | Active network (mainnet/signet), Esplora endpoints, NUMS internal key, DCN x-only pubkey  |
| `lib/bitcoin.ts`           | Esplora API client (UTXOs, address txs, fees, broadcast), vsize estimator                 |
| `lib/scripts.ts`           | Tapscript builders for Credit Repayment, Liquidation, Exit, plus the script tree shape    |
| `lib/vault.ts`             | `generateVault(userXOnly, evmAddress)` produces the deterministic P2TR address + payment  |
| `lib/wallet.ts`            | Wallet derivation from mnemonic, private key, or UniSat-supplied public key               |
| `lib/exit-transaction.ts`  | Builds the exit-leaf PSBT (control block, leafVersion, sequence) and broadcasts           |
| `lib/vault-history.ts`     | Walks address history, identifies received vs spent outputs, detects spending leaf        |
| `lib/taproot-tree.ts`      | TapLeaf and TapBranch hashing, script decoding for the inspector                          |
| `app/page.tsx`             | Wallet hydration, session storage, wallet/dashboard switching                             |
| `components/ImportWallet.tsx` | Credit address input + UniSat connect                                                  |
| `components/VaultDashboard.tsx` | 2-column dashboard: actions on the left, Vault Inspector on the right                |
| `components/TaprootTreeVisual.tsx` | SVG Taproot tree with click-to-inspect details and decoded scripts                |

## Security notes

- Your Bitcoin stays on-chain and locked in your Taproot Vault. The tool never holds funds.
- Private keys remain in your wallet. Signing happens client-side via UniSat.
- All Esplora and explorer calls are read-only HTTPS to public endpoints (mempool.space / blockstream.info / signet.surge.dev).
- The exit transaction sweeps the eligible UTXOs to a single destination address that you provide. Verify it before signing.
- `localStorage` only persists your public key, credit address, and payment address (no secrets) so the dashboard hydrates after refresh.

## Disclaimer

This is a self-custodial exit tool. You are responsible for verifying every transaction detail (destination, amount, fee) before broadcasting. The authors accept no liability for lost funds.

## License

[MIT-style with Non-Commercial restriction](./LICENSE). Personal use, education, security review, and borrower self-recovery are explicitly permitted. Commercial use requires written permission from Surge.

## Links

- Surge: https://surge.build
- Surge DCN signer: https://signer.surge.credit
- Esplora docs: https://github.com/Blockstream/esplora/blob/master/API.md
- BIP 341 (Taproot): https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
- BIP 342 (Tapscript): https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki
