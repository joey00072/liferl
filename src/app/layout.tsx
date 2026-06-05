import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";

export const metadata: Metadata = {
  title: "LifeRL",
  description: "Markdown-backed daily habit dashboard.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
