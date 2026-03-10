import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { ethers } from "ethers";
import { NETWORK } from "./bitcoin";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// BIP86 derivation path for Taproot on testnet/signet
const BITCOIN_PATH = "m/86'/1'/0'/0/0";

export type WalletInfo = {
  privateKey: Buffer;
  publicKey: Buffer;
  xOnlyPublicKey: Buffer;
  taprootAddress: string;
  evmAddress: string;
};

/**
 * Derive a wallet from a BIP39 mnemonic phrase.
 * Returns Bitcoin Taproot keypair + EVM address.
 */
export function walletFromMnemonic(mnemonic: string): WalletInfo {
  const trimmed = mnemonic.trim().toLowerCase();

  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const seed = mnemonicToSeedSync(trimmed);
  const hdKey = HDKey.fromMasterSeed(seed);
  const derived = hdKey.derive(BITCOIN_PATH);

  if (!derived.privateKey) {
    throw new Error("Failed to derive private key");
  }

  const privateKey = Buffer.from(derived.privateKey);
  const keyPair = ECPair.fromPrivateKey(privateKey, {
    compressed: true,
    network: NETWORK,
  });

  const publicKey = Buffer.from(keyPair.publicKey);
  const xOnlyPublicKey = publicKey.subarray(1, 33); // strip prefix byte

  const p2tr = bitcoin.payments.p2tr({
    pubkey: xOnlyPublicKey,
    network: NETWORK,
  });

  // Derive EVM address from the same mnemonic
  const ethWallet = ethers.Wallet.fromPhrase(trimmed);

  return {
    privateKey,
    publicKey,
    xOnlyPublicKey,
    taprootAddress: p2tr.address!,
    evmAddress: ethWallet.address,
  };
}

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
