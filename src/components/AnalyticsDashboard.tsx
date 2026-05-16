"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Database, MessageSquare, ShoppingBag, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";

type Summary = {
  configured: boolean;
  setupRequired?: boolean;
  missingTables?: string[];
  totalEvents: number;
  chatEvents: number;
  orderSummaries: number;
  savedOrders: number;
  allergyFilterUses: number;
  topCategories: Array<{ category: string; count: number }>;
  recentEvents: Array<{ type: string; createdAt: string }>;
  recentOrders: Array<{
    id: string;
    createdAt: string;
    customerName: string;
    pickupTime: string;
    status: string;
    itemCount: number;
    items: string[];
  }>;
  error?: string;
};

const emptySummary: Summary = {
  configured: false,
  totalEvents: 0,
  chatEvents: 0,
  orderSummaries: 0,
  savedOrders: 0,
  allergyFilterUses: 0,
  topCategories: [],
  recentEvents: [],
  recentOrders: [],
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
      <motion.section
        className="dashboard-header"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="section-title">
          <BarChart3 size={22} />
          <h1>Analytics</h1>
        </div>
        <span className={summary.configured ? "status-chip online" : "status-chip"}>
          <Database size={15} />
          {summary.configured ? (summary.setupRequired ? "Schema setup needed" : "Supabase connected") : "Local fallback"}
        </span>
      </motion.section>

      {summary.setupRequired ? (
        <section className="setup-alert" role="status">
          <strong>Supabase is connected, but the database schema is missing.</strong>
          <span>
            Run <code>supabase/schema.sql</code> in the Supabase SQL editor. Missing tables:{" "}
            {(summary.missingTables ?? []).join(", ") || "assistant_events, pickup_orders"}.
          </span>
        </section>
      ) : null}

      <section className="metric-grid" aria-live="polite">
        <Metric icon={<BarChart3 size={20} />} label="Events" value={loading ? "-" : summary.totalEvents} />
        <Metric icon={<MessageSquare size={20} />} label="Chats" value={loading ? "-" : summary.chatEvents} />
        <Metric icon={<ShoppingBag size={20} />} label="Saved orders" value={loading ? "-" : summary.savedOrders} />
        <Metric icon={<ShieldAlert size={20} />} label="Allergy filters" value={loading ? "-" : summary.allergyFilterUses} />
      </section>

      <section className="dashboard-grid">
        <motion.div
          className="dashboard-panel order-queue-panel"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.34 }}
        >
          <h2>Pickup order queue</h2>
          {summary.recentOrders.length ? (
            <ul className="order-list">
              {summary.recentOrders.map((order) => (
                <li key={order.id}>
                  <div>
                    <strong>{order.customerName}</strong>
                    <span>
                      {order.pickupTime} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} · {order.status}
                    </span>
                    <small>{order.items.join(", ")}</small>
                  </div>
                  <code>{order.id.slice(0, 8)}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">No saved pickup orders yet.</p>
          )}
        </motion.div>
        <motion.div
          className="dashboard-panel"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.34 }}
        >
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
        </motion.div>
        <motion.div
          className="dashboard-panel"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.34 }}
        >
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
        </motion.div>
      </section>
      {summary.error ? <p className="error-text">{summary.error}</p> : null}
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <motion.div
      className="metric-tile"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3 }}
    >
      <span className="metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  );
}
