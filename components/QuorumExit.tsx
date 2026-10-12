"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as bitcoin from "bitcoinjs-lib";
import {
  BTC_EXPLORER,
  IS_MAINNET,
  NETWORK,
  NETWORK_LABEL,
  Utxo,
  getFeeRates,
  getTipHeight,
  getUtxos,
  pushTx,
} from "@/lib/bitcoin";
import { QUORUM_EXIT_CSV_BLOCKS, QuorumVault, accountAddress } from "@/lib/quorum";
import { buildQuorumExitPsbt, finalizeQuorumExit, signWithRecoveryWords, signedKeySlots } from "@/lib/quorum-exit";
import { RegisteredVault, loadVaultsFromBase, registryConfigured } from "@/lib/registry";
import { identifyBitBox, identifyLedger, identifyWords, signWithBitBox, signWithLedger } from "@/lib/devices";

type KeyKind = "ledger" | "bitbox" | "words";
const KIND_LABEL: Record<KeyKind, string> = { ledger: "Ledger", bitbox: "BitBox02", words: "Recovery words" };

const formatBtc = (sats: number) => (sats / 100_000_000).toFixed(8).replace(/\.?0+$/, "");

// Inputs inside a gray-800 panel.
const input =
  "rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-500";
// Inputs directly on a gray-900 card, as the tool styles them elsewhere.
const cardInput =
  "rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-500";
const primary = "rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-3 py-1.5 text-xs font-medium";
const secondary = "rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-3 py-1.5 text-xs";

function PairingCode({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <div className="rounded-lg bg-gray-900 p-3 text-xs">
      <p className="text-gray-300">Check this code matches the BitBox screen, then confirm on the device:</p>
      <p className="mt-2 font-mono text-sm text-orange-300 whitespace-pre-wrap">{code}</p>
    </div>
  );
}

export default function QuorumExit() {
  // 1. Load the vault from Base
  const [evmInput, setEvmInput] = useState("");
  const [timelock, setTimelock] = useState(String(QUORUM_EXIT_CSV_BLOCKS));
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState("");
  const [chainVaults, setChainVaults] = useState<RegisteredVault[] | null>(null);
  const [vault, setVault] = useState<QuorumVault | null>(null);
  const [nftId, setNftId] = useState<bigint | null>(null);

  // 2. Connect keys
  const [connected, setConnected] = useState<Record<number, KeyKind>>({});
  const [connectBusy, setConnectBusy] = useState<"" | KeyKind>("");
  const [connectError, setConnectError] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectWords, setConnectWords] = useState("");
  const [connectPass, setConnectPass] = useState("");

  // Coins
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [tipHeight, setTipHeight] = useState(0);
  const [loadingCoins, setLoadingCoins] = useState(false);
  const [coinsError, setCoinsError] = useState("");

  // 3. Withdraw
  const [destination, setDestination] = useState("");
  const [feeRate, setFeeRate] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [psbt, setPsbt] = useState<bitcoin.Psbt | null>(null);
  const [built, setBuilt] = useState<{ fee: number; amountSent: number } | null>(null);
  const [builtAsTest, setBuiltAsTest] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [version, setVersion] = useState(0);

  // Signing
  const [signBusy, setSignBusy] = useState<number | null>(null);
  const [signError, setSignError] = useState("");
  const [signMessage, setSignMessage] = useState("");
  const [wordsFor, setWordsFor] = useState<number | null>(null);
  const [signWords, setSignWords] = useState("");
  const [signPass, setSignPass] = useState("");

  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState("");
  const [txid, setTxid] = useState("");

  const findVaults = async () => {
    setChainError("");
    setChainVaults(null);
    setChainBusy(true);
    try {
      setChainVaults(
        await loadVaultsFromBase(evmInput, { timelockBlocks: IS_MAINNET ? QUORUM_EXIT_CSV_BLOCKS : Number(timelock) }),
      );
    } catch (err: any) {
      setChainError(err?.message || "Could not read the vault keys from Base");
    } finally {
      setChainBusy(false);
    }
  };

  const openVault = (found: RegisteredVault) => {
    setVault(found.vault);
    setNftId(found.nftId);
    setConnected({});
    setConnectError("");
    setPsbt(null);
    setBuilt(null);
    setTxid("");
    setSignMessage("");
    setSignError("");
  };

  // The timelock is part of the vault's scripts, so a different value is a
  // different vault address. Rebuild what is on screen whenever it changes,
  // keeping the open vault (and its connected keys, which do not change) open.
  useEffect(() => {
    if (IS_MAINNET || chainVaults === null || !evmInput.trim()) return;
    const blocks = Number(timelock);
    if (!Number.isInteger(blocks) || blocks < 1) return;
    if (vault ? vault.timelockBlocks === blocks : chainVaults.every((v) => v.vault.timelockBlocks === blocks)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setChainError("");
      setChainBusy(true);
      try {
        const found = await loadVaultsFromBase(evmInput, { timelockBlocks: blocks });
        if (cancelled) return;
        setChainVaults(found);
        if (vault) {
          const same = found.find((f) => f.nftId === nftId);
          if (same) {
            setVault(same.vault);
            setPsbt(null);
            setBuilt(null);
            setTxid("");
            setSignMessage("");
            setSignError("");
          } else {
            closeVault();
          }
        }
      } catch (err: any) {
        if (!cancelled) setChainError(err?.message || "Could not read the vault keys from Base");
      } finally {
        if (!cancelled) setChainBusy(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelock]);

  const closeVault = () => {
    setVault(null);
    setNftId(null);
    setConnected({});
    setPsbt(null);
  };

  const connectKey = async (kind: KeyKind) => {
    if (!vault) return;
    setConnectError("");
    setConnectBusy(kind);
    try {
      const match =
        kind === "ledger"
          ? await identifyLedger(vault)
          : kind === "bitbox"
            ? await identifyBitBox(vault, setPairingCode)
            : await identifyWords(vault, connectWords, connectPass);
      setConnected((c) => ({ ...c, [match.slot]: kind }));
      if (kind === "words") {
        setConnectWords("");
        setConnectPass("");
      }
    } catch (err: any) {
      setConnectError(err?.message || "Could not check that key");
    } finally {
      setPairingCode(null);
      setConnectBusy("");
    }
  };

  const refresh = useCallback(async () => {
    if (!vault) return;
    setLoadingCoins(true);
    setCoinsError("");
    try {
      const [coins, height, fees] = await Promise.all([getUtxos(vault.address), getTipHeight(), getFeeRates()]);
      setUtxos(coins);
      setTipHeight(height);
      setFeeRate((current) => current || String(fees.halfHourFee || 1));
    } catch (err: any) {
      setCoinsError(err.message || "Could not load the vault's coins");
    } finally {
      setLoadingCoins(false);
    }
  }, [vault]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const blocksLeft = (u: Utxo) =>
    u.status.confirmed ? Math.max(0, vault!.timelockBlocks - (tipHeight - u.status.block_height)) : null;
  const eligible = vault ? utxos.filter((u) => blocksLeft(u) === 0) : [];
  const totalSats = utxos.reduce((s, u) => s + u.value, 0);
  const eligibleSats = eligible.reduce((s, u) => s + u.value, 0);
  // Signet only: sign coins still inside the timelock, to test the devices. Never broadcast.
  const spendable = testMode ? utxos.filter((u) => u.status.confirmed) : eligible;

  const connectedCount = Object.keys(connected).length;
  const enoughKeys = !!vault && connectedCount >= vault.threshold;
  const slots = useMemo(() => (vault && psbt ? signedKeySlots(vault, psbt) : []), [vault, psbt, version]);
  const signedCount = slots.filter(Boolean).length;
  const ready = !!vault && signedCount >= vault.threshold;

  const keyName = (slot: number) => {
    const k = vault!.keys[slot];
    const kind = connected[slot];
    return `${kind ? KIND_LABEL[kind] : `Key ${slot + 1}`} (${k.fingerprint ?? "?"})`;
  };

  const withdraw = () => {
    if (!vault) return;
    setBuildError("");
    setTxid("");
    try {
      const rate = Number(feeRate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("Enter a fee rate above 0 sat/vB");
      const result = buildQuorumExitPsbt(vault, spendable, destination, rate);
      setPsbt(result.psbt);
      setBuilt({ fee: result.fee, amountSent: result.amountSent });
      setBuiltAsTest(testMode && spendable.some((u) => blocksLeft(u) !== 0));
      setVersion((v) => v + 1);
    } catch (err: any) {
      setPsbt(null);
      setBuilt(null);
      setBuildError(err.message || "Could not build the withdrawal");
    }
  };

  const signOnDevice = async (slot: number, kind: "ledger" | "bitbox") => {
    if (!vault || !psbt) return;
    setSignError("");
    setSignMessage("");
    setSignBusy(slot);
    try {
      const work = bitcoin.Psbt.fromBase64(psbt.toBase64(), { network: NETWORK });
      if (kind === "ledger") await signWithLedger(vault, work);
      else await signWithBitBox(vault, work, setPairingCode);
      if (!signedKeySlots(vault, work)[slot]) {
        throw new Error(`The connected ${KIND_LABEL[kind]} signed, but with a different key than ${keyName(slot)}.`);
      }
      setPsbt(work);
      setSignMessage(`Signed with ${keyName(slot)}. Unplug it before connecting the next device.`);
      setVersion((v) => v + 1);
    } catch (err: any) {
      setSignError(err?.message || "The device did not sign");
    } finally {
      setPairingCode(null);
      setSignBusy(null);
    }
  };

  const signWithWords = (slot: number) => {
    if (!vault || !psbt) return;
    setSignError("");
    setSignMessage("");
    try {
      const work = bitcoin.Psbt.fromBase64(psbt.toBase64(), { network: NETWORK });
      signWithRecoveryWords(vault, work, signWords, signPass, vault.keys[slot].path ?? "");
      if (!signedKeySlots(vault, work)[slot]) throw new Error(`Those words are not the key for ${keyName(slot)}.`);
      setPsbt(work);
      setSignWords("");
      setSignPass("");
      setWordsFor(null);
      setSignMessage(`Signed with ${keyName(slot)}.`);
      setVersion((v) => v + 1);
    } catch (err: any) {
      setSignError(err.message || "Could not sign");
    }
  };

  const broadcast = async () => {
    if (!vault || !psbt) return;
    setBroadcastError("");
    setBroadcasting(true);
    try {
      const tx = finalizeQuorumExit(vault, bitcoin.Psbt.fromBase64(psbt.toBase64(), { network: NETWORK }));
      setTxid(await pushTx(tx.toHex()));
    } catch (err: any) {
      setBroadcastError(err.message || "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  };

  if (!vault) {
    return (
      <div className="rounded-xl bg-gray-900 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Load your multisig vault</h2>
          <p className="text-sm text-gray-400 mt-1">
            Enter the EVM address that opened the credit line. The vault&apos;s keys are read from Base and the vault is rebuilt here
            from them. No Surge service is contacted.
          </p>
        </div>
        {!registryConfigured() && (
          <p className="text-xs text-orange-300">The vault key registry is not deployed on {NETWORK_LABEL} yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={evmInput}
            onChange={(e) => setEvmInput(e.target.value)}
            placeholder="0x..."
            className={`min-w-0 flex-1 font-mono ${cardInput}`}
          />
          <button
            onClick={findVaults}
            disabled={!evmInput.trim() || chainBusy || !registryConfigured()}
            className="rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-4 py-2 text-sm font-medium"
          >
            {chainBusy ? "Reading Base..." : "Find my vaults"}
          </button>
        </div>
        {!IS_MAINNET && (
          <label className="block text-xs text-gray-400 space-y-1">
            <span>Exit timelock in blocks ({QUORUM_EXIT_CSV_BLOCKS} for a real vault; 1 for a test vault)</span>
            <input value={timelock} onChange={(e) => setTimelock(e.target.value)} className={`w-32 ${cardInput}`} />
          </label>
        )}
        {chainError && <p className="text-sm text-red-400">{chainError}</p>}
        {chainVaults && chainVaults.length === 0 && (
          <p className="text-xs text-orange-300">No multisig vaults are registered for this address.</p>
        )}
        {chainVaults && chainVaults.length > 0 && (
          <div className="space-y-2">
            {chainVaults.map((f) => (
              <div key={f.nftId.toString()} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-800 p-3 text-xs">
                <div className="min-w-0">
                  <div className="break-all font-mono text-orange-400">{f.vault.address}</div>
                  <div className="mt-1 text-gray-400">
                    Position #{f.nftId.toString()} · {f.vault.threshold} of {f.vault.keys.length} ·{" "}
                    <span className={f.balance > 0 ? "text-green-400" : ""}>{formatBtc(f.balance)} BTC</span>
                  </div>
                </div>
                <button onClick={() => openVault(f)} className={primary}>
                  Use this vault
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vault */}
      <div className="rounded-xl bg-gray-900 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Multisig vault{" "}
            <span className="text-gray-400 text-sm font-normal">
              {vault.threshold} of {vault.keys.length} · position #{nftId?.toString()} · {NETWORK_LABEL}
            </span>
          </h2>
          <button onClick={closeVault} className="text-xs text-gray-400 hover:text-gray-200">
            Load a different vault
          </button>
        </div>
        <a
          href={`${BTC_EXPLORER}/address/${vault.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all rounded-lg bg-gray-800 p-3 font-mono text-sm text-orange-400 hover:text-orange-300"
        >
          {vault.address}
        </a>
        {!IS_MAINNET && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>Exit timelock in blocks ({QUORUM_EXIT_CSV_BLOCKS} for a real vault; 1 for a test vault)</span>
            <input value={timelock} onChange={(e) => setTimelock(e.target.value)} className={`w-32 ${cardInput}`} />
            {chainBusy && <span>Rebuilding...</span>}
          </label>
        )}
      </div>

      {/* Connect keys */}
      <div className="rounded-xl bg-gray-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Connect your keys</h2>
          <span className={enoughKeys ? "text-green-400 text-sm" : "text-gray-400 text-sm"}>
            {connectedCount} of {vault.threshold} needed
          </span>
        </div>
        <p className="text-sm text-gray-400">
          Connect any {vault.threshold} of these keys. Each one is checked against the vault; a device or seed that is not one of them is
          rejected.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {vault.keys.map((k, i) => (
            <div key={k.xpub} className="rounded-lg bg-gray-800 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-gray-200">
                <span className={`inline-block h-2 w-2 rounded-full ${connected[i] ? "bg-green-400" : "bg-gray-600"}`} />
                {connected[i] ? `${KIND_LABEL[connected[i]]} connected` : `Key ${i + 1}: not connected`}
              </div>
              <div className="mt-1 font-mono text-gray-500">[{k.fingerprint}/{k.path}]</div>
              <div className="mt-1 break-all font-mono text-gray-500">{accountAddress(k.xpub)}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-gray-800 p-4 space-y-3">
          <p className="text-xs text-gray-400">
            Hardware wallet: plug in one at a time over USB (Chrome, Edge or Brave on desktop). Ledger: open the{" "}
            {IS_MAINNET ? "Bitcoin" : "Bitcoin Test"} app and close Ledger Live. BitBox02: close BitBoxApp.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => connectKey("ledger")} disabled={!!connectBusy} className={secondary}>
              {connectBusy === "ledger" ? "Checking Ledger..." : "Connect Ledger"}
            </button>
            <button onClick={() => connectKey("bitbox")} disabled={!!connectBusy} className={secondary}>
              {connectBusy === "bitbox" ? "Checking BitBox02..." : "Connect BitBox02"}
            </button>
          </div>
          <PairingCode code={signBusy === null ? pairingCode : null} />
          <div className="space-y-2 border-t border-gray-700 pt-3">
            <p className="text-xs text-gray-400">
              Enclave key (or a lost device): its recovery words, exported from the Surge app under Profile, Show Seed Phrase. Only
              checked here; you enter them again to sign.
            </p>
            <textarea
              value={connectWords}
              onChange={(e) => setConnectWords(e.target.value)}
              placeholder="12 or 24 recovery words"
              rows={2}
              autoComplete="off"
              spellCheck={false}
              className={`w-full font-mono text-xs ${input}`}
            />
            <PassphraseField value={connectPass} onChange={setConnectPass} inputClass={input} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => connectKey("words")} disabled={!connectWords.trim() || !!connectBusy} className={secondary}>
                Check recovery words
              </button>
            </div>
          </div>
          {connectError && <p className="text-sm text-red-400">{connectError}</p>}
        </div>
      </div>

      {/* Coins */}
      <div className="rounded-xl bg-gray-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Coins</h2>
          <button onClick={refresh} disabled={loadingCoins} className="rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs">
            {loadingCoins ? "Loading..." : "Refresh"}
          </button>
        </div>
        {coinsError && <p className="text-sm text-red-400">{coinsError}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="text-xs text-gray-400">In the vault</div>
            <div className="mt-1 text-xl text-green-400">{formatBtc(totalSats)} BTC</div>
          </div>
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="text-xs text-gray-400">Ready to withdraw</div>
            <div className="mt-1 text-xl text-green-400">{formatBtc(eligibleSats)} BTC</div>
          </div>
          <div className="rounded-lg bg-gray-800 p-3">
            <div className="text-xs text-gray-400">Current block</div>
            <div className="mt-1 text-xl text-sky-400">{tipHeight || "-"}</div>
          </div>
        </div>
        {utxos.length === 0 && !loadingCoins && <p className="text-sm text-gray-400">No coins at this address.</p>}
        <div className="space-y-2">
          {utxos.map((u) => {
            const left = blocksLeft(u);
            return (
              <div key={`${u.txid}:${u.vout}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-800 p-3 text-xs">
                <a href={`${BTC_EXPLORER}/tx/${u.txid}`} target="_blank" rel="noopener noreferrer" className="font-mono text-gray-300 hover:text-orange-300">
                  {u.txid.slice(0, 12)}...:{u.vout}
                </a>
                <span className="text-green-400">{formatBtc(u.value)} BTC</span>
                <span className={left === 0 ? "text-green-400" : "text-gray-400"}>
                  {left === null ? "unconfirmed" : left === 0 ? "ready" : `${left.toLocaleString()} blocks left`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Withdraw */}
      <div className="rounded-xl bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Withdraw</h2>
        <p className="text-sm text-gray-400">
          Sends every ready coin through the exit path. It needs {vault.threshold} of the {vault.keys.length} keys.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <label className="text-xs text-gray-400 space-y-1">
            <span>Destination Bitcoin address</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={IS_MAINNET ? "bc1..." : "tb1..."}
              className={`w-full font-mono ${cardInput}`}
            />
          </label>
          <label className="text-xs text-gray-400 space-y-1">
            <span>Fee rate (sat/vB)</span>
            <input value={feeRate} onChange={(e) => setFeeRate(e.target.value)} placeholder="sat/vB" className={`w-full ${cardInput}`} />
          </label>
        </div>
        {!IS_MAINNET && (
          <label className="flex items-start gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} className="mt-0.5" />
            <span>
              Test signing only: include coins still inside the timelock, so the keys can be tested now. The result cannot be
              broadcast until the timelock ends.
            </span>
          </label>
        )}
        {!enoughKeys && (
          <p className="text-xs text-orange-300">Connect {vault.threshold - connectedCount} more key(s) above before withdrawing.</p>
        )}
        {buildError && <p className="text-sm text-red-400">{buildError}</p>}
        <button
          onClick={withdraw}
          disabled={!enoughKeys || !destination.trim() || spendable.length === 0}
          className="rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-4 py-2 text-sm font-medium"
        >
          Withdraw
        </button>
        {built && (
          <p className="text-sm text-gray-300">
            Sends <span className="text-green-400">{formatBtc(built.amountSent)} BTC</span> with a fee of {built.fee.toLocaleString()} sats.
          </p>
        )}
      </div>

      {/* Signatures */}
      {psbt && (
        <div className="rounded-xl bg-gray-900 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Sign the withdrawal</h2>
            <span className={ready ? "text-green-400 text-sm" : "text-gray-400 text-sm"}>
              {signedCount} of {vault.threshold} signed
            </span>
          </div>
          <p className="text-sm text-gray-400">Sign with each connected key, on its device or with its recovery words.</p>
          <div className="space-y-2">
            {Object.entries(connected).map(([slotText, kind]) => {
              const slot = Number(slotText);
              const done = slots[slot];
              const useWords = kind === "words" || wordsFor === slot;
              return (
                <div key={slot} className="rounded-lg bg-gray-800 p-3 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-gray-200">{keyName(slot)}</span>
                    {done ? (
                      <span className="text-green-400">signed</span>
                    ) : (
                      kind !== "words" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => signOnDevice(slot, kind)} disabled={signBusy !== null} className={primary}>
                            {signBusy === slot ? `Waiting for ${KIND_LABEL[kind]}...` : `Sign on ${KIND_LABEL[kind]}`}
                          </button>
                          <button
                            onClick={() => setWordsFor(wordsFor === slot ? null : slot)}
                            className="text-gray-400 hover:text-gray-200 underline"
                          >
                            {wordsFor === slot ? "Use the device" : "Use recovery words instead"}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                  {!done && useWords && (
                    <div className="space-y-2">
                      <textarea
                        value={signWords}
                        onChange={(e) => setSignWords(e.target.value)}
                        placeholder="12 or 24 recovery words"
                        rows={2}
                        autoComplete="off"
                        spellCheck={false}
                        className={`w-full font-mono text-xs ${input}`}
                      />
                      <PassphraseField value={signPass} onChange={setSignPass} inputClass={input} />
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => signWithWords(slot)} disabled={!signWords.trim()} className={primary}>
                          Sign with recovery words
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <PairingCode code={signBusy !== null ? pairingCode : null} />
          <p className="text-xs text-gray-500">
            Recovery words stay in this page and are cleared after signing, but anything typed into a browser is exposed to that
            computer. Use an offline machine if you can.
          </p>

          {signMessage && <p className="text-sm text-green-400">{signMessage}</p>}
          {signError && <p className="text-sm text-red-400">{signError}</p>}

          {builtAsTest && (
            <p className="text-xs text-orange-300">Test withdrawal: it spends coins still inside the timelock, so broadcasting is disabled.</p>
          )}
          <button
            onClick={broadcast}
            disabled={!ready || broadcasting || builtAsTest}
            className="w-full rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-4 py-3 text-sm font-semibold"
          >
            {broadcasting ? "Broadcasting..." : "Broadcast withdrawal"}
          </button>
          {broadcastError && <p className="text-sm text-red-400">{broadcastError}</p>}
          {txid && (
            <a href={`${BTC_EXPLORER}/tx/${txid}`} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-green-400 hover:text-green-300">
              Broadcast: {txid}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * BIP-39 passphrase, hidden by default. Surge never sets one (the enclave key
 * has none); it only exists for a hardware wallet whose owner turned one on in
 * the device's own settings, and is needed when recovering that device's words.
 */
function PassphraseField({
  value,
  onChange,
  inputClass,
}: {
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-400 underline hover:text-gray-200">
        My device used a passphrase
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Passphrase set on the hardware wallet"
        autoComplete="off"
        className={`w-full ${inputClass}`}
      />
      <p className="text-xs text-gray-500">
        Only for a hardware wallet with a passphrase turned on in its own settings. Leave empty for the Surge enclave key.{" "}
        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="underline hover:text-gray-300"
        >
          No passphrase
        </button>
      </p>
    </div>
  );
}
