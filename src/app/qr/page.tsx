import { QrAccess } from "@/components/QrAccess";

export default function QrPage() {
  return <QrAccess appUrl={process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"} />;
}
