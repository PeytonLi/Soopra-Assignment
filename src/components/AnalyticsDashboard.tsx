"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Database, MessageSquare, ShoppingBag, ShieldAlert } from "lucide-react";

type Summary = {
  configured: boolean;
  totalEvents: number;
  chatEvents: number;
  orderSummaries: number;
  allergyFilterUses: number;
  topCategories: Array<{ category: string; count: number }>;
  recentEvents: Array<{ type: string; createdAt: string }>;
  error?: string;
};

const emptySummary: Summary = {
  configured: false,
  totalEvents: 0,
  chatEvents: 0,
  orderSummaries: 0,
  allergyFilterUses: 0,
  topCategories: [],
  recentEvents: [],
};

export function AnalyticsDashboard() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/analytics/summary")
      .then((response) => response.json())
      .then((data: Summary) => {
        if (mounted) setSummary({ ...emptySummary, ...data });
      })
      .catch(() => {
        if (mounted) setSummary({ ...emptySummary, error: "Unable to load analytics." });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="page-shell dashboard-shell">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Back
      </Link>
      <section className="dashboard-header">
        <div className="section-title">
          <BarChart3 size={22} />
          <h1>Analytics</h1>
        </div>
        <span className={summary.configured ? "status-chip online" : "status-chip"}>
          <Database size={15} />
          {summary.configured ? "Supabase connected" : "Local fallback"}
        </span>
      </section>

      <section className="metric-grid" aria-live="polite">
        <Metric icon={<BarChart3 size={20} />} label="Events" value={loading ? "-" : summary.totalEvents} />
        <Metric icon={<MessageSquare size={20} />} label="Chats" value={loading ? "-" : summary.chatEvents} />
        <Metric icon={<ShoppingBag size={20} />} label="Orders" value={loading ? "-" : summary.orderSummaries} />
        <Metric icon={<ShieldAlert size={20} />} label="Allergy filters" value={loading ? "-" : summary.allergyFilterUses} />
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-panel">
          <h2>Top categories</h2>
          {summary.topCategories.length ? (
            <ul className="compact-list">
              {summary.topCategories.map((item) => (
                <li key={item.category}>
                  <span>{item.category}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">No category events yet.</p>
          )}
        </div>
        <div className="dashboard-panel">
          <h2>Recent events</h2>
          {summary.recentEvents.length ? (
            <ul className="compact-list">
              {summary.recentEvents.map((event, index) => (
                <li key={`${event.createdAt}-${index}`}>
                  <span>{event.type}</span>
                  <time>{new Date(event.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">No events recorded.</p>
          )}
        </div>
      </section>
      {summary.error ? <p className="error-text">{summary.error}</p> : null}
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric-tile">
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
