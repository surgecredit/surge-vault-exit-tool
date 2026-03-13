import type { Metadata } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/config";

export const metadata: Metadata = {
  title: "Surge Vault Sovereign Tool",
  description: `Taproot script-path exit tool on Bitcoin ${APP_CONFIG.mainnet ? "Mainnet" : "Signet"}`,
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
