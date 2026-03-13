export const APP_CONFIG = {
  mainnet: false,
  signet: {
    btcApi: "https://signet.surge.dev/api",
    btcEsploraApi: "https://esplora.signet.surge.dev",
    explorer: "https://signet.surge.dev",
    unisatNetwork: "testnet",
    networkLabel: "Signet",
  },
  mainnetConfig: {
    btcApi: "https://mempool.space/api",
    btcEsploraApi: "https://blockstream.info/api",
    explorer: "https://mempool.space",
    unisatNetwork: "livenet",
    networkLabel: "Mainnet",
  },
  key: "6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2",
  pubkey: "4ea2cf04e6e1823c01e7658f14d822838c1f127451d5ab192460d4fe9fc89fa9",
} as const;

export const ACTIVE_NETWORK_CONFIG = APP_CONFIG.mainnet
  ? APP_CONFIG.mainnetConfig
  : APP_CONFIG.signet;
