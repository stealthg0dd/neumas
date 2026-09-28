"use client";

import { useEffect, useMemo, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { listSupplierOffers } from "@/lib/api/endpoints";

type OfferRow = { id: string; status: string; current_version: number };

export default function SupplierOffersPage() {
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void listSupplierOffers()
      .then((data) =>
        setRows(
          data.map((row) => ({
            id: String(row.id ?? ""),
            status: String(row.status ?? ""),
            current_version: Number(row.current_version ?? 1),
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const columns = useMemo<ColumnDef<OfferRow>[]>(
    () => [
      { accessorKey: "id", header: "Offer", cell: ({ getValue }) => String(getValue()).slice(0, 8) },
      { accessorKey: "status", header: "Status" },
      { accessorKey: "current_version", header: "Version" },
    ],
    [],
  );
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Commercial</p>
        <h1 className="mt-1 text-2xl font-semibold">Offers</h1>
      </header>
      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="h-40 animate-pulse bg-slate-50" /> : (
          <table className="w-full min-w-[520px] text-left text-sm">
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
        {!loading && !rows.length ? <p className="p-8 text-center text-sm text-slate-500">No offers submitted yet.</p> : null}
      </section>
    </div>
  );
}
