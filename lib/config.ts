export const APP_CONFIG = {
  mainnet: false,
  signet: {
    btcApi: "https://signet.surge.dev/api",
    btcEsploraApi: "https://esplora.signet.surge.dev",
    explorer: "https://signet.surge.dev",
    unisatNetwork: "testnet",
    networkLabel: "Signet",
    key: "6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2",
    pubkey: "7d258c1ffea13a1231a57cf3c79811c0b51a152f6bb309db75734bbf6cd420b3",
  },
  mainnetConfig: {
    btcApi: "https://mempool.space/api",
    btcEsploraApi: "https://blockstream.info/api",
    explorer: "https://mempool.space",
    unisatNetwork: "livenet",
    networkLabel: "Mainnet",
    key: "6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2",
    pubkey: "62310f9e1cb73b23155b48096f9089d820f77cd72fcfc6eb23772b4592205f54",
  },
} as const;

export const ACTIVE_NETWORK_CONFIG = APP_CONFIG.mainnet
  ? APP_CONFIG.mainnetConfig
  : APP_CONFIG.signet;
