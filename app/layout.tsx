import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Surge Unilateral Exit Tool",
  description:
    "Self-custodial exit tool for Surge Taproot Vaults. Inspect UTXOs, verify exit eligibility, and construct, sign, and broadcast exit transactions.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Surge Unilateral Exit Tool",
    description:
      "Inspect vault UTXOs and exit BTC through the Taproot exit path with wallet signing and on-chain broadcast.",
    images: ["/surge_logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Surge Unilateral Exit Tool",
    description:
      "Inspect vault UTXOs and exit BTC through the Taproot exit path with wallet signing and on-chain broadcast.",
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
