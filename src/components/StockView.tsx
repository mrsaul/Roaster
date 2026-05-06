import { useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Loader2, AlertTriangle, Pencil, History, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStockList, useUpdateStock, useStockHistory, useInitStock } from "@/hooks/useStock";
import type { StockListItem, StockHistoryRow } from "@/services/stock";

// ── Relative timestamp with full date on hover ────────────────────────────────

function RelativeTime({ iso }: { iso: string }) {
  try {
    const date = parseISO(iso);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default whitespace-nowrap">
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {format(date, "MMM d, yyyy 'at' h:mm a")}
        </TooltipContent>
      </Tooltip>
    );
  } catch {
    return <span>—</span>;
  }
}

// ── History entry ─────────────────────────────────────────────────────────────

function HistoryEntry({ row }: { row: StockHistoryRow }) {
  const positive = row.delta_kg > 0;
  const sign = positive ? "+" : row.delta_kg < 0 ? "−" : "";
  const absVal = Math.abs(row.delta_kg).toFixed(2);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs text-muted-foreground">
              <RelativeTime iso={row.updated_at} />
            </span>
            {row.updater_name && (
              <span className="text-xs font-medium text-foreground">{row.updater_name}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {row.previous_quantity_kg.toFixed(2)} kg → {row.new_quantity_kg.toFixed(2)} kg
          </p>
          {row.note && (
            <p className="text-xs text-muted-foreground mt-0.5 italic">{row.note}</p>
          )}
          {row.order_reference && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Order #{row.order_reference}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn(
            "text-sm font-semibold tabular-nums",
            positive
              ? "text-green-600 dark:text-green-400"
              : row.delta_kg < 0
                ? "text-destructive"
                : "text-muted-foreground"
          )}>
            {sign}{absVal} kg
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px]",
              row.change_type === "order_delivered"
                ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400"
                : ""
            )}
          >
            {row.change_type === "order_delivered" ? "Order delivered" : "Manual update"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ── Edit popover content ──────────────────────────────────────────────────────

function EditPopover({
  item,
  onClose,
}: {
  item: StockListItem;
  onClose: () => void;
}) {
  const [editQty, setEditQty] = useState(
    item.quantity_kg !== null ? item.quantity_kg.toFixed(2) : "0.00"
  );
  const [editThreshold, setEditThreshold] = useState(
    item.low_stock_threshold_kg !== null ? item.low_stock_threshold_kg.toFixed(2) : "5.00"
  );
  const [editNote, setEditNote] = useState("");
  const updateMutation = useUpdateStock();

  const handleSave = async () => {
    if (!item.id) return;
    const qty = parseFloat(editQty);
    const threshold = parseFloat(editThreshold);
    if (isNaN(qty) || qty < 0 || isNaN(threshold) || threshold < 0) return;
    try {
      await updateMutation.mutateAsync({
        stockId: item.id,
        productName: item.product_name,
        newQuantityKg: qty,
        newThresholdKg: threshold,
        note: editNote,
      });
      onClose();
    } catch {
      // error toast shown by useUpdateStock onError
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          New quantity (kg)
        </label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={editQty}
          onChange={(e) => setEditQty(e.target.value)}
          className="h-8 text-sm"
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Low stock threshold (kg)
        </label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={editThreshold}
          onChange={(e) => setEditThreshold(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Note (optional)
        </label>
        <Input
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          placeholder="e.g. Morning roast batch, 12kg Ethiopia Yirgacheffe"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={updateMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={updateMutation.isPending || !item.id}
          className="gap-1.5"
        >
          {updateMutation.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function StockTableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="h-6 w-14 ml-auto" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="h-4 w-10 ml-auto" />
          </TableCell>
          <TableCell className="text-center">
            <Skeleton className="h-5 w-16 mx-auto rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ── Main StockView ────────────────────────────────────────────────────────────

type Filter = "all" | "low";

export function StockView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyName, setHistoryName] = useState("");

  const { data: stockList = [], isLoading } = useStockList();
  const initMutation = useInitStock();
  const { data: historyRows = [], isLoading: histLoading } = useStockHistory(historyId);

  const totalCount = stockList.length;
  const lowCount = stockList.filter((s) => s.is_low).length;
  const untrackedCount = stockList.filter((s) => s.id === null).length;

  // Client-side filtering
  const displayed = stockList.filter((item) => {
    if (filter === "low" && !item.is_low) return false;
    if (search.trim()) {
      return item.product_name.toLowerCase().includes(search.trim().toLowerCase());
    }
    return true;
  });

  const handleInitAndEdit = async (item: StockListItem) => {
    try {
      await initMutation.mutateAsync({
        productId: item.product_id,
        productName: item.product_name,
      });
      // After invalidation, the item will have an id — open edit via product_id
      // We set editingId to the product_id temporarily; the refreshed list will have the real stock id
      setEditingId(`init:${item.product_id}`);
    } catch {
      // error toast shown by useInitStock onError
    }
  };

  return (
    <TooltipProvider>
      <section className="space-y-6">
        {/* ── Header ── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Roasted stock</h2>
          <p className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? "reference" : "references"}
            {lowCount > 0 && (
              <>
                {" · "}
                <button
                  onClick={() => setFilter(f => f === "low" ? "all" : "low")}
                  className="font-medium text-amber-600 hover:underline transition-colors"
                >
                  {lowCount} low stock
                </button>
              </>
            )}
            {untrackedCount > 0 && (
              <span className="text-muted-foreground"> · {untrackedCount} untracked</span>
            )}
          </p>
        </div>

        {/* ── Search + filter bar ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coffee references…"
              className="pl-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1">
            {(["all", "low"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 min-h-[44px] text-xs font-medium transition-colors",
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
              >
                {f === "all" ? "All" : "Low stock"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Coffee reference</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Stock (kg)</TableHead>
                <TableHead className="text-right">Threshold (kg)</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Last updated by</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <StockTableSkeleton />
              ) : displayed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    {search
                      ? `No results for "${search}"`
                      : filter === "low"
                        ? "No low-stock items."
                        : "No active products found."}
                  </TableCell>
                </TableRow>
              ) : (
                displayed.map((item) => {
                  const isUntracked = item.id === null;
                  const rowEditId = item.id ?? `init:${item.product_id}`;

                  return (
                    <TableRow
                      key={item.product_id}
                      className={cn(
                        "hover:bg-muted/30",
                        item.is_low && "bg-amber-50/40 dark:bg-amber-950/10"
                      )}
                    >
                      {/* Coffee reference — no truncation, wraps naturally */}
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {item.is_low && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                          {item.product_name}
                        </div>
                      </TableCell>

                      {/* Source badge */}
                      <TableCell>
                        {item.source === "shopify" ? (
                          <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-600 bg-green-500/5">
                            Shopify
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Manual
                          </Badge>
                        )}
                      </TableCell>

                      {/* Stock qty */}
                      <TableCell className="text-right">
                        {isUntracked ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <span className={cn(
                            "text-lg font-semibold tabular-nums",
                            item.is_low
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-foreground"
                          )}>
                            {item.quantity_kg!.toFixed(2)}
                          </span>
                        )}
                      </TableCell>

                      {/* Threshold */}
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {isUntracked ? "—" : item.low_stock_threshold_kg!.toFixed(2)}
                      </TableCell>

                      {/* Status badge */}
                      <TableCell className="text-center">
                        {isUntracked ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400"
                          >
                            Not tracked
                          </Badge>
                        ) : item.is_low ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400"
                          >
                            Low stock
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400"
                          >
                            In stock
                          </Badge>
                        )}
                      </TableCell>

                      {/* Last updated by */}
                      <TableCell className="text-sm text-muted-foreground">
                        {item.updater_name ?? "—"}
                      </TableCell>

                      {/* Last updated */}
                      <TableCell className="text-sm text-muted-foreground">
                        {item.last_updated_at
                          ? <RelativeTime iso={item.last_updated_at} />
                          : "—"
                        }
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {isUntracked ? (
                          // "Set up" button for untracked products
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            disabled={initMutation.isPending}
                            onClick={() => void handleInitAndEdit(item)}
                          >
                            {initMutation.isPending
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : "Set up"
                            }
                          </Button>
                        ) : (
                          <div className="flex justify-end gap-1">
                            {/* Edit popover */}
                            <Popover
                              open={editingId === rowEditId}
                              onOpenChange={(v) => { if (!v) setEditingId(null); }}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  className="w-11 h-11 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                                  onClick={() => setEditingId(rowEditId)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-4" align="end">
                                <p className="text-sm font-medium text-foreground mb-3">
                                  {item.product_name}
                                </p>
                                <EditPopover
                                  item={item}
                                  onClose={() => setEditingId(null)}
                                />
                              </PopoverContent>
                            </Popover>

                            {/* History button */}
                            <button
                              className="w-11 h-11 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                              onClick={() => {
                                setHistoryId(item.id);
                                setHistoryName(item.product_name);
                              }}
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── History Sheet ── */}
        <Sheet open={!!historyId} onOpenChange={(v) => { if (!v) setHistoryId(null); }}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{historyName} — stock history</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              {histLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : historyRows.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-10">
                  No updates recorded yet.
                </p>
              ) : (
                historyRows.map((row) => <HistoryEntry key={row.id} row={row} />)
              )}
            </div>
          </SheetContent>
        </Sheet>
      </section>
    </TooltipProvider>
  );
}
