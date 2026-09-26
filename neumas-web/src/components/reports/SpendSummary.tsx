import React, { useEffect, useState } from "react";
import Link from "next/link";
import { listDocuments, type Document } from "@/lib/api/endpoints";

export default function SpendSummary() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const resp = await listDocuments({ page_size: 100 });
        setDocs(resp.documents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load document spend.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Aggregate spend by vendor and category
  const spendByVendor: Record<string, number> = {};
  const spendByCategory: Record<string, number> = {};
  docs.forEach((doc) => {
    if (!doc.line_items) return;
    doc.line_items.forEach((li) => {
      const vendor = doc.raw_vendor_name || "Unknown";
      spendByVendor[vendor] = (spendByVendor[vendor] || 0) + (li.raw_total || 0);
      const cat = li.normalized_name || li.raw_name || "Uncategorized";
      spendByCategory[cat] = (spendByCategory[cat] || 0) + (li.raw_total || 0);
    });
  });
  const hasSpend = Object.keys(spendByVendor).length > 0 || Object.keys(spendByCategory).length > 0;

  return (
    <div className="mt-8 grid md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900">Spend by Vendor</h3>
        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : !hasSpend ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-900">No supplier invoices yet.</p>
            <p className="mt-1">Upload an invoice or connect Xero to build vendor spend.</p>
            <Link href="/dashboard/scans/new" className="mt-3 inline-flex text-sm font-semibold text-[#0071a3]">
              Upload invoice
            </Link>
          </div>
        ) : (
          <ul className="space-y-1">
            {Object.entries(spendByVendor)
              .sort((a, b) => b[1] - a[1])
              .map(([vendor, total]) => (
                <li key={vendor} className="flex justify-between text-sm">
                  <span>{vendor}</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900">Spend by Category</h3>
        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : !hasSpend ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-900">No category spend yet.</p>
            <p className="mt-1">Approved invoice line items are needed for category spend.</p>
            <Link href="/dashboard/documents" className="mt-3 inline-flex text-sm font-semibold text-[#0071a3]">
              Review documents
            </Link>
          </div>
        ) : (
          <ul className="space-y-1">
            {Object.entries(spendByCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => (
                <li key={cat} className="flex justify-between text-sm">
                  <span>{cat}</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
