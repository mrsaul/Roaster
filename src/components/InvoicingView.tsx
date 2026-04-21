import { useState, useMemo } from "react";
import {
  Send, RefreshCw, ExternalLink, AlertCircle, CheckCircle2, Search, X, Filter, AlertTriangle,
  Sheet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orderStatuses";

/* ─── Types ─── */

export type InvoicingStatus = "not_sent" | "sent" | "error";

export interface InvoicingOrder {
  id: string;
  user_id: string;
  client_name: string | null;
  user_email: string | null;
  delivery_date: string;
  total_kg: number;
  total_price: number;
  status: OrderStatus;
  sellsy_id: string | null;
  invoicing_status: InvoicingStatus;
  last_invoice_sync: string | null;
  has_sellsy_client_id: boolean;
  items: { product_name: string; quantity: number; price_per_kg: number }[];
}

interface InvoicingViewProps {
  orders: InvoicingOrder[];
  onSendToSellsy: (orderId: string) => Promise<void>;
  onBulkSendToSellsy: (orderIds: string[]) => Promise<void>;
  sendingIds: Set<string>;
}

const INVOICING_STATUS_LABEL: Record<InvoicingStatus, string> = {
  not_sent: "Not Sent",
  sent: "Sent to Sellsy",
  error: "Error",
};

const INVOICING_STATUS_CLASS: Record<InvoicingStatus, string> = {
  not_sent: "bg-warning/10 text-warning border-warning/20",
  sent: "bg-success/10 text-success border-success/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
};

/* ─── Component ─── */

export function InvoicingView({ orders, onSendToSellsy, onBulkSendToSellsy, sendingIds }: InvoicingViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [invoicingFilter, setInvoicingFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailOrder, setDetailOrder] = useState<InvoicingOrder | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [sheetIdInput, setSheetIdInput] = useState("");
  const { toast } = useToast();

  // Extract spreadsheet ID from a Google Sheets URL or plain ID
  const parseSheetId = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Full URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    // Plain ID (no slashes)
    if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleExportToSheets = async (testMode = false) => {
    const spreadsheetId = parseSheetId(sheetIdInput) ?? undefined;
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-invoicing-sheet", {
        body: { test: testMode, spreadsheet_id: spreadsheetId },
      });

      // Extract the real error message from the function response body
      if (error) {
        let detail = error.message;
        try {
          // FunctionsHttpError carries the response body in error.context
          const body = await (error as any).context?.json?.();
          if (body?.error) detail = body.error;
        } catch {
          // ignore — use the original error.message
        }
        throw new Error(detail);
      }

      const result = data as { url: string; orders_exported: number; month: string };
      setSheetUrl(result.url);
      toast({
        title: "Exported to Google Sheets",
        description: `${result.orders_exported} orders exported for ${result.month}.`,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  // Filter orders to invoicing-eligible statuses
  const eligibleOrders = useMemo(() =>
    orders.filter((o) => ["ready_for_delivery", "delivered"].includes(o.status)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let result = eligibleOrders;
    if (invoicingFilter !== "all") {
      result = result.filter((o) => o.invoicing_status === invoicingFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.client_name ?? "").toLowerCase().includes(q) ||
          (o.user_email ?? "").toLowerCase().includes(q) ||
          (o.sellsy_id ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [eligibleOrders, invoicingFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: eligibleOrders.length,
    notSent: eligibleOrders.filter((o) => o.invoicing_status === "not_sent").length,
    sent: eligibleOrders.filter((o) => o.invoicing_status === "sent").length,
    error: eligibleOrders.filter((o) => o.invoicing_status === "error").length,
  }), [eligibleOrders]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filteredOrders.filter((o) => o.invoicing_status !== "sent");
    if (selectedIds.size === selectable.length && selectable.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map((o) => o.id)));
    }
  };

  const handleBulkSend = async () => {
    if (selectedIds.size === 0) return;
    setBulkSending(true);
    try {
      await onBulkSendToSellsy(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setBulkSending(false);
    }
  };

  const selectableCount = filteredOrders.filter((o) => o.invoicing_status !== "sent").length;

  return (
    <>
      <section className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2">Total invoiceable</p>
            <p className="text-2xl font-medium tabular-nums text-foreground">{stats.total}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2">Not sent</p>
            <p className={cn("text-2xl font-medium tabular-nums", stats.notSent > 0 ? "text-warning" : "text-foreground")}>{stats.notSent}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2">Sent</p>
            <p className="text-2xl font-medium tabular-nums text-success">{stats.sent}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-2">Errors</p>
            <p className={cn("text-2xl font-medium tabular-nums", stats.error > 0 ? "text-destructive" : "text-foreground")}>{stats.error}</p>
          </div>
        </div>

        {/* Google Sheets connect banner — shown until a sheet URL is returned */}
        {!sheetUrl && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Sheet className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground mb-1">Connect a Google Sheet</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Create a Google Sheet in your Drive, share it with the service account as <strong>Editor</strong>, then paste the URL below.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    value={sheetIdInput}
                    onChange={(e) => setSheetIdInput(e.target.value)}
                    className="text-sm flex-1"
                  />
                  {sheetIdInput && !parseSheetId(sheetIdInput) && (
                    <p className="text-xs text-destructive self-center whitespace-nowrap">Invalid URL</p>
                  )}
                </div>
                {parseSheetId(sheetIdInput) && (
                  <p className="text-xs text-green-600 mt-1.5">✓ Sheet ID detected: {parseSheetId(sheetIdInput)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-56"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={invoicingFilter} onValueChange={setInvoicingFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="not_sent">Not Sent</SelectItem>
                <SelectItem value="sent">Sent to Sellsy</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {/* Export to Google Sheets */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={exporting}
              onClick={() => void handleExportToSheets(false)}
            >
              {exporting
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Sheet className="w-4 h-4 text-green-600" />}
              {exporting ? "Exporting…" : "Export to Sheets"}
            </Button>

            {/* Test mode — all statuses, for verifying Google credentials */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground text-xs"
              disabled={exporting}
              onClick={() => void handleExportToSheets(true)}
            >
              {exporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sheet className="w-3 h-3" />}
              Test export
            </Button>

            {/* Link to last exported sheet */}
            {sheetUrl && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-green-600 hover:text-green-700" asChild>
                <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Sheet
                </a>
              </Button>
            )}

            {selectedIds.size > 0 && (
              <Button
                size="sm"
                className="gap-2"
                disabled={bulkSending}
                onClick={() => void handleBulkSend()}
              >
                {bulkSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send selected ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectableCount > 0 && selectedIds.size === selectableCount}
                      onCheckedChange={toggleSelectAll}
                      disabled={selectableCount === 0}
                    />
                  </TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead className="text-right">Total (€)</TableHead>
                  <TableHead>Order Status</TableHead>
                  <TableHead>Invoice Status</TableHead>
                  <TableHead>Sellsy ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No invoiceable orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const isSent = order.invoicing_status === "sent";
                    const isSending = sendingIds.has(order.id);
                    return (
                      <TableRow
                        key={order.id}
                        className={cn(
                          "cursor-pointer transition-colors",
                          order.invoicing_status === "not_sent" && "bg-warning/[0.03]",
                          order.invoicing_status === "error" && "bg-destructive/[0.03]",
                        )}
                        onClick={() => setDetailOrder(order)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                            disabled={isSent}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground">{order.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-foreground text-sm">
                          <span className="flex items-center gap-1.5">
                            {order.client_name || order.user_email || "—"}
                            {!order.has_sellsy_client_id && (
                              <span title="No Sellsy Client ID — cannot invoice">
                                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{format(parseISO(order.delivery_date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right tabular-nums text-foreground font-medium">€{order.total_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", ORDER_STATUS_CLASS[order.status])}>
                            {ORDER_STATUS_LABEL[order.status]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", INVOICING_STATUS_CLASS[order.invoicing_status])}>
                            {order.invoicing_status === "sent" && <CheckCircle2 className="w-3 h-3" />}
                            {order.invoicing_status === "error" && <AlertCircle className="w-3 h-3" />}
                            {INVOICING_STATUS_LABEL[order.invoicing_status]}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{order.sellsy_id || "—"}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {isSent ? (
                            order.sellsy_id && (
                              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
                                <a href={`https://app.sellsy.com`} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3.5 h-3.5" /> Open
                                </a>
                              </Button>
                            )
                          ) : !order.has_sellsy_client_id ? (
                            <span className="text-xs text-warning flex items-center gap-1" title="Assign a Sellsy Client ID to this client first">
                              <AlertTriangle className="w-3.5 h-3.5" /> No Sellsy ID
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant={order.invoicing_status === "error" ? "destructive" : "default"}
                              className="gap-1.5"
                              disabled={isSending}
                              onClick={() => void onSendToSellsy(order.id)}
                            >
                              {isSending ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              {order.invoicing_status === "error" ? "Retry" : "Send"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* Detail dialog */}
      <Dialog open={Boolean(detailOrder)} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Invoice — {detailOrder?.id.slice(0, 8)}
              {detailOrder && (
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", INVOICING_STATUS_CLASS[detailOrder.invoicing_status])}>
                  {INVOICING_STATUS_LABEL[detailOrder.invoicing_status]}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>Order invoicing details and actions.</DialogDescription>
          </DialogHeader>

          {detailOrder && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{detailOrder.client_name || detailOrder.user_email || "Unknown"}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Delivery date</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{format(parseISO(detailOrder.delivery_date), "EEEE d MMMM yyyy")}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Order status</p>
                  <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium mt-1", ORDER_STATUS_CLASS[detailOrder.status])}>
                    {ORDER_STATUS_LABEL[detailOrder.status]}
                  </span>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Sellsy Invoice ID</p>
                  <p className="mt-1 text-sm font-mono text-foreground">{detailOrder.sellsy_id || "—"}</p>
                </div>
                {detailOrder.last_invoice_sync && (
                  <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Last sync</p>
                    <p className="mt-1 text-sm text-foreground">{format(parseISO(detailOrder.last_invoice_sync), "MMM d, yyyy HH:mm")}</p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty (kg)</TableHead>
                      <TableHead className="text-right">€/kg</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailOrder.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-foreground">{item.product_name}</TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">€{item.price_per_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums text-foreground font-medium">€{(item.quantity * item.price_per_kg).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">{detailOrder.total_kg.toFixed(0)} kg total</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">€{detailOrder.total_price.toFixed(2)}</span>
              </div>

              {/* Missing Sellsy ID warning */}
              {!detailOrder.has_sellsy_client_id && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <p className="text-sm text-warning">This client has no Sellsy Client ID. Assign one in the Clients section before invoicing.</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                {detailOrder.sellsy_id && (
                  <Button variant="outline" className="gap-2" asChild>
                    <a href="https://app.sellsy.com" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" /> Open in Sellsy
                    </a>
                  </Button>
                )}
                {detailOrder.invoicing_status !== "sent" && detailOrder.has_sellsy_client_id && (
                  <Button
                    className="gap-2"
                    variant={detailOrder.invoicing_status === "error" ? "destructive" : "default"}
                    disabled={sendingIds.has(detailOrder.id)}
                    onClick={() => {
                      void onSendToSellsy(detailOrder.id);
                      setDetailOrder(null);
                    }}
                  >
                    {sendingIds.has(detailOrder.id) ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {detailOrder.invoicing_status === "error" ? "Retry Send" : "Send to Sellsy"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
