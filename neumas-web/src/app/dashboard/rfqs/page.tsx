"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";

import { listRfqs } from "@/lib/api/endpoints";
import type { RfqRecord } from "@/lib/api/types";

export default function RfqsPage() {
  const [rows, setRows] = useState<RfqRecord[]>([]);
  const [filter, setFilter] = useState("ALL");
  useEffect(() => { void listRfqs().then(setRows); }, []);
  const data = useMemo(() => filter === "ALL" ? rows : rows.filter((row) => row.status === filter), [filter, rows]);
  const columns = useMemo<ColumnDef<RfqRecord>[]>(() => [
    { accessorKey: "title", header: "Requirement", cell: ({ row }) => <Link href={`/dashboard/rfqs/${row.original.id}`} className="font-semibold text-sky-700">{row.original.title}</Link> },
    { accessorKey: "status", header: "Status" }, { id: "suppliers", header: "Suppliers", cell: ({ row }) => row.original.invitations.length },
    { id: "offers", header: "Offers", cell: ({ row }) => row.original.offers.length }, { accessorKey: "required_by", header: "Required by", cell: ({ getValue }) => String(getValue() ?? "N/A") },
  ], []);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-sky-700">Exchange</p><h1 className="mt-1 text-2xl font-semibold">Requests for quote</h1></header><div className="flex gap-2 overflow-x-auto">{["ALL", "OPEN", "QUOTING", "NEGOTIATING", "SELECTED", "CLOSED"].map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === status ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{status}</button>)}</div><section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} className="px-4 py-3">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody className="divide-y divide-slate-100">{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-4 py-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table>{!data.length ? <p className="p-8 text-center text-sm text-slate-500">No RFQs match this view.</p> : null}</section></div></main>;
}
