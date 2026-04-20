import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Surge Taproot Vault Sovereign Recovery Tool",
  description:
    "Recover BTC from your Surge Taproot Vault independently using the timelock exit path. Non-custodial, on-chain, verifiable — works without Surge backend services.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 antialiased">{children}</body>
    </html>
  );
}
