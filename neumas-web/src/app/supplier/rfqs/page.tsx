"use client";

import { useEffect, useMemo, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { listSupplierRfqs } from "@/lib/api/endpoints";

type RfqRow = {
  id: string;
  status: string;
  title: string;
  invited_at: string;
};

export default function SupplierRfqsPage() {
  const [rows, setRows] = useState<RfqRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listSupplierRfqs()
      .then((data) =>
        setRows(
          data.map((row) => {
            const rfq = (row.rfq as Record<string, unknown> | undefined) ?? {};
            return {
              id: String(row.id ?? ""),
              status: String(row.status ?? "INVITED"),
              title: String(rfq.title ?? "RFQ"),
              invited_at: String(row.invited_at ?? "—"),
            };
          }),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo<ColumnDef<RfqRow>[]>(
    () => [
      { accessorKey: "title", header: "RFQ" },
      { accessorKey: "status", header: "Invitation" },
      { accessorKey: "invited_at", header: "Invited" },
    ],
    [],
  );
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Commercial</p>
        <h1 className="mt-1 text-2xl font-semibold">RFQs</h1>
        <p className="mt-2 text-sm text-slate-600">Invitations for your vendor only.</p>
      </header>
      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="h-40 animate-pulse bg-slate-50" /> : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>{group.headers.map((header) => <th key={header.id} className="px-4 py-3">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !rows.length ? <p className="p-8 text-center text-sm text-slate-500">No RFQs invited yet.</p> : null}
      </section>
    </div>
  );
}
