# Surge Taproot Vault Sovereign Recovery Tool

Recover BTC from your Surge Taproot Vault independently using the timelock exit path. Non-custodial, on-chain, verifiable.

This tool lets a borrower construct and broadcast a valid recovery transaction without relying on Surge backend services or signer infrastructure.

## What this tool does

- Inspects Taproot Vault UTXOs and balances
- Shows timelock status and recovery eligibility
- Builds a Taproot script-path recovery transaction when eligible
- Supports wallet signing (UniSat) and broadcast to Bitcoin network infrastructure

## Recovery flow

1. Connect wallet and load your Taproot Vault
2. Check UTXO maturity and timelock status
3. Enter destination address
4. Construct, sign, and broadcast recovery transaction

Recovery is only possible after the Taproot Vault timelock expires (52,416 blocks).

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
    key: "...",
    pubkey: "...",
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

- To run against Signet, flip `mainnet: true` → `mainnet: false`
- Both blocks accept the same fields — edit `btcApi`, `explorer`, `key`, `pubkey`, etc. independently

## Security notes

- Your Bitcoin stays on-chain and locked in your Taproot Vault — the tool never holds funds
- Private keys stay in the user wallet; signing happens client-side
- You are responsible for verifying destination address and transaction details before broadcast

## Disclaimer

This is a self-custodial recovery tool. You are responsible for verifying all transaction details before broadcasting.

## License

MIT
