import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import Link from "next/link";

import { MotionProvider } from "@/components/MotionProvider";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

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
      <body className={`${manrope.variable} ${newsreader.variable}`}>
        <MotionProvider>
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
        </MotionProvider>
      </body>
    </html>
  );
}
