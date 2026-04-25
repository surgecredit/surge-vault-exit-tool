import * as bitcoin from "bitcoinjs-lib";
import { crypto as bcrypto } from "bitcoinjs-lib";

export const TAPROOT_LEAF_VERSION = 0xc0;

function compactSize(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b.writeUInt8(0xfd, 0);
    b.writeUInt16LE(n, 1);
    return b;
  }
  throw new Error("script too large for tapleaf encoding");
}

export function tapleafHash(
  scriptBuf: Buffer,
  leafVersion: number = TAPROOT_LEAF_VERSION,
): Buffer {
  const ver = Buffer.from([leafVersion]);
  const len = compactSize(scriptBuf.length);
  return Buffer.from(
    bcrypto.taggedHash("TapLeaf", Buffer.concat([ver, len, scriptBuf])),
  );
}

export function tapBranchHash(a: Buffer, b: Buffer): Buffer {
  const [left, right] = Buffer.compare(a, b) < 0 ? [a, b] : [b, a];
  return Buffer.from(
    bcrypto.taggedHash("TapBranch", Buffer.concat([left, right])),
  );
}

const OP_NAMES: Record<number, string> = (() => {
  const map: Record<number, string> = {};
  for (const [name, code] of Object.entries(bitcoin.script.OPS)) {
    map[code as number] = name;
  }
  return map;
})();

function prettyOpName(name: string): string {
  const m = name.match(/^OP_(\d+)$/);
  if (m) return `OP_PUSHNUM_${m[1]}`;
  return name;
}

export type ScriptToken =
  | { type: "opcode"; name: string }
  | { type: "push"; hex: string };

export function decodeScript(buf: Buffer): ScriptToken[] {
  const chunks = bitcoin.script.decompile(buf);
  if (!chunks) return [];
  return chunks.map((chunk): ScriptToken => {
    if (Buffer.isBuffer(chunk)) {
      return { type: "push", hex: chunk.toString("hex") };
    }
    const raw = OP_NAMES[chunk] || `OP_UNKNOWN_${chunk}`;
    return { type: "opcode", name: prettyOpName(raw) };
  });
}
