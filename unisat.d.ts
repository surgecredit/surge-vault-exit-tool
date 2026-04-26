interface Window {
  unisat?: {
    requestAccounts(): Promise<string[]>;
    getAccounts(): Promise<string[]>;
    getNetwork(): Promise<string>;
    switchNetwork(network: string): Promise<void>;
    getPublicKey(): Promise<string | null>;
    signPsbt(
      psbtHex: string,
      options?: {
        toSignInputs?: Array<{
          index: number;
          publicKey?: string;
          disableTweakSigner?: boolean;
          sighashTypes?: number[];
        }>;
        autoFinalized?: boolean;
      },
    ): Promise<string>;
  };
  BitcoinProvider?: {
    request(method: string, params?: unknown): Promise<unknown>;
  };
  XverseProviders?: {
    BitcoinProvider?: {
      request(method: string, params?: unknown): Promise<unknown>;
    };
  };
  xverseProviders?: {
    BitcoinProvider?: {
      request(method: string, params?: unknown): Promise<unknown>;
    };
  };
}

export {};
