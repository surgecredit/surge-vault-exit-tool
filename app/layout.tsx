import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Surge Vault Sovereign Recovery Tool",
  description:
    "Recover BTC from a Surge vault independently using the Taproot timelock exit path. A self-custodial recovery tool that works without Surge backend services.",
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
