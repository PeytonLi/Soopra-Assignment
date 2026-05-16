"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, QrCode } from "lucide-react";
import { motion } from "motion/react";

export function QrAccess({ appUrl }: { appUrl: string }) {
  return (
    <main className="page-shell narrow-shell">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Back
      </Link>
      <motion.section
        className="qr-panel"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="section-title">
          <QrCode size={22} />
          <h1>QR Access</h1>
        </div>
        <div className="qr-box" aria-label="QR code linking to the assistant">
          <QRCodeSVG value={appUrl} size={224} marginSize={2} level="M" />
        </div>
        <a href={appUrl} className="url-pill">
          {appUrl}
        </a>
      </motion.section>
    </main>
  );
}
