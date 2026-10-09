export const APP_CONFIG = {
  mainnet: true,
  signet: {
    btcApi: "https://signet.surge.dev/api",
    btcEsploraApi: "https://esplora.signet.surge.dev",
    explorer: "https://signet.surge.dev",
    unisatNetwork: "testnet",
    networkLabel: "Signet",
    key: "6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2",
    pubkey: "7d258c1ffea13a1231a57cf3c79811c0b51a152f6bb309db75734bbf6cd420b3",
    quorum: {
      loanXpub:
        "xpub661MyMwAqRbcEvtkH2zYZg2LnuGSewchqKr3eN34ezzUKY2Q3JSuLyCg1JgesFyskdHzNAskGKWWEiUPrhKScFopPWUii48UHYcbsFEsR7d",
      numsXpub:
        "xpub661MyMwAqRbcFwjt7b5KmoJcXACBzMXkWkZZYwrT8jK7DnzswJw2KVnGNN41z4ZHmdTcB2G5keNaYBmARmFuPVyb3nVAate53WJT8d5g2pg",
    },
    // VaultKeyRegistry on Base Sepolia.
    registry: { address: "0x4BBE35Ec909Dc63bAd17A5F2F5F03F6A62b8Ba8e", rpcUrl: "https://sepolia.base.org" },
  },
  mainnetConfig: {
    btcApi: "https://mempool.space/api",
    btcEsploraApi: "https://blockstream.info/api",
    explorer: "https://mempool.space",
    unisatNetwork: "livenet",
    networkLabel: "Mainnet",
    key: "6a1bac977b8af761b330d1473dba1e5cfc75b3256a1ae900b78a369e175423f2",
    pubkey: "62310f9e1cb73b23155b48096f9089d820f77cd72fcfc6eb23772b4592205f54",
    quorum: {
      loanXpub:
        "xpub661MyMwAqRbcFDCg1qE59wyVAwfgjFL8ohHtfWATCJf6WxZpFwznPDa7jPcRCQHVpN2faeZ2T3FnS86G2GMFz2yoFBgR5M9QMkZWqT3Pbni",
      numsXpub:
        "xpub661MyMwAqRbcFXweUipq2d2ZpDLUsP58RhqWXZ2pGjeAscYJiZLpwpbjqQnf3KJYahwmJNNKvidcUVcXygu7LsCAfLf1CzBCsaEFpnWsGbG",
    },
    // VaultKeyRegistry on Base. Empty until it is deployed.
    registry: { address: "", rpcUrl: "https://mainnet.base.org" },
  },
} as const;

export const ACTIVE_NETWORK_CONFIG = APP_CONFIG.mainnet
  ? APP_CONFIG.mainnetConfig
  : APP_CONFIG.signet;
