import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import { NETWORK } from "./bitcoin";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export type WalletInfo = {
  privateKey?: Buffer;
  publicKey: Buffer;
  xOnlyPublicKey: Buffer;
  taprootAddress: string;
  paymentAddress?: string;
  signingAddress?: string;
  walletProvider?: "unisat" | "xverse" | "phantom";
  evmAddress: string;
};

type WalletFromPublicKeyOptions = {
  signingAddress?: string;
  walletProvider?: "unisat" | "xverse" | "phantom";
};

/**
 * Derive a wallet from a raw private key (hex string).
 * Note: EVM address derivation requires a mnemonic, so we generate a placeholder.
 */
export function walletFromPrivateKey(
  privateKeyHex: string,
  evmAddress?: string,
): WalletInfo {
  const cleaned = privateKeyHex.replace(/^0x/, "").trim();
  const privateKey = Buffer.from(cleaned, "hex");

  if (privateKey.length !== 32) {
    throw new Error("Private key must be 32 bytes (64 hex characters)");
  }

  const keyPair = ECPair.fromPrivateKey(privateKey, {
    compressed: true,
    network: NETWORK,
  });

  const publicKey = Buffer.from(keyPair.publicKey);
  const xOnlyPublicKey = publicKey.subarray(1, 33);

  const p2tr = bitcoin.payments.p2tr({
    pubkey: xOnlyPublicKey,
    network: NETWORK,
  });

  return {
    privateKey,
    publicKey,
    xOnlyPublicKey,
    taprootAddress: p2tr.address!,
    evmAddress: evmAddress || "0x0000000000000000000000000000000000000000",
  };
}

export function walletFromPublicKey(
  publicKeyHex: string,
  evmAddress: string,
  paymentAddress?: string,
  options?: WalletFromPublicKeyOptions,
): WalletInfo {
  const cleaned = publicKeyHex.replace(/^0x/, "").trim();
  const publicKey = Buffer.from(cleaned, "hex");

  if (publicKey.length !== 32 && publicKey.length !== 33) {
    throw new Error("Wallet returned an invalid public key");
  }

  const xOnlyPublicKey =
    publicKey.length === 32 ? publicKey : publicKey.subarray(1, 33);

  const p2tr = bitcoin.payments.p2tr({
    pubkey: xOnlyPublicKey,
    network: NETWORK,
  });

  return {
    publicKey,
    xOnlyPublicKey,
    taprootAddress: p2tr.address!,
    paymentAddress,
    signingAddress: options?.signingAddress,
    walletProvider: options?.walletProvider,
    evmAddress,
  };
}
