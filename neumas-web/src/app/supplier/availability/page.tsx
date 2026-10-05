"use client";

import { useEffect, useMemo, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { listSupplierAvailability } from "@/lib/api/endpoints";

type AvailabilityRow = {
  id: string;
  status: string;
  quantity_available: number | null;
  lead_time_days: number;
  notes: string | null;
};

export default function SupplierAvailabilityPage() {
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listSupplierAvailability()
      .then((data) =>
        setRows(
          data.map((row) => ({
            id: String(row.id ?? ""),
            status: String(row.status ?? "unknown"),
            quantity_available: row.quantity_available == null ? null : Number(row.quantity_available),
            lead_time_days: Number(row.lead_time_days ?? 0),
            notes: row.notes == null ? null : String(row.notes),
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo<ColumnDef<AvailabilityRow>[]>(
    () => [
      { accessorKey: "status", header: "Status" },
      {
        accessorKey: "quantity_available",
        header: "Qty",
        cell: ({ getValue }) => String(getValue() ?? "—"),
      },
      { accessorKey: "lead_time_days", header: "Lead time (d)" },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ getValue }) => String(getValue() ?? "—"),
      },
    ],
    [],
  );
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase text-sky-700">Operations</p>
        <h1 className="mt-1 text-2xl font-semibold">Availability</h1>
        <p className="mt-2 text-sm text-slate-600">Your SKU availability only — org-scoped via RLS.</p>
      </header>
      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="h-40 animate-pulse bg-slate-50" />
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !rows.length ? <p className="p-8 text-center text-sm text-slate-500">No availability rows yet.</p> : null}
      </section>
    </div>
  );
}
