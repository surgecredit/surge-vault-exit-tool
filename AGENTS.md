# AGENTS.md

Conventions and guardrails for AI coding agents (Claude Code, Cursor, Devin, Copilot Workspace, etc.) working on this repo.

## What this repo is

A self-custodial recovery tool for Surge Taproot Vaults. Pure client-side Next.js 14 app (App Router). No backend. All Bitcoin operations happen in the browser; signing happens in the user's wallet (UniSat).

The vault is a P2TR with a NUMS internal key and three Tapscript leaves. The tool spends the user-only "Exit" leaf after a 52,416-block timelock.

## Stack

- Next.js 14 (App Router, RSC + client components)
- React 18
- Tailwind CSS
- TypeScript
- bitcoinjs-lib + @bitcoinerlab/secp256k1 for Taproot, PSBT, control blocks
- @scure/bip32, @scure/bip39 for HD derivation
- ethers (used only for `keccak256` of the vault id, no chain interaction)

## Commands

```bash
npm install          # install deps
npm run dev          # start dev server at localhost:3000
npm run build        # production build (must pass before merge)
npm run start        # serve production build
npx tsc --noEmit     # type check (must be clean)
```

## Code conventions

- TypeScript strict-ish; type-check must pass.
- Avoid em dashes in any user-facing copy and code comments.
- Default to no comments. Add one only when the **why** is non-obvious.
- Prefer editing existing files over creating new ones.
- Match the existing Tailwind pattern: dark theme on `bg-gray-950`, cards on `bg-gray-900`, subordinate cards on `bg-gray-800`. Accent color is `orange-400` / `orange-500` / `orange-600`.
- Mempool-style cyan (`text-sky-400`) for block heights. Green (`text-green-400`) for positive balance values.
- Button copy uses sentence case ("Construct Recovery Transaction", "Connect Bitcoin Wallet").

## Domain rules (do not break)

- The internal key MUST stay the NUMS point (`sha256("SURGE-NUMS")`). Never substitute a real pubkey.
- Vault id derivation MUST stay `keccak256(abi.encodePacked(creditAddress, uint256 nonce))` with `nonce = 0`. Changing this changes every vault address.
- The script tree shape is fixed: `[creditRepayment, [liquidation, exit]]`. Repayment at depth 1, liquidation and exit at depth 2.
- Exit script MUST encode timelock via `script.number.encode(timelockBlocks)` so the on-chain bytes (e.g. `c0cc00` for 52416) match what users will see in mempool.
- PSBT MUST set `version=2` and per-input `sequence = timelockBlocks` so CSV passes.
- Don't introduce a backend, telemetry, or analytics. The tool is offline-capable except for Esplora and the wallet extension.
- Don't store anything secret in `localStorage`. The session record holds only `publicKeyHex`, `paymentAddress`, `evmAddress`.

## Terminology

- "Borrower / user" — the holder of the vault. UI links the word "user" to the connected Bitcoin address on the explorer.
- "Credit Address" — the EVM address used when opening the Surge Credit Line. This is what derives the vault id.
- "DCN" — Distributed Custody Network. Replace any "credit vault" or "loan vault" wording with "DCN".
- "Credit Repayment" leaf — never call it "Loan Repayment".

## Network configuration

`lib/config.ts` selects mainnet vs signet via `mainnet: true|false`. Both blocks expose the same shape (`btcApi`, `btcEsploraApi`, `explorer`, `unisatNetwork`, `networkLabel`, `key`, `pubkey`). Don't introduce a third network without updating `ACTIVE_NETWORK_CONFIG` and the UniSat network switch in `ImportWallet`.

## Testing changes that touch consensus-relevant code

There are no automated tests. For any change in `lib/scripts.ts`, `lib/vault.ts`, `lib/exit-transaction.ts`, or `lib/taproot-tree.ts`:

1. Run `npx tsc --noEmit` and `npm run build`.
2. Verify the resulting vault address against a known reference (a previously-working borrower address) before merging.
3. If you change script bytes, every existing vault address changes and existing borrower funds become unreachable through this tool. Treat this as a breaking change.

## Files an agent typically should not change

- `LICENSE` (legal)
- `lib/config.ts` (production keys and endpoints)
- `package.json` version bumps without an explicit ask

## Files an agent typically should change

- `components/*` for UI copy and layout adjustments
- `app/page.tsx` for header/footer/hydration tweaks
- `README.md`, `llms.txt`, `AGENTS.md` for documentation

## Out of scope for this tool

- Building credit-repayment or liquidation transactions (the borrower never spends those leaves alone)
- Multi-vault management
- Hardware wallet integrations beyond UniSat
- Any custody, key generation, or seed handling
