import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, Search, ClipboardList, Loader2, FileSpreadsheet,
} from "lucide-react";
import { format, isToday, isTomorrow, parseISO, startOfDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_CLASS,
  normalizeOrderStatus, getNextStatus,
  type OrderStatus,
} from "@/lib/orderStatuses";
import type { AppRole } from "@/hooks/useOperationsData";

/* ─── Types ─── */

interface OrderItem {
  product_name: string;
  quantity: number;
  size_kg: number | null;
  price_per_kg: number;
}

interface FullOrder {
  id: string;
  user_id: string | null;
  created_at: string;
  delivery_date: string | null;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  invoicing_status: string;
  sellsy_id: string | null;
  discount_percent: number;
  // joined
  client_name: string | null;
  client_email: string | null;
  shopify_order_number: string | null;
  shopify_customer_name: string | null;
  items: OrderItem[];
}

/* ─── Query ─── */

const ORDERS_KEY = ["ordersView"] as const;

function useOrdersQuery() {
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: async (): Promise<FullOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, user_id, created_at, delivery_date, total_kg, status,
          is_roasted, is_packed, is_labeled, invoicing_status,
          sellsy_id, discount_percent,
          order_items ( product_name, quantity, size_kg, price_per_kg ),
          shopify_orders ( shopify_order_number, customer_name )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Two-step profiles join
      const userIds = [...new Set((data ?? []).map((o: any) => o.user_id).filter(Boolean))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      return (data ?? []).map((o: any) => {
        const profile = profileMap.get(o.user_id);
        const shopify = o.shopify_orders?.[0];
        return {
          id: o.id,
          user_id: o.user_id ?? null,
          created_at: o.created_at,
          delivery_date: o.delivery_date ?? null,
          total_kg: Number(o.total_kg),
          status: normalizeOrderStatus(o.status),
          is_roasted: Boolean(o.is_roasted),
          is_packed: Boolean(o.is_packed),
          is_labeled: Boolean(o.is_labeled),
          invoicing_status: o.invoicing_status ?? "pending",
          sellsy_id: o.sellsy_id ?? null,
          discount_percent: Number(o.discount_percent ?? 0),
          client_name: profile?.full_name ?? null,
          client_email: profile?.email ?? null,
          shopify_order_number: shopify?.shopify_order_number ?? null,
          shopify_customer_name: shopify?.customer_name ?? null,
          items: (o.order_items ?? []).map((i: any) => ({
            product_name: i.product_name,
            quantity: Number(i.quantity),
            size_kg: i.size_kg != null ? Number(i.size_kg) : null,
            price_per_kg: Number(i.price_per_kg),
          })),
        };
      });
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

/* ─── Status history sub-query ─── */

interface StatusHistoryRow {
  new_status: string;
  changed_at: string;
  note: string | null;
}

function useStatusHistory(orderId: string | null) {
  return useQuery({
    queryKey: ["statusHistory", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<StatusHistoryRow[]> => {
      const { data, error } = await (supabase as any)
        .from("order_status_history")
        .select("new_status, changed_at, note")
        .eq("order_id", orderId!)
        .order("changed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as StatusHistoryRow[];
    },
  });
}

/* ─── Helpers ─── */

function createdLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return `Today ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "HH:mm")}`;
  return format(d, "EEE d MMM HH:mm");
}

function isUrgent(order: FullOrder): boolean {
  if (!order.delivery_date) return false;
  const d = parseISO(order.delivery_date);
  return (isToday(d) || isTomorrow(d)) && order.status !== "delivered";
}

function customerLabel(order: FullOrder): string {
  if (order.client_name) return order.client_name;
  if (order.shopify_customer_name) return order.shopify_customer_name;
  return "Unknown customer";
}

function itemSummary(items: OrderItem[]): string {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const parts = shown.map((i) => `${i.product_name} ${i.quantity}kg`);
  if (rest > 0) parts.push(`+${rest} more`);
  return parts.join(" · ");
}

function totalPrice(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.price_per_kg, 0);
}

/* ─── Filters state ─── */

interface Filters {
  search: string;
  status: OrderStatus | "all";
  source: "all" | "shopify" | "internal";
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "all",
  source: "all",
  from: "",
  to: "",
};

function applyFilters(orders: FullOrder[], f: Filters): FullOrder[] {
  return orders.filter((o) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      const idMatch = o.id.toLowerCase().includes(q);
      const nameMatch = (o.client_name ?? "").toLowerCase().includes(q);
      const shopifyNameMatch = (o.shopify_customer_name ?? "").toLowerCase().includes(q);
      const shopifyNumMatch = (o.shopify_order_number ?? "").toLowerCase().includes(q);
      if (!idMatch && !nameMatch && !shopifyNameMatch && !shopifyNumMatch) return false;
    }
    if (f.status !== "all" && o.status !== f.status) return false;
    if (f.source === "shopify" && !o.shopify_order_number) return false;
    if (f.source === "internal" && o.shopify_order_number) return false;
    if (f.from) {
      const from = startOfDay(parseISO(f.from));
      if (parseISO(o.created_at) < from) return false;
    }
    if (f.to) {
      const to = new Date(parseISO(f.to));
      to.setHours(23, 59, 59, 999);
      if (parseISO(o.created_at) > to) return false;
    }
    return true;
  });
}

/* ─── Filters bar ─── */

function FiltersBar({
  filters,
  onChange,
  onExport,
  exportLoading,
  role,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onExport: () => void;
  exportLoading: boolean;
  role: AppRole;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...filters, [k]: v });

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: search + export */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search order, customer…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex-1" />
        {role === "admin" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            disabled={exportLoading}
            className="gap-1.5 shrink-0"
          >
            {exportLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Export to Sheets
          </Button>
        )}
      </div>

      {/* Row 2: status + source + dates */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status segmented */}
        <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5 text-xs">
          {(["all", ...ORDER_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => set("status", s as Filters["status"])}
              className={cn(
                "px-2.5 py-1 rounded transition-colors whitespace-nowrap",
                filters.status === s
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? "All" : ORDER_STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {/* Source pills */}
        <div className="flex items-center gap-1">
          {(["all", "shopify", "internal"] as const).map((s) => (
            <button
              key={s}
              onClick={() => set("source", s)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition-colors capitalize",
                filters.source === s
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>From</span>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => set("from", e.target.value)}
            className="px-2 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
          <span>To</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => set("to", e.target.value)}
            className="px-2 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Summary bar ─── */

function SummaryBar({ orders, total }: { orders: FullOrder[]; total: number }) {
  const urgent = orders.filter(isUrgent).length;
  const euros = orders.reduce((s, o) => s + totalPrice(o.items), 0);
  return (
    <p className="text-xs text-muted-foreground py-1">
      Showing <span className="font-medium text-foreground">{orders.length}</span> of {total} orders
      {urgent > 0 && (
        <> · <span className="text-destructive font-medium">{urgent} urgent</span></>
      )}
      {euros > 0 && (
        <> · <span className="font-medium text-foreground">€{euros.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</span> total</>
      )}
    </p>
  );
}

/* ─── Expanded panel ─── */

function ExpandedPanel({
  order,
  role,
  onClose,
}: {
  order: FullOrder;
  role: AppRole;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: history = [] } = useStatusHistory(order.id);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Generic status update mutation
  const updateStatus = useMutation({
    mutationFn: async ({
      newStatus,
      patch,
      histNote,
    }: {
      newStatus: OrderStatus;
      patch: Record<string, unknown>;
      histNote: string;
    }) => {
      const { error: oErr } = await supabase
        .from("orders")
        .update({ status: newStatus as string, ...patch } as any)
        .eq("id", order.id);
      if (oErr) throw oErr;

      const { error: hErr } = await (supabase as any).from("order_status_history").insert({
        order_id: order.id,
        new_status: newStatus,
        changed_by: null,
        note: histNote,
      });
      if (hErr) throw hErr;
    },
    onSuccess: (_, { newStatus }) => {
      toast({ title: `Status → ${ORDER_STATUS_LABEL[newStatus]}` });
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
      void qc.invalidateQueries({ queryKey: ["operationsCounts"] });
      void qc.invalidateQueries({ queryKey: ["orderCounts"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  // Checklist field mutation
  const updateField = useMutation({
    mutationFn: async ({ field, value }: { field: "is_roasted" | "is_packed" | "is_labeled"; value: boolean }) => {
      const { error } = await supabase.from("orders").update({ [field]: value } as any).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await (supabase as any).from("orders").update({ notes }).eq("id", order.id);
    setSavingNotes(false);
    if (error) {
      toast({ title: "Failed to save note", description: (error as any).message, variant: "destructive" });
    } else {
      toast({ title: "Note saved" });
      void qc.invalidateQueries({ queryKey: ORDERS_KEY });
    }
  };

  const totalEur = totalPrice(order.items);
  const lastHistory = history[0];

  return (
    <div className="border-t border-border bg-background/50 px-4 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: items table */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left pb-1.5 font-medium">Product</th>
                <th className="text-right pb-1.5 font-medium">Size</th>
                <th className="text-right pb-1.5 font-medium">Qty</th>
                <th className="text-right pb-1.5 font-medium">€/kg</th>
                <th className="text-right pb-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1.5 text-foreground">{item.product_name}</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                    {item.size_kg != null ? `${item.size_kg}kg` : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    €{item.price_per_kg.toFixed(0)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    €{(item.quantity * item.price_per_kg).toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="pt-2 text-xs text-muted-foreground">{order.total_kg} kg total</td>
                <td />
                <td />
                <td />
                <td className="pt-2 text-right font-semibold tabular-nums">€{totalEur.toFixed(0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Right: order info */}
        <div className="space-y-3 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order info</p>

          <dl className="space-y-1.5">
            <Row label="Customer">
              {order.client_name || order.shopify_customer_name || "—"}
              {order.client_email && (
                <span className="ml-1.5 text-muted-foreground text-xs">{order.client_email}</span>
              )}
            </Row>
            <Row label="Source">
              {order.shopify_order_number
                ? <span>Shopify <span className="font-mono">#{order.shopify_order_number}</span></span>
                : "Internal"}
            </Row>
            <Row label="Status">
              {ORDER_STATUS_LABEL[order.status]}
              {lastHistory && (
                <span className="ml-1.5 text-muted-foreground text-xs">
                  · {createdLabel(lastHistory.changed_at)}
                </span>
              )}
            </Row>
            <Row label="Delivery">
              {order.delivery_date ? format(parseISO(order.delivery_date), "EEE d MMM yyyy") : "Not set"}
            </Row>
            <Row label="Created">{format(parseISO(order.created_at), "d MMM yyyy HH:mm")}</Row>
            {/* HIDDEN — Sellsy — preserved for future use */}
            {/* <Row label="Invoice">{order.invoicing_status}</Row> */}
            {/* {order.sellsy_id && <Row label="Sellsy ID"><span className="font-mono">{order.sellsy_id}</span></Row>} */}
            {order.discount_percent > 0 && <Row label="Discount">{order.discount_percent}%</Row>}
          </dl>

          {/* Sub-state chips */}
          <div className="flex gap-1.5 flex-wrap pt-1">
            {order.is_roasted && <Chip color="amber">✓ Roasted</Chip>}
            {order.is_packed  && <Chip color="blue">✓ Packed</Chip>}
            {order.is_labeled && <Chip color="blue">✓ Labeled</Chip>}
          </div>
        </div>
      </div>

      {/* Status actions */}
      <StatusActions
        order={order}
        role={role}
        onUpdateStatus={(newStatus, patch, note) =>
          updateStatus.mutate({ newStatus, patch: patch ?? {}, histNote: note })
        }
        onUpdateField={(field, value) => updateField.mutate({ field, value })}
        pending={updateStatus.isPending || updateField.isPending}
      />

      {/* Notes */}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={role !== "admin"}
          rows={3}
          className="w-full text-sm px-3 py-2 bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
          placeholder={role === "admin" ? "Add a note…" : "No notes"}
        />
        {role === "admin" && (
          <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Save note
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Status actions ─── */

function StatusActions({
  order,
  role,
  onUpdateStatus,
  onUpdateField,
  pending,
}: {
  order: FullOrder;
  role: AppRole;
  onUpdateStatus: (s: OrderStatus, patch?: Record<string, unknown>, note?: string) => void;
  onUpdateField: (f: "is_roasted" | "is_packed" | "is_labeled", v: boolean) => void;
  pending: boolean;
}) {
  const { status } = order;
  const buttons: React.ReactNode[] = [];

  if (status === "received" && role === "admin") {
    buttons.push(
      <ActionBtn key="approve" onClick={() => onUpdateStatus("approved", {}, "Approved via Orders view")}>
        Approve order
      </ActionBtn>
    );
  }

  if (status === "approved" && (role === "admin" || role === "roaster")) {
    if (!order.is_roasted) {
      buttons.push(
        <ActionBtn key="roast" onClick={() => onUpdateField("is_roasted", true)}>
          Mark as roasted
        </ActionBtn>
      );
    } else {
      buttons.push(
        <ActionBtn key="to-packaging" onClick={() => onUpdateStatus("packaging", { is_roasted: true }, "Sent to packaging via Orders view")}>
          Send to Packaging
        </ActionBtn>
      );
    }
  }

  if (status === "packaging" && (role === "admin" || role === "packaging")) {
    if (!order.is_packed) {
      buttons.push(
        <ActionBtn key="pack" onClick={() => onUpdateField("is_packed", true)}>
          Mark as packed
        </ActionBtn>
      );
    }
    if (!order.is_labeled) {
      buttons.push(
        <ActionBtn key="label" onClick={() => onUpdateField("is_labeled", true)}>
          Mark as labeled
        </ActionBtn>
      );
    }
    if (order.is_packed && order.is_labeled) {
      buttons.push(
        <ActionBtn key="ready" variant="default" onClick={() => onUpdateStatus("ready_for_delivery", {}, "Ready for delivery via Orders view")}>
          Ready for delivery
        </ActionBtn>
      );
    }
  }

  if (status === "ready_for_delivery" && role === "admin") {
    buttons.push(
      <ActionBtn key="deliver" variant="default" onClick={() => onUpdateStatus("delivered", {}, "Handed off to carrier via Orders view")}>
        Handed off to carrier
      </ActionBtn>
    );
  }

  if (buttons.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-border">
      {buttons.map((b, i) => (
        <span key={i} className={cn(pending && "opacity-60 pointer-events-none")}>
          {b}
        </span>
      ))}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  variant = "outline",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "outline" | "default";
}) {
  return (
    <Button size="sm" variant={variant} onClick={onClick}>
      {children}
    </Button>
  );
}

/* ─── Small helpers ─── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground shrink-0 w-20">{label}</dt>
      <dd className="text-foreground flex-1">{children}</dd>
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: "amber" | "blue" }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
      color === "amber"
        ? "bg-warning/10 text-warning border-warning/20"
        : "bg-info/10 text-info border-info/20"
    )}>
      {children}
    </span>
  );
}

/* ─── Order row ─── */

function OrderRow({ order, role }: { order: FullOrder; role: AppRole }) {
  const [expanded, setExpanded] = useState(false);
  const price = totalPrice(order.items);
  const urgent = isUrgent(order);

  return (
    <div className={cn(
      "border-b border-border last:border-0",
      urgent && "bg-destructive/[0.02]"
    )}>
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {/* Left: ID + badges + customer */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{order.id.slice(0, 8)}</span>
            {order.shopify_order_number && (
              <>
                <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
                  Shopify
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">#{order.shopify_order_number}</span>
              </>
            )}
            <span className="text-sm font-medium text-foreground truncate">{customerLabel(order)}</span>
          </div>

          {/* Middle: item summary + totals + date */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground truncate max-w-[300px]">
              {itemSummary(order.items)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {order.total_kg} kg · €{price.toFixed(0)}
            </span>
            {order.delivery_date && (
              <span className="text-xs text-muted-foreground shrink-0">
                ↗ {format(parseISO(order.delivery_date), "d MMM")}
              </span>
            )}
          </div>
        </div>

        {/* Right: status + sub-state + created */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
              ORDER_STATUS_CLASS[order.status]
            )}>
              {ORDER_STATUS_LABEL[order.status]}
            </span>
            {order.is_roasted && <Chip color="amber">✓ Roasted</Chip>}
            {order.is_packed  && <Chip color="blue">✓ Packed</Chip>}
            {order.is_labeled && <Chip color="blue">✓ Labeled</Chip>}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {createdLabel(order.created_at)}
          </span>
        </div>

        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ExpandedPanel order={order} role={role} onClose={() => setExpanded(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main export ─── */

interface OrdersViewProps {
  role: AppRole;
}

export default function OrdersView({ role }: OrdersViewProps) {
  const { data: allOrders = [], isLoading } = useOrdersQuery();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [exportLoading, setExportLoading] = useState(false);
  const { toast } = useToast();

  const filtered = useMemo(() => applyFilters(allOrders, filters), [allOrders, filters]);
  const hasActiveFilter = Object.values(filters).some((v) => v !== "" && v !== "all");

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const month_key = format(new Date(), "yyyy-MM");
      const { data, error } = await supabase.functions.invoke("sheets-export", {
        body: { month_key },
      });
      if (error) throw error;
      toast({
        title: "Export complete",
        description: data?.url ? `Sheet: ${data.url}` : "Exported successfully",
      });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading orders…
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-6xl">
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        onExport={handleExport}
        exportLoading={exportLoading}
        role={role}
      />

      {/* Summary bar — sticky below filters */}
      <SummaryBar orders={filtered} total={allOrders.length} />

      {/* Order list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <ClipboardList className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">No orders found</p>
          <p className="text-xs">Try adjusting your filters</p>
          {hasActiveFilter && (
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {filtered.map((order) => (
            <OrderRow key={order.id} order={order} role={role} />
          ))}
        </div>
      )}
    </div>
  );
}
