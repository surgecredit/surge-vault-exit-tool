# Surge Vault Sovereign Recovery Tool

Recover BTC from a Surge vault independently using the Taproot timelock exit path.

This tool lets a borrower construct and broadcast a valid recovery transaction without relying on Surge backend services or signer infrastructure.

## What this tool does

- Inspects vault UTXOs and balances
- Shows timelock status and recovery eligibility
- Builds a Taproot script-path recovery transaction when eligible
- Supports wallet signing (UniSat) and broadcast to Bitcoin testnet infrastructure

## Recovery flow

1. Connect wallet and load your vault
2. Check UTXO maturity and timelock status
3. Enter destination address
4. Construct, sign, and broadcast recovery transaction

Recovery is only possible after the vault timelock expires (52,416 blocks).

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

- Current target: Bitcoin testnet/signet environment used by this repo config

## Security notes

- Private keys stay in the user wallet
- Signing happens client-side
- You are responsible for verifying destination address and transaction details before broadcast

## Disclaimer

This is a self-custodial recovery tool. Always test your recovery process on testnet before using mainnet funds.

## License

MIT
