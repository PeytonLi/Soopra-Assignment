"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, QrCode } from "lucide-react";

export function QrAccess({ appUrl }: { appUrl: string }) {
  return (
    <main className="page-shell narrow-shell">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Back
      </Link>
      <section className="qr-panel">
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
      </section>
    </main>
  );
}
