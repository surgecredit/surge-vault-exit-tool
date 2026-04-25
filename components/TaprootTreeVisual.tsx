"use client";

import { ReactNode, useMemo, useState, useCallback } from "react";
import { BTC_EXPLORER } from "@/lib/bitcoin";
import { VaultInfo } from "@/lib/vault";
import {
  ScriptToken,
  decodeScript,
  tapBranchHash,
  tapleafHash,
} from "@/lib/taproot-tree";

type NodeKey =
  | "output"
  | "internal"
  | "merkle"
  | "repayment"
  | "branch"
  | "liquidation"
  | "exit";

type NodeStyle = "output" | "key" | "branch" | "leaf";

type FieldValue = {
  name: string;
  value: string;
  mono?: boolean;
  render?: ReactNode;
};

type NodeInfo = {
  label: string;
  category: string;
  style: NodeStyle;
  fields: FieldValue[];
  scriptTokens?: ScriptToken[];
};

type Props = {
  vault: VaultInfo;
  borrowerAddress?: string;
};

const NODE_FILL: Record<NodeStyle, string> = {
  output: "#1e40af",
  key: "#5b21b6",
  branch: "#5b21b6",
  leaf: "#b45309",
};

export default function TaprootTreeVisual({
  vault,
  borrowerAddress,
}: Props) {
  const [selected, setSelected] = useState<NodeKey>("output");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const borrowerYou = borrowerAddress ? (
    <a
      href={`${BTC_EXPLORER}/address/${borrowerAddress}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-orange-400 hover:text-orange-300 hover:underline"
    >
      user
    </a>
  ) : (
    <span>user</span>
  );

  const dcnLink = (
    <a
      href="https://signer.surge.credit"
      target="_blank"
      rel="noopener noreferrer"
      className="text-orange-400 hover:text-orange-300 hover:underline"
    >
      DCN (Distributed Custody Network)
    </a>
  );

  const copyValue = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1500);
  }, []);

  const nodes = useMemo<Record<NodeKey, NodeInfo>>(() => {
    const repayLeaf = tapleafHash(vault.creditRepaymentScript);
    const liquidLeaf = tapleafHash(vault.liquidationScript);
    const exitLeaf = tapleafHash(vault.exitScript);
    const branchHash = tapBranchHash(liquidLeaf, exitLeaf);
    const merkleRoot = tapBranchHash(repayLeaf, branchHash);
    const outputKeyHex = vault.payment.pubkey?.toString("hex") || "";

    return {
      output: {
        label: "Public Key",
        category: "Tweaked Output Key",
        style: "output",
        fields: [
          {
            name: "Address",
            value: vault.address,
            mono: true,
            render: (
              <a
                href={`${BTC_EXPLORER}/address/${vault.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 hover:underline break-all"
              >
                {vault.address}
              </a>
            ),
          },
          { name: "Output Key", value: outputKeyHex, mono: true },
          {
            name: "Note",
            value:
              "The on-chain Taproot output key. Derived by tweaking the Internal Key with the Merkle root of the Tapscript tree shown above.",
          },
        ],
      },
      internal: {
        label: "Internal Key",
        category: "Internal Key (NUMS)",
        style: "key",
        fields: [
          {
            name: "Internal Key",
            value: vault.internalXOnly.toString("hex"),
            mono: true,
          },
          {
            name: "Derivation",
            value: 'sha256("SURGE-NUMS")',
            mono: true,
          },
          {
            name: "Verify",
            value: 'echo -n "SURGE-NUMS" | shasum -a 256',
            mono: true,
          },
          {
            name: "Note",
            value:
              "Provably-unspendable NUMS point. Disables key-path spending, so the vault can only be spent via one of the three script leaves below.",
          },
        ],
      },
      merkle: {
        label: "Taproot",
        category: "Taproot Tree",
        style: "branch",
        fields: [
          { name: "Merkle Root", value: merkleRoot.toString("hex"), mono: true },
          {
            name: "Note",
            value:
              "Root of the Tapscript tree. Three spending paths: credit repayment (cooperative), liquidation (DCN), and exit (user, after timelock).",
          },
        ],
      },
      repayment: {
        label: "Credit Repayment",
        category: "Script Leaf",
        style: "leaf",
        fields: [
          { name: "TapLeaf Hash", value: repayLeaf.toString("hex"), mono: true },
          {
            name: "Path",
            value:
              "Cooperative repayment. Requires 2-of-2 signatures from borrower / user and the Surge DCN (Distributed Custody Network).",
            render: (
              <span className="leading-6">
                Cooperative repayment. Requires 2-of-2 signatures from borrower
                / {borrowerYou} and the Surge {dcnLink}.
              </span>
            ),
          },
        ],
        scriptTokens: decodeScript(vault.creditRepaymentScript),
      },
      branch: {
        label: "Branch",
        category: "Tap Branch",
        style: "branch",
        fields: [
          { name: "Branch Hash", value: branchHash.toString("hex"), mono: true },
          {
            name: "Note",
            value:
              "Internal merkle node combining the liquidation and exit leaves.",
          },
        ],
      },
      liquidation: {
        label: "Liquidation",
        category: "Script Leaf",
        style: "leaf",
        fields: [
          {
            name: "TapLeaf Hash",
            value: liquidLeaf.toString("hex"),
            mono: true,
          },
          {
            name: "Path",
            value:
              "DCN-only spend used for liquidation when credit terms are breached. Governed by the Surge DCN (Distributed Custody Network).",
            render: (
              <span className="leading-6">
                DCN-only spend used for liquidation when credit terms are
                breached. Governed by the Surge {dcnLink}.
              </span>
            ),
          },
        ],
        scriptTokens: decodeScript(vault.liquidationScript),
      },
      exit: {
        label: "Exit",
        category: "Script Leaf",
        style: "leaf",
        fields: [
          { name: "TapLeaf Hash", value: exitLeaf.toString("hex"), mono: true },
          {
            name: "Timelock",
            value: `${vault.timelockBlocks.toLocaleString()} blocks (~1 year)`,
          },
          {
            name: "Path",
            value:
              "Borrower / user only sovereign recovery after the timelock expires. This is the path used by this tool.",
            render: (
              <span className="leading-6">
                Borrower / {borrowerYou} only sovereign recovery after the
                timelock expires. This is the path used by this tool.
              </span>
            ),
          },
        ],
        scriptTokens: decodeScript(vault.exitScript),
      },
    };
  }, [vault, borrowerYou, dcnLink]);

  const W = 760;
  const H = 440;
  const positions: Record<NodeKey, { x: number; y: number }> = {
    output: { x: 300, y: 40 },
    internal: { x: 110, y: 130 },
    merkle: { x: 490, y: 130 },
    repayment: { x: 320, y: 230 },
    branch: { x: 580, y: 230 },
    liquidation: { x: 470, y: 350 },
    exit: { x: 660, y: 350 },
  };

  const edges: [NodeKey, NodeKey][] = [
    ["output", "internal"],
    ["output", "merkle"],
    ["merkle", "repayment"],
    ["merkle", "branch"],
    ["branch", "liquidation"],
    ["branch", "exit"],
  ];

  const node = nodes[selected];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="border-b border-gray-800 p-4">
        <h2 className="text-lg font-bold text-white">Vault Inspector</h2>
        <p className="text-xs text-gray-500 mt-1">
          Explore the Taproot script tree. Click any node to see its details.
        </p>
      </div>
      <div className="bg-black/40 p-3 sm:p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: 520, height: "auto" }}
        >
          {edges.map(([a, b]) => {
            const pa = positions[a];
            const pb = positions[b];
            const my = (pa.y + pb.y) / 2;
            const isOnPath = selected === a || selected === b;
            return (
              <path
                key={`${a}-${b}`}
                d={`M${pa.x},${pa.y + 12} C${pa.x},${my} ${pb.x},${my} ${pb.x},${pb.y - 12}`}
                fill="none"
                stroke={isOnPath ? "#9ca3af" : "#374151"}
                strokeWidth={isOnPath ? 2 : 1.5}
              />
            );
          })}
          {(Object.keys(positions) as NodeKey[]).map((k) => {
            const { x, y } = positions[k];
            const n = nodes[k];
            const isSelected = selected === k;
            const labelWidth = Math.max(n.label.length * 7.2 + 28, 90);
            return (
              <g
                key={k}
                onClick={() => setSelected(k)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x - labelWidth / 2}
                  y={y - 13}
                  width={labelWidth}
                  height={26}
                  rx={13}
                  fill={NODE_FILL[n.style]}
                  fillOpacity={isSelected ? 1 : 0.55}
                  stroke={isSelected ? "#ffffff" : "transparent"}
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="600"
                  style={{ pointerEvents: "none" }}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="border-t border-gray-800 p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1">
          {node.category}
        </p>
        <h3 className="text-lg font-bold text-white mb-3">{node.label}</h3>

        <div className="space-y-2">
          {node.fields.map((f) => {
            const fieldKey = `${selected}:${f.name}`;
            const isCopied = copiedKey === fieldKey;
            return (
              <div
                key={f.name}
                className="flex flex-col sm:flex-row sm:gap-4 sm:items-start"
              >
                <span className="text-gray-500 text-[10px] uppercase tracking-wider sm:w-32 sm:text-right pt-1 shrink-0">
                  {f.name}
                </span>
                <div className="flex flex-1 items-start gap-2 min-w-0">
                  <span
                    className={`flex-1 text-sm text-white min-w-0 ${
                      f.mono ? "font-mono break-all" : "leading-6"
                    }`}
                  >
                    {f.render ?? f.value}
                  </span>
                  {f.mono && (
                    <button
                      onClick={() => copyValue(fieldKey, f.value)}
                      title={isCopied ? "Copied" : "Copy"}
                      aria-label={isCopied ? "Copied" : "Copy value"}
                      className="shrink-0 rounded-md bg-gray-800 hover:bg-gray-700 p-1.5 text-gray-300 transition"
                    >
                      {isCopied ? (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 0 1 .006 1.414l-8.01 8.08a1 1 0 0 1-1.421.002l-3.99-3.99a1 1 0 1 1 1.414-1.415l3.28 3.28 7.304-7.37a1 1 0 0 1 1.417-.001Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M7 3a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7Zm6 10V8a2 2 0 0 0-2-2H7V5h7v8h-1Zm-9-5h7v7H4V8Z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {node.scriptTokens && node.scriptTokens.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
              Script
            </p>
            <div className="bg-black/60 border border-gray-800 rounded-lg p-3 font-mono text-xs leading-6 overflow-x-auto">
              {renderScriptTokens(node.scriptTokens)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderScriptTokens(tokens: ScriptToken[]) {
  const lines: { op: string; data?: string }[] = [];
  for (const t of tokens) {
    if (t.type === "opcode") {
      lines.push({ op: t.name });
    } else {
      const len = t.hex.length / 2;
      lines.push({ op: `OP_PUSHBYTES_${len}`, data: t.hex });
    }
  }

  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-wrap gap-x-3">
          <span
            className={
              line.data ? "text-orange-400" : "text-red-400"
            }
          >
            {line.op}
          </span>
          {line.data && (
            <span className="text-gray-300 break-all">{line.data}</span>
          )}
        </div>
      ))}
    </div>
  );
}
