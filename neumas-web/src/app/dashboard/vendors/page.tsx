"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2 } from "lucide-react";
import {
  getVendorAlerts,
  getVendorSpend,
  listCatalogItems,
  listVendors,
  type Vendor,
} from "@/lib/api/endpoints";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageState";
import { captureUIError } from "@/lib/analytics";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [catalogItems, setCatalogItems] = useState<Record<string, unknown>[]>([]);
  const [tab, setTab] = useState<"vendors" | "catalog">("vendors");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [spendSummary, setSpendSummary] = useState<Record<string, { total_spend: number; count: number }>>({});
  const [priceAlerts, setPriceAlerts] = useState<Array<{ item_name: string; vendor_name: string; old_price: number; new_price: number }>>([]);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await listVendors({ page_size: 50 });
      setVendors(resp.vendors);
      const [spendResp, alertsResp] = await Promise.all([
        getVendorSpend({ days: 90 }).catch(() => ({ vendors: [] })),
        getVendorAlerts({ days: 30 }).catch(() => ({ alerts: [] })),
      ]);
      setSpendSummary(
        Object.fromEntries(
          (spendResp.vendors || []).map((row) => [
            row.vendor_name,
            { total_spend: row.total_spend, count: row.count },
          ])
        )
      );
      setPriceAlerts(
        (alertsResp.alerts || []).map((row) => ({
          item_name: row.item_name,
          vendor_name: row.vendor_name,
          old_price: row.old_price,
          new_price: row.new_price,
        }))
      );
    } catch (err) {
      setError("We couldn't load vendors.");
      captureUIError("load_vendors", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await listCatalogItems({ q: query || undefined, page_size: 50 });
      setCatalogItems(resp.items);
    } catch (err) {
      setError("We couldn't load the vendor catalog.");
      captureUIError("load_vendor_catalog", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "vendors") loadVendors();
  }, [tab, loadVendors]);

  useEffect(() => {
    if (tab === "catalog") {
      const id = setTimeout(() => loadCatalog(searchQuery), 300);
      return () => clearTimeout(id);
    }
  }, [searchQuery, tab, loadCatalog]);

  const filteredVendors = vendors.filter(
    (v) =>
      !searchQuery ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.contact_name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-gray-900 font-semibold text-lg">Vendors</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {(["vendors", "catalog"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "catalog" ? "Price Catalog" : "Vendors"}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder={tab === "vendors" ? "Search vendors…" : "Search catalog items…"}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
      />

      {/* Content */}
      {loading ? (
        <PageLoadingState
          title={tab === "vendors" ? "Loading vendors" : "Loading catalog"}
          message={
            tab === "vendors"
              ? "Fetching supplier contacts and vendor details."
              : "Fetching vendor catalog items and pricing."
          }
        />
      ) : error ? (
        <PageErrorState
          title={tab === "vendors" ? "Vendors unavailable" : "Catalog unavailable"}
          message={error}
          onRetry={() => {
            if (tab === "vendors") void loadVendors();
            else void loadCatalog();
          }}
        />
      ) : tab === "vendors" ? (
        !filteredVendors.length ? (
          <EmptyState
            icon={Building2}
            badge="No vendors yet"
            headline="Vendors are auto-detected from invoices"
            body="Upload your first supplier invoice or delivery note and Neumas will automatically identify and track every vendor you work with."
            cta={{ label: "Upload an invoice", href: "/dashboard/scans/new" }}
          />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Tracked vendors</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{vendors.length}</p>
                <p className="mt-1 text-xs text-gray-500">Auto-linked from approved purchase evidence.</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Spend anomalies</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{priceAlerts.length}</p>
                <p className="mt-1 text-xs text-gray-500">Only meaningful price changes with enough history are shown.</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Pending mappings</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {Math.max(0, vendors.filter((vendor) => !spendSummary[vendor.name]).length)}
                </p>
                <p className="mt-1 text-xs text-gray-500">Suppliers still learning from recent invoices.</p>
              </div>
            </div>
            {filteredVendors.map((vendor) => (
              <div
                key={vendor.id}
                className="border border-gray-100 rounded-xl bg-white p-4 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{vendor.name}</p>
                    {!vendor.is_active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  {vendor.contact_name && (
                    <p className="text-sm text-gray-600 mt-0.5">{vendor.contact_name}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1">
                    {vendor.contact_email && (
                      <a
                        href={`mailto:${vendor.contact_email}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {vendor.contact_email}
                      </a>
                    )}
                    {vendor.phone && (
                      <span className="text-xs text-gray-500">{vendor.phone}</span>
                    )}
                  </div>
                  {vendor.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">{vendor.notes}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1">
                      Spend {spendSummary[vendor.name] ? `$${spendSummary[vendor.name].total_spend.toFixed(2)}` : "Still learning"}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1">
                      Purchases {spendSummary[vendor.name]?.count ?? 0}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1">
                      {priceAlerts.some((alert) => alert.vendor_name === vendor.name)
                        ? "Price movement detected"
                        : "No major variance"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(vendor.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
            {priceAlerts.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="text-sm font-medium text-gray-900">Recent price changes</p>
                <div className="mt-3 space-y-2">
                  {priceAlerts.slice(0, 4).map((alert, index) => (
                    <div key={`${alert.vendor_name}-${alert.item_name}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                      <div>
                        <p className="text-sm text-gray-900">{alert.item_name}</p>
                        <p className="text-xs text-gray-500">{alert.vendor_name}</p>
                      </div>
                      <p className="text-xs text-gray-600">
                        {`$${alert.old_price.toFixed(2)} -> $${alert.new_price.toFixed(2)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        // Catalog tab
        !catalogItems.length ? (
          <EmptyState
            icon={Building2}
            headline="No catalog items yet"
            body="Your product catalog is built automatically from uploaded invoices and delivery notes."
            cta={{ label: "Upload a document", href: "/dashboard/scans/new" }}
          />
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 font-medium text-gray-700">Item</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Category</th>
                  <th className="px-4 py-3 font-medium text-gray-700">Unit</th>
                  <th className="px-4 py-3 font-medium text-gray-700 text-right">Last Price</th>
                </tr>
              </thead>
              <tbody>
                {catalogItems.map((item, idx) => (
                  <tr key={String(item.id ?? idx)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {String(item.name ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {String(item.category ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {String(item.unit ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {item.last_price != null
                        ? `$${Number(item.last_price).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </motion.div>
  );
}
