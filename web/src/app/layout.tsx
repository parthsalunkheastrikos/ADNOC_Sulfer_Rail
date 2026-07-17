import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ProAI-SLO Console",
  description:
    "ProAI Closed-Loop Sulfur Loading Optimization Platform — Operator HMI & Analytics Suite (Phase A advisory pilot)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`h-full antialiased ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="flex h-dvh flex-col overflow-hidden bg-bg-base text-ink-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
