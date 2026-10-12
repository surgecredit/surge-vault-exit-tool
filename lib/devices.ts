import * as bitcoin from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { PairedBitBox } from "@bitboxswiss/bitbox-api";
import { IS_MAINNET, NETWORK } from "./bitcoin";
import { QUORUM_EXIT_CSV_BLOCKS, QuorumKey, QuorumVault, parseXpub, xpubMaterial } from "./quorum";
import { exitLeafHash } from "./quorum-exit";

/**
 * Signing the exit leaf on a Ledger or BitBox02 over USB.
 *
 * Both devices sign a taproot script path only against a wallet policy they
 * have registered, and the policy has to regenerate the whole tree (all three
 * leaves and the internal key) to land on the vault's address. So the policy
 * here must describe the same vault as `generateQuorumVault`, key for key.
 */

export const DEFAULT_ACCOUNT_PATH = IS_MAINNET ? "86'/0'/0'" : "86'/1'/0'";
const POLICY_NAME = "Surge vault";

const XPUB_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e };
const TPUB_VERSIONS = { private: 0x04358394, public: 0x043587cf };

export function policyDescriptor(userCount: number, threshold: number, timelockBlocks = QUORUM_EXIT_CSV_BLOCKS): string {
  if (userCount === 1) {
    return (
      `tr(@0/**,{multi_a(2,@1/**,@2/**),` +
      `{pk(@2/<2;3>/*),and_v(v:pk(@1/<2;3>/*),older(${timelockBlocks}))}})`
    );
  }
  const loan = `@${userCount + 1}`;
  const users = (second: boolean) =>
    Array.from({ length: userCount }, (_, i) => (second ? `@${i + 1}/<2;3>/*` : `@${i + 1}/**`)).join(",");
  return (
    `tr(@0/**,{and_v(v:multi_a(${threshold},${users(false)}),pk(${loan}/**)),` +
    `{pk(${loan}/<2;3>/*),` +
    `and_v(v:multi_a(${threshold},${users(true)}),older(${timelockBlocks}))}})`
  );
}

/**
 * The same node in this network's version bytes.
 *
 * A device rejects a key list that mixes xpub and tpub. Depth, index and
 * parent fingerprint are kept: dropping them would turn an account key into a
 * master key the device cannot match against its own.
 */
function forNetwork(xpub: string): string {
  const node = parseXpub(xpub);
  return new HDKey({
    versions: IS_MAINNET ? XPUB_VERSIONS : TPUB_VERSIONS,
    depth: node.depth,
    index: node.index,
    parentFingerprint: node.parentFingerprint,
    chainCode: node.chainCode!,
    publicKey: node.publicKey!,
  }).publicExtendedKey;
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Which of the vault's keys this device holds, with its origin filled in. */
function matchDeviceKey(vault: QuorumVault, fingerprint: string, deviceXpub: string, path: string) {
  const material = xpubMaterial(deviceXpub);
  const slot = vault.keys.findIndex((k) => xpubMaterial(k.xpub).equals(material));
  if (slot < 0) return null;
  const keys: QuorumKey[] = vault.keys.map((k, i) =>
    i === slot ? { ...k, fingerprint: fingerprint.toLowerCase(), path } : k,
  );
  return { slot, keys };
}

/** Paths to try on a device: those in the backup first, then the standard account. */
/**
 * Accounts tried when the vault does not record a key's path. A wallet can hold
 * several accounts on one seed (BitBoxApp and Ledger Live both add them), and
 * the vault may use any of them, not only the first.
 */
const ACCOUNTS_TO_TRY = 5;

function candidatePaths(vault: QuorumVault, fingerprint: string): string[] {
  const own = vault.keys.filter((k) => k.fingerprint?.toLowerCase() === fingerprint.toLowerCase() && k.path);
  const purposeCoin = DEFAULT_ACCOUNT_PATH.split("/").slice(0, 2).join("/");
  const accounts = Array.from({ length: ACCOUNTS_TO_TRY }, (_, i) => `${purposeCoin}/${i}'`);
  const all = [...own.map((k) => k.path!), ...vault.keys.map((k) => k.path).filter((p): p is string => !!p), ...accounts];
  return [...new Set(all)];
}

/** Make sure the PSBT tells the device which of its keys signs, and on which leaf. */
function addOwnDerivation(vault: QuorumVault, psbt: bitcoin.Psbt, slot: number, fingerprint: string, path: string) {
  const pubkey = vault.userExitKeys[slot];
  const entry = {
    masterFingerprint: Buffer.from(fingerprint, "hex"),
    pubkey,
    path: `m/${path}/2/${vault.addressIndex}`,
    leafHashes: [exitLeafHash(vault)],
  };
  psbt.data.inputs.forEach((input) => {
    input.tapBip32Derivation = [
      ...(input.tapBip32Derivation ?? []).filter((d) => !Buffer.from(d.pubkey).equals(pubkey)),
      entry,
    ];
  });
}

/** Add one key's signatures, skipping any it already has, and require one per input. */
function applySignatures(
  vault: QuorumVault,
  psbt: bitcoin.Psbt,
  slot: number,
  sigs: { inputIndex: number; pubkey: Buffer; signature: Buffer; leafHash?: Buffer }[],
): number {
  const key = vault.userExitKeys[slot];
  const leafHash = exitLeafHash(vault);
  const signed = new Set<number>();
  for (const s of sigs) {
    const xonly = s.pubkey.length === 33 ? s.pubkey.subarray(1) : s.pubkey;
    if (!xonly.equals(key)) continue;
    if (s.leafHash && !s.leafHash.equals(leafHash)) continue;
    const existing = psbt.data.inputs[s.inputIndex]?.tapScriptSig ?? [];
    if (!existing.some((e) => Buffer.from(e.pubkey).equals(key))) {
      psbt.updateInput(s.inputIndex, { tapScriptSig: [{ pubkey: key, signature: s.signature, leafHash }] });
    }
    signed.add(s.inputIndex);
  }
  if (signed.size !== psbt.inputCount) {
    throw new Error(`The device signed ${signed.size} of ${psbt.inputCount} inputs. Nothing was added.`);
  }
  return slot;
}

function label(vault: QuorumVault, slot: number) {
  const k = vault.keys[slot];
  return k.label || k.fingerprint || `Key ${slot + 1}`;
}

export async function signWithLedger(vault: QuorumVault, psbt: bitcoin.Psbt): Promise<string> {
  const [{ default: TransportWebHID }, { AppClient, WalletPolicy }] = await Promise.all([
    import("@ledgerhq/hw-transport-webhid"),
    import("ledger-bitcoin"),
  ]);
  let transport;
  try {
    transport = await TransportWebHID.create();
  } catch {
    throw new Error(
      `Could not open the Ledger. Plug it in, unlock it, open the ${IS_MAINNET ? "Bitcoin" : "Bitcoin Test"} app and close Ledger Live.`,
    );
  }
  try {
    const app = new AppClient(transport as any);
    const fingerprint = (await app.getMasterFingerprint()).toLowerCase();

    let match: ReturnType<typeof matchDeviceKey> = null;
    let path = "";
    for (const p of candidatePaths(vault, fingerprint)) {
      const xpub = await app.getExtendedPubkey(`m/${p}`, false);
      match = matchDeviceKey(vault, fingerprint, xpub, p);
      if (match) {
        path = p;
        break;
      }
    }
    if (!match) {
      throw new Error(`This Ledger (${fingerprint}) holds none of this vault's keys. Connect another device, or check its passphrase.`);
    }

    const keys = [
      originless(vault, "nums"),
      ...match.keys.map((k) => (k.fingerprint && k.path ? `[${k.fingerprint}/${k.path}]${forNetwork(k.xpub)}` : forNetwork(k.xpub))),
      originless(vault, "loan"),
    ];
    const policy = new WalletPolicy(POLICY_NAME, policyDescriptor(vault.keys.length, vault.threshold, vault.timelockBlocks), keys);
    const [, hmac] = await step("Registering the vault policy on the Ledger", () => app.registerWallet(policy));

    const deviceAddress = await step("Reading the vault address from the Ledger", () =>
      app.getWalletAddress(policy, hmac, 0, vault.addressIndex, false),
    );
    if (deviceAddress !== vault.address) {
      throw new Error(`The Ledger derives ${deviceAddress} for this policy, not the vault ${vault.address}. Nothing was signed.`);
    }

    addOwnDerivation(vault, psbt, match.slot, fingerprint, path);
    const result = await step("Signing on the Ledger", () => app.signPsbt(psbt.toBase64(), policy, hmac));
    applySignatures(
      vault,
      psbt,
      match.slot,
      result.map(([inputIndex, s]) => ({
        inputIndex,
        pubkey: Buffer.from(s.pubkey),
        signature: Buffer.from(s.signature),
        leafHash: s.tapleafHash ? Buffer.from(s.tapleafHash) : undefined,
      })),
    );
    return label(vault, match.slot);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

/** NUMS and the DCN key, named by their own fingerprint as the web app does. */
function originless(vault: QuorumVault, which: "nums" | "loan"): string {
  const xpub = which === "nums" ? vault.numsXpub : vault.loanXpub;
  return `[${hex8(parseXpub(xpub).fingerprint)}]${forNetwork(xpub)}`;
}

/** Run one device step, and say which step a refusal came from. */
async function step<T>(name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err: any) {
    console.warn(`[device] ${name} failed`, err);
    throw new Error(`${name}: ${err?.message || String(err)}`);
  }
}

export async function signWithBitBox(
  vault: QuorumVault,
  psbt: bitcoin.Psbt,
  onPairingCode: (code: string | null) => void,
): Promise<string> {
  const device = await openBitBox(onPairingCode);
  try {
    const coin = IS_MAINNET ? ("btc" as const) : ("tbtc" as const);
    const fingerprint = (await device.rootFingerprint()).toLowerCase();

    let match: ReturnType<typeof matchDeviceKey> = null;
    let path = "";
    for (const p of candidatePaths(vault, fingerprint)) {
      const xpub = await device.btcXpub(coin, `m/${p}`, IS_MAINNET ? "xpub" : "tpub", false);
      match = matchDeviceKey(vault, fingerprint, xpub, p);
      if (match) {
        path = p;
        break;
      }
    }
    if (!match) {
      throw new Error(`This BitBox (${fingerprint}) holds none of this vault's keys. Connect another device, or check its passphrase.`);
    }

    const scriptConfig = {
      policy: {
        policy: policyDescriptor(vault.keys.length, vault.threshold, vault.timelockBlocks),
        keys: [
          { xpub: vault.numsXpub },
          ...match.keys.map((k) =>
            k.fingerprint && k.path ? { xpub: k.xpub, rootFingerprint: k.fingerprint, keypath: `m/${k.path}` } : { xpub: k.xpub },
          ),
          { xpub: vault.loanXpub },
        ],
      },
    };
    const registered = await step("Checking the vault policy on the BitBox", () =>
      device.btcIsScriptConfigRegistered(coin, scriptConfig),
    );
    if (!registered) {
      const digest = Buffer.from(bitcoin.crypto.sha256(Buffer.from(JSON.stringify([coin, scriptConfig])))).toString("hex");
      await step("Registering the vault policy on the BitBox", () =>
        device.btcRegisterScriptConfig(coin, scriptConfig, undefined, "autoXpubTpub", `Surge ${digest.slice(0, 20)}`),
      );
    }

    const deviceAddress = await step("Reading the vault address from the BitBox", () =>
      device.btcAddress(coin, `m/${path}/0/${vault.addressIndex}`, scriptConfig, false),
    );
    if (deviceAddress !== vault.address) {
      throw new Error(`The BitBox derives ${deviceAddress} for this policy, not the vault ${vault.address}. Nothing was signed.`);
    }

    addOwnDerivation(vault, psbt, match.slot, fingerprint, path);
    const signedB64 = await step("Signing on the BitBox", () =>
      device.btcSignPSBT(coin, psbt.toBase64(), { scriptConfig, keypath: `m/${path}` }, "default"),
    );
    const signed = bitcoin.Psbt.fromBase64(signedB64, { network: NETWORK });
    const sigs = signed.data.inputs.flatMap((input, inputIndex) =>
      (input.tapScriptSig ?? []).map((s) => ({
        inputIndex,
        pubkey: Buffer.from(s.pubkey),
        signature: Buffer.from(s.signature),
        leafHash: Buffer.from(s.leafHash),
      })),
    );
    applySignatures(vault, psbt, match.slot, sigs);
    return label(vault, match.slot);
  } finally {
    device.close();
  }
}


const BITBOX_HID = { vendorId: 0x03eb, productId: 0x2403 };

/**
 * Pick the BitBox before anything slow happens, and return it.
 *
 * Chrome opens its device picker only while the click that asked for it is
 * still recent, so this runs first. Matching is by vendor id, so every BitBox
 * edition is offered; the library's own check also wants "BitBox02" in the USB
 * product name, which Chrome sometimes reports empty or differently.
 */
async function pickBitBox(): Promise<any> {
  const hid = (navigator as any).hid;
  if (!hid) throw new Error("USB access needs Chrome, Edge or Brave on desktop.");
  const isBox = (d: any) =>
    d.vendorId === BITBOX_HID.vendorId || String(d.productName ?? "").includes("BitBox02");
  const granted: any[] = (await hid.getDevices().catch(() => [])).filter(isBox);
  if (granted.length) return granted[0];
  let picked: any[] = [];
  try {
    picked = await hid.requestDevice({ filters: [{ vendorId: BITBOX_HID.vendorId }] });
  } catch (err: any) {
    console.warn("[bitbox] USB permission request failed", err);
    if (err?.name === "NotAllowedError") {
      throw new Error("Chrome did not open the BitBox picker in time. Click the button again; the second click opens it straight away.");
    }
    throw new Error("Could not open the BitBox picker. Plug it in, unlock it, close BitBoxApp, then try again.");
  }
  if (!picked.length) {
    throw new Error("No BitBox was selected. Plug it in, unlock it, close BitBoxApp, then choose it in the Chrome dialog.");
  }
  return picked[0];
}

/**
 * Hand the library exactly the device that was picked.
 *
 * It reads `navigator.hid` at call time, so for the length of the connect it
 * sees a view that lists only this device, with a product name it accepts.
 * Everything else, including disconnect events, goes to the real API.
 */
async function withOnlyDevice<T>(device: any, work: () => Promise<T>): Promise<T> {
  const real = (navigator as any).hid;
  const named = new Proxy(device, {
    get(target, prop) {
      if (prop === "productName") {
        const name = String(target.productName ?? "");
        return name.includes("BitBox02") ? name : "BitBox02";
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const view = {
    getDevices: async () => [named],
    requestDevice: async () => [named],
    addEventListener: (type: string, listener: any) => real.addEventListener(type, listener),
    removeEventListener: (type: string, listener: any) => real.removeEventListener(type, listener),
  };
  Object.defineProperty(navigator, "hid", { configurable: true, value: view });
  try {
    return await work();
  } finally {
    Object.defineProperty(navigator, "hid", { configurable: true, value: real });
  }
}

/** Open and pair a BitBox, with errors that say what to do. */
async function openBitBox(onPairingCode: (code: string | null) => void): Promise<PairedBitBox> {
  const picked = await pickBitBox();
  console.info("[bitbox] using device", {
    productName: picked.productName,
    vendorId: picked.vendorId,
    productId: picked.productId,
    opened: picked.opened,
  });
  const api = await import("@bitboxswiss/bitbox-api");
  try {
    const unpaired = await withOnlyDevice(picked, () => api.bitbox02ConnectWebHID());
    const pairing = await unpaired.unlockAndPair();
    onPairingCode(pairing.getPairingCode() ?? null);
    const device = await pairing.waitConfirm();
    const [major, minor] = device.version().replace(/^v/, "").split(".").map(Number);
    if (major < 9 || (major === 9 && minor < 21)) {
      device.close();
      throw new Error("Update the BitBox firmware to 9.21.0 or newer to sign Taproot vault policies.");
    }
    return device;
  } catch (err: any) {
    console.warn("[bitbox] connect failed", err);
    const code = err?.code as string | undefined;
    if (code === "user-abort" || code === "webhid-cancel") {
      throw new Error("No BitBox was selected. Plug it in, unlock it, close BitBoxApp, then try again.");
    }
    if (code === "webhid" || code === "could-not-open") {
      throw new Error("The BitBox is busy. Close BitBoxApp (and any other tab using it), unplug and replug it, then try again.");
    }
    throw new Error(err?.message || "Could not open the BitBox. Plug it in, unlock it and close BitBoxApp.");
  } finally {
    onPairingCode(null);
  }
}

/** Which of the vault's keys a device or seed holds. */
export type KeyMatch = { slot: number; fingerprint: string; path: string };

/**
 * Find this seed's key in the vault, or say plainly that it is the wrong one.
 *
 * `readXpub` is asked for the account at each path the vault could use. A
 * passphrase changes the seed's fingerprint too, so a wrong passphrase looks
 * exactly like a different seed; the message says so.
 */
async function identify(
  vault: QuorumVault,
  what: "Ledger" | "BitBox02" | "seed",
  fingerprint: string,
  readXpub: (path: string) => Promise<string>,
): Promise<KeyMatch> {
  for (const path of candidatePaths(vault, fingerprint)) {
    const match = matchDeviceKey(vault, fingerprint, await readXpub(path), path);
    if (match) return { slot: match.slot, fingerprint, path };
  }
  const known = vault.keys.map((k) => k.fingerprint).filter((f) => f && f !== "00000000");
  const tried = candidatePaths(vault, fingerprint).map((p) => `m/${p}`).join(", ");
  throw new Error(
    `Wrong key: this ${what} (fingerprint ${fingerprint}) holds none of this vault's keys at ${tried}` +
      (known.length ? `; the vault's keys are ${known.join(", ")}` : "") +
      `. If it is the right ${what === "seed" ? "seed" : "device"}, check its passphrase.`,
  );
}

/** Check a Ledger holds one of the vault's keys. Reads public keys only; nothing is signed. */
export async function identifyLedger(vault: QuorumVault): Promise<KeyMatch> {
  const [{ default: TransportWebHID }, { AppClient }] = await Promise.all([
    import("@ledgerhq/hw-transport-webhid"),
    import("ledger-bitcoin"),
  ]);
  let transport;
  try {
    transport = await TransportWebHID.create();
  } catch {
    throw new Error(
      `Could not open the Ledger. Plug it in, unlock it, open the ${IS_MAINNET ? "Bitcoin" : "Bitcoin Test"} app and close Ledger Live.`,
    );
  }
  try {
    const app = new AppClient(transport as any);
    const fingerprint = (await app.getMasterFingerprint()).toLowerCase();
    return await identify(vault, "Ledger", fingerprint, (path) => app.getExtendedPubkey(`m/${path}`, false));
  } finally {
    await transport.close().catch(() => undefined);
  }
}

/** Check a BitBox02 holds one of the vault's keys. Reads public keys only; nothing is signed. */
export async function identifyBitBox(
  vault: QuorumVault,
  onPairingCode: (code: string | null) => void,
): Promise<KeyMatch> {
  const device = await openBitBox(onPairingCode);
  try {
    const coin = IS_MAINNET ? ("btc" as const) : ("tbtc" as const);
    const fingerprint = (await device.rootFingerprint()).toLowerCase();
    return await identify(vault, "BitBox02", fingerprint, (path) =>
      device.btcXpub(coin, `m/${path}`, IS_MAINNET ? "xpub" : "tpub", false),
    );
  } finally {
    device.close();
  }
}

/** Check recovery words (e.g. the exported enclave seed) belong to one of the vault's keys. */
export async function identifyWords(vault: QuorumVault, mnemonic: string, passphrase: string): Promise<KeyMatch> {
  const words = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(words, wordlist)) throw new Error("Those recovery words are not valid");
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(words, passphrase), IS_MAINNET ? XPUB_VERSIONS : TPUB_VERSIONS);
  return identify(vault, "seed", hex8(root.fingerprint), async (path) =>
    root.derive(`m/${path}`).publicExtendedKey,
  );
}
