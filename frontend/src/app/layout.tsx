import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "LeadGen Intelligence | Autonomous B2B Platform",
  description: "Local-first autonomous B2B lead discovery and deterministic qualification platform.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-slate-100 antialiased min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
