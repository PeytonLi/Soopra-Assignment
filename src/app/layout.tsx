import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sweetgreen Berkeley AI Pickup Assistant",
  description: "AI-powered menu, nutrition, allergy, and pickup assistant for Sweetgreen Berkeley.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav className="top-nav" aria-label="Primary navigation">
          <Link href="/" className="brand-lockup">
            <span className="brand-mark">sg</span>
            <span>Sweetgreen Berkeley Assistant</span>
          </Link>
          <div className="nav-links">
            <Link href="/qr">QR</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
