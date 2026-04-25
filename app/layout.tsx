import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Surge Taproot Vault Sovereign Recovery Tool",
  description:
    "Self-custodial recovery tool for Surge Taproot Vaults. Inspect UTXOs, verify exit eligibility, and construct, sign, and broadcast exit transactions.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Surge Taproot Vault Sovereign Recovery Tool",
    description:
      "Inspect vault UTXOs and recover BTC through the Taproot exit path with wallet signing and on-chain broadcast.",
    images: ["/surge_logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Surge Taproot Vault Sovereign Recovery Tool",
    description:
      "Inspect vault UTXOs and recover BTC through the Taproot exit path with wallet signing and on-chain broadcast.",
    images: ["/surge_logo.png"],
  },
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
