"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Trash2, RefreshCw, Download,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, Edit2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem,
} from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";
import type { InventoryItem, InventoryItemCreate, InventoryItemUpdate } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60_000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30)  return `${days}d ago`;
    return (iso ?? "").slice(0, 10);
  } catch {
    return (iso ?? "").slice(0, 10);
  }
}

// ── Stock status badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  switch (status) {
    case "out_of_stock": return (
      <span className="badge-red" style={{ boxShadow: "0 0 8px oklch(0.63 0.25 29 / 0.35)" }}>
        Out of stock
      </span>
    );
    case "low_stock":  return <span className="badge-amber">Low stock</span>;
    case "overstocked": return <span className="badge-purple">Overstocked</span>;
    default:            return <span className="badge-mint">In stock</span>;
  }
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc")  return <ChevronUp   className="w-3 h-3 ml-1 inline text-cyan-400" />;
  if (dir === "desc") return <ChevronDown className="w-3 h-3 ml-1 inline text-cyan-400" />;
  return <ChevronsUpDown className="w-3 h-3 ml-1 inline text-muted-foreground/40" />;
}

// ── Inline editable cell ──────────────────────────────────────────────────────

function EditableCell({
  value: init,
  onSave,
  type = "text",
}: {
  value: string | number;
  onSave: (v: string) => void;
  type?: "text" | "number";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(init));
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== String(init)) onSave(draft);
  }

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:text-cyan-400 transition-colors group/cell flex items-center gap-1"
        onDoubleClick={() => setEditing(true)}
      >
        {String(init)}
        <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-40 transition-opacity" />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        onBlur={commit}
        className="w-full bg-surface-2 border border-cyan-500/50 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-cyan-500/40"
      />
    </span>
  );
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

interface ItemFormData {
  name:          string;
  unit:          string;
  quantity:      number;
  min_quantity:  number;
  cost_per_unit: number | "";
}

function ItemModal({
  open,
  onClose,
  onSave,
  initial,
  loading,
}: {
  open:     boolean;
  onClose:  () => void;
  onSave:   (d: ItemFormData) => Promise<void>;
  initial?: Partial<ItemFormData>;
  loading:  boolean;
}) {
  const [form, setForm] = useState<ItemFormData>({
    name:          initial?.name          ?? "",
    unit:          initial?.unit          ?? "kg",
    quantity:      initial?.quantity      ?? 0,
    min_quantity:  initial?.min_quantity  ?? 0,
    cost_per_unit: initial?.cost_per_unit ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name:          initial?.name          ?? "",
        unit:          initial?.unit          ?? "kg",
        quantity:      initial?.quantity      ?? 0,
        min_quantity:  initial?.min_quantity  ?? 0,
        cost_per_unit: initial?.cost_per_unit ?? "",
      });
    }
  }, [open, initial?.name, initial?.unit, initial?.quantity, initial?.min_quantity, initial?.cost_per_unit]);

  const field = (key: keyof ItemFormData) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.type === "number" ? Number(e.target.value) : e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-heavy border-border/50 max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial?.name ? "Edit item" : "Add inventory item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Item name *</label>
            <Input placeholder="e.g. Olive Oil" className="field-input-dark" {...field("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Unit</label>
              <Input placeholder="kg, L, pcs…" className="field-input-dark" {...field("unit")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Quantity</label>
              <Input type="number" min={0} className="field-input-dark" {...field("quantity")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Min qty (par)</label>
              <Input type="number" min={0} className="field-input-dark" {...field("min_quantity")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cost / unit ($)</label>
              <Input type="number" min={0} step="0.01" placeholder="0.00" className="field-input-dark" {...field("cost_per_unit")} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-border/50">
            Cancel
          </Button>
          <Button
            disabled={!form.name.trim() || loading}
            onClick={() => onSave(form)}
            className="gradient-primary text-white hover:opacity-90"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </span>
            ) : initial?.name ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({
  open,
  name,
  onClose,
  onConfirm,
  loading,
}: {
  open:      boolean;
  name:      string;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
  loading:   boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-heavy border-border/50 max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete item?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          This will permanently delete <span className="font-semibold text-foreground">{name}</span>.
          This cannot be undone.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-border/50">Cancel</Button>
          <Button
            disabled={loading}
            onClick={onConfirm}
            className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
          >
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(items: InventoryItem[]) {
  const header = ["Name", "Category", "Quantity", "Unit", "Min Qty", "Cost/Unit", "Status", "Last Updated"].join(",");
  const rows = items.map((i) => [
    `"${i.name}"`,
    `"${i.category?.name ?? ""}"`,
    i.quantity,
    `"${i.unit}"`,
    i.min_quantity,
    i.cost_per_unit ?? "",
    i.stock_status ?? "",
    (i.updated_at ?? "").slice(0, 10),
  ].join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const propertyId = useAuthStore((s) => s.propertyId);

  const [items,        setItems]        = useState<InventoryItem[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const [sorting,      setSorting]      = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [addOpen,      setAddOpen]      = useState(false);
  const [editItem,     setEditItem]     = useState<InventoryItem | null>(null);
  const [deleteItem,   setDeleteItem]   = useState<InventoryItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await listInventory({ limit: 200 });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      toast.error("Failed to load inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── Optimistic inline edit ─────────────────────────────────────────────────

  async function handleInlineEdit(id: string, patch: InventoryItemUpdate) {
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i));
    try {
      await updateInventoryItem(id, patch);
    } catch {
      toast.error("Failed to update item.");
      fetchItems(true); // rollback
    }
  }

  // ── Add ────────────────────────────────────────────────────────────────────

  async function handleAdd(data: { name: string; unit: string; quantity: number; min_quantity: number; cost_per_unit: number | "" }): Promise<void> {
    if (!propertyId) { toast.error("No property selected."); return; }
    setModalLoading(true);
    try {
      const payload: InventoryItemCreate = {
        property_id:  propertyId,
        name:         data.name,
        unit:         data.unit,
        quantity:     data.quantity,
        min_quantity: data.min_quantity,
        ...(data.cost_per_unit !== "" && { cost_per_unit: data.cost_per_unit }),
      };
      const created = await createInventoryItem(payload);
      setItems((prev) => [created, ...prev]);
      setTotal((t) => t + 1);
      setAddOpen(false);
      toast.success(`"${created.name}" added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item.");
    } finally {
      setModalLoading(false);
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  async function handleEdit(data: { name: string; unit: string; quantity: number; min_quantity: number; cost_per_unit: number | "" }) {
    if (!editItem) return;
    setModalLoading(true);
    try {
      const patch: InventoryItemUpdate = {
        name:         data.name,
        unit:         data.unit,
        min_quantity: data.min_quantity,
        ...(data.cost_per_unit !== "" && { cost_per_unit: data.cost_per_unit }),
      };
      const updated = await updateInventoryItem(editItem.id, patch);
      setItems((prev) => prev.map((i) => i.id === editItem.id ? updated : i));
      setEditItem(null);
      toast.success("Item updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      setModalLoading(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteItem) return;
    setModalLoading(true);
    try {
      await deleteInventoryItem(deleteItem.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteItem.id));
      setTotal((t) => t - 1);
      setDeleteItem(null);
      toast.success(`"${deleteItem.name}" deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setModalLoading(false);
    }
  }

  // ── Bulk delete ────────────────────────────────────────────────────────────

  async function handleBulkDelete() {
    const ids = Object.keys(rowSelection);
    if (!ids.length) return;
    const confirmed = window.confirm(`Delete ${ids.length} selected items?`);
    if (!confirmed) return;
    try {
      await Promise.all(ids.map((id) => deleteInventoryItem(id)));
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      setTotal((t) => t - ids.length);
      setRowSelection({});
      toast.success(`${ids.length} items deleted.`);
    } catch {
      toast.error("Bulk delete partially failed.");
      fetchItems(true);
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<InventoryItem>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="accent-cyan-500"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="accent-cyan-500"
        />
      ),
      size: 40,
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: "Item",
      cell: ({ row }) => (
        <EditableCell
          value={row.original.name}
          onSave={(v) => handleInlineEdit(row.original.id, { name: v })}
        />
      ),
    },
    {
      accessorFn: (r) => r.category?.name ?? "—",
      id: "category",
      header: "Category",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Qty",
      cell: ({ row }) => (
        <EditableCell
          value={row.original.quantity}
          type="number"
          onSave={(v) => handleInlineEdit(row.original.id, { })}  // quantity adjust needs separate endpoint
        />
      ),
    },
    {
      accessorKey: "unit",
      header: "Unit",
      cell: ({ row }) => (
        <EditableCell
          value={row.original.unit}
          onSave={(v) => handleInlineEdit(row.original.id, { unit: v })}
        />
      ),
    },
    {
      accessorKey: "updated_at",
      header: "Last updated",
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">
          {relativeTime(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "stock_status",
      header: "Status",
      cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button
            onClick={() => setEditItem(row.original)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeleteItem(row.original)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [items]);

  // ── Table instance ─────────────────────────────────────────────────────────

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel:      getCoreRowModel(),
    getSortedRowModel:    getSortedRowModel(),
    getFilteredRowModel:  getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    getRowId: (row) => row.id,
  });

  const selectedCount = Object.keys(rowSelection).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} items tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchItems(true)}
            disabled={refreshing}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
            title="Refresh"
          >
            <RefreshCw className={["w-4 h-4", refreshing ? "animate-spin" : ""].join(" ")} />
          </button>
          <button
            onClick={() => exportCSV(items)}
            className="flex items-center gap-2 px-3 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 border border-border/40 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-3 h-9 rounded-lg text-sm gradient-primary text-white font-semibold hover:opacity-90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add item
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search items…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-1 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
        </div>

        {/* Bulk delete */}
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 h-9 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {selectedCount}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Head */}
            <thead className="glass-heavy border-b border-border/40">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <span
                          className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon dir={header.column.getIsSorted()} />
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-border/20">
                    {columns.map((_, ci) => (
                      <td key={ci} className="px-4 py-3">
                        <div className="h-4 rounded shimmer w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    {globalFilter ? "No items match your search." : "No inventory items yet."}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, ri) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(ri * 0.015, 0.3) }}
                    className={[
                      "group/row border-b border-border/20 hover:bg-surface-1/60 transition-colors",
                      ri % 2 === 1 ? "bg-surface-1/20" : "",
                      row.getIsSelected() ? "bg-cyan-500/5" : "",
                    ].join(" ")}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-sm text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && table.getPageCount() > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 text-xs text-muted-foreground">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ·{" "}
              {table.getFilteredRowModel().rows.length} items
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-1.5 rounded hover:bg-surface-2 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-1.5 rounded hover:bg-surface-2 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        loading={modalLoading}
      />
      <ItemModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={handleEdit}
        initial={editItem ? {
          name:          editItem.name,
          unit:          editItem.unit,
          quantity:      editItem.quantity,
          min_quantity:  editItem.min_quantity,
          cost_per_unit: editItem.cost_per_unit ?? "",
        } : undefined}
        loading={modalLoading}
      />
      <DeleteModal
        open={!!deleteItem}
        name={deleteItem?.name ?? ""}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={modalLoading}
      />
    </div>
  );
}
