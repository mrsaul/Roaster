import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Flame, Package, Truck, LayoutDashboard, LogOut, RefreshCw, Warehouse, ClipboardList, Coffee,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

import { RoasterView } from "@/components/RoasterView";
import { PackagingView } from "@/components/PackagingView";
import DeliveryView from "@/components/DeliveryView";
import { StockView } from "@/components/StockView";
import OrdersView from "@/components/OrdersView";
import { ProductsView } from "@/components/ProductsView";

import {
  useRole, useOrderCounts, useOverviewMetrics, useOverviewPipeline,
  useRoasterOrders, usePackagingOrders, useMarkRoasted,
  useUpdatePackagingStatus, useUpdateChecklist,
} from "@/hooks/useOperationsData";
import { useOperationsCounts } from "@/hooks/useOperationsCounts";

import {
  ORDER_STATUS_LABEL, ORDER_STATUS_CLASS, getOrderPriority, PRIORITY_CLASS, PRIORITY_LABEL,
} from "@/lib/orderStatuses";
import { format as formatDate, parseISO } from "date-fns";

type Section = "overview" | "orders" | "roasting" | "packaging" | "delivery" | "stock" | "products";

interface NavItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
  roles: string[];
  dotColor: string; // tailwind bg class
}

const NAV: NavItem[] = [
  { id: "overview",  label: "Overview",  icon: <LayoutDashboard className="w-4 h-4" />, roles: ["admin"],                        dotColor: "bg-primary" },
  { id: "orders",    label: "Orders",    icon: <ClipboardList className="w-4 h-4" />,   roles: ["admin"],                        dotColor: "bg-muted-foreground" },
  { id: "roasting",  label: "Roasting",  icon: <Flame className="w-4 h-4" />,           roles: ["admin", "roaster"],             dotColor: "bg-warning" },
  { id: "packaging", label: "Packaging", icon: <Package className="w-4 h-4" />,          roles: ["admin", "packaging"],           dotColor: "bg-info" },
  { id: "delivery",  label: "Delivery",  icon: <Truck className="w-4 h-4" />,            roles: ["admin"],                        dotColor: "bg-success" },
  { id: "stock",     label: "Stock",     icon: <Warehouse className="w-4 h-4" />,        roles: ["admin", "roaster"],             dotColor: "bg-muted-foreground" },
  { id: "products",  label: "Products",  icon: <Coffee className="w-4 h-4" />,           roles: ["admin"],                        dotColor: "bg-muted-foreground" },
];

/* ─── Live sync hook ─── */

type SyncState = "live" | "syncing" | "offline";

function useSyncState(): SyncState {
  const isFetching = useIsFetching();
  const qc = useQueryClient();
  const [state, setState] = useState<SyncState>("live");
  const lastSuccessRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated") {
        const q = event.query;
        if (q.state.status === "success") {
          lastSuccessRef.current = Date.now();
          setState("live");
        } else if (q.state.status === "error") {
          setState("offline");
        }
      }
    });

    timerRef.current = setInterval(() => {
      if (Date.now() - lastSuccessRef.current > 60_000) setState("offline");
    }, 10_000);

    return () => {
      unsub();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [qc]);

  if (isFetching > 0) return "syncing";
  return state;
}

/* ─── Sync dot ─── */

function SyncDot() {
  const state = useSyncState();
  if (state === "syncing") return <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" />;
  if (state === "live")    return (
    <span className="relative flex w-2 h-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
    </span>
  );
  return <span className="w-2 h-2 rounded-full bg-warning" />;
}

function SyncLabel() {
  const state = useSyncState();
  const label = state === "syncing" ? "Syncing…" : state === "live" ? "Live" : "Offline";
  return <span className="text-[11px] text-muted-foreground">{label}</span>;
}

/* ─── Main component ─── */

export default function OperationsDashboard() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isFetching = useIsFetching();

  const { data: role, isLoading: roleLoading } = useRole();
  const { data: counts } = useOperationsCounts();
  const section = (params.get("section") as Section) ?? "overview";

  useEffect(() => {
    if (!role) return;
    if (!params.get("section")) {
      if (role === "roaster")   { setParams({ section: "roasting" });  return; }
      if (role === "packaging") { setParams({ section: "packaging" }); return; }
    }
    const allowed = NAV.filter((n) => n.roles.includes(role)).map((n) => n.id);
    if (allowed.length > 0 && !allowed.includes(section as Section)) {
      setParams({ section: allowed[0] });
    }
  }, [role, params, setParams, section]);

  const setSection = (s: Section) => setParams({ section: s });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleRefresh = () => void qc.invalidateQueries();

  const visibleNav = NAV.filter((n) => !role || n.roles.includes(role));

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  // Active order count for top bar
  const activeOrders = (counts?.roasting ?? 0) + (counts?.packaging ?? 0) + (counts?.delivery ?? 0);

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col w-[200px] shrink-0 border-r border-border bg-sidebar">
        {/* Brand block */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <Flame className="w-5 h-5 text-warning shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight truncate">Plural Roaster</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Operations</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((n) => {
            const active = section === n.id;
            const badge = getBadgeCount(n.id, counts);
            return (
              <button
                key={n.id}
                onClick={() => setSection(n.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors text-left",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {/* Colored dot */}
                <span className={cn("w-2 h-2 rounded-full shrink-0", n.dotColor, !active && "opacity-50")} />
                <span className="flex-1 truncate">{n.label}</span>
                {badge > 0 && (
                  <Badge
                    variant={n.id === "delivery" ? "default" : "secondary"}
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 shrink-0",
                      n.id === "delivery" && "bg-warning/20 text-warning border-warning/30"
                    )}
                  >
                    {badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar footer — Shopify sync + logout */}
        <div className="border-t border-border px-3 py-3 space-y-2">
          {counts?.lastShopifySync && (
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Shopify sync</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {formatDate(parseISO(counts.lastShopifySync), "d MMM, HH:mm")}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Right column ── */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* ── Top bar ── */}
        <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
          {/* Mobile brand */}
          <div className="flex items-center gap-1.5 md:hidden shrink-0">
            <Flame className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium text-foreground">Operations</span>
          </div>

          {/* Today's date */}
          <p className="hidden md:block text-sm text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")}
          </p>

          <div className="flex-1" />

          {/* Active orders chip */}
          {activeOrders > 0 && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{activeOrders}</span>
              <span>active order{activeOrders !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Sync badge */}
          <div className="flex items-center gap-1.5">
            <SyncDot />
            <span className="hidden sm:block"><SyncLabel /></span>
          </div>

          {/* Refresh */}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleRefresh} title="Refresh">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching > 0 && "animate-spin")} />
          </Button>

          {/* Mobile logout */}
          <button
            onClick={handleLogout}
            className="md:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        {/* ── Section content ── */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {section === "overview"  && role === "admin"                         && <OverviewSection />}
              {section === "orders"    && role === "admin"                         && <OrdersView role={role} />}
              {section === "roasting"                                               && <RoastingSection />}
              {section === "packaging"                                              && <PackagingSection />}
              {section === "delivery"  && role === "admin"                         && <DeliveryView role="admin" />}
              {section === "stock"     && (role === "admin" || role === "roaster") && <StockView />}
              {section === "products"  && role === "admin"                         && <ProductsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <motion.nav
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around px-2 py-1 z-50"
      >
        {visibleNav.map((n) => {
          const badge = getBadgeCount(n.id, counts);
          return (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[48px]",
                section === n.id ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                {n.icon}
                {badge > 0 && (
                  <span className={cn(
                    "absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-bold flex items-center justify-center px-0.5",
                    n.id === "delivery" ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground"
                  )}>
                    {badge}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] leading-none", section === n.id ? "font-medium" : "")}>
                {n.label}
              </span>
              {section === n.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 bg-muted rounded-lg -z-10"
                />
              )}
            </button>
          );
        })}
      </motion.nav>
    </div>
  );
}

/* ─── Badge count helper ─── */

function getBadgeCount(
  id: Section,
  counts: ReturnType<typeof useOperationsCounts>["data"]
): number {
  if (!counts) return 0;
  if (id === "orders")    return counts.ordersActive ?? 0;
  if (id === "roasting")  return counts.roasting;
  if (id === "packaging") return counts.packaging;
  if (id === "delivery")  return counts.delivery;
  return 0;
}

/* ─── Overview section ─── */

function OverviewSection() {
  const { data: metrics } = useOverviewMetrics();
  const { data: pipeline = [] } = useOverviewPipeline();
  const { data: counts } = useOrderCounts();
  const { data: opCounts } = useOperationsCounts();

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 4 metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Orders this week" value={metrics?.ordersThisWeek} />
        <MetricCard label="Kg this week" value={metrics ? metrics.kgThisWeek.toFixed(0) : undefined} />
        <MetricCard
          label="Urgent orders"
          value={metrics?.urgentCount}
          valueClass={(metrics?.urgentCount ?? 0) > 0 ? "text-destructive" : undefined}
        />
        <MetricCard label="Low stock items" value={opCounts?.lowStock} />
      </div>

      {/* 3 mini pipeline columns */}
      {counts && (
        <div className="grid grid-cols-3 gap-3">
          <PipelineColumn
            label="Roasting"
            dotColor="bg-warning"
            count={counts.approved}
            sublabel="approved"
          />
          <PipelineColumn
            label="Packaging"
            dotColor="bg-info"
            count={counts.packaging}
            sublabel="in packaging"
          />
          <PipelineColumn
            label="Delivery"
            dotColor="bg-success"
            count={counts.ready_for_delivery}
            sublabel="ready"
          />
        </div>
      )}

      {/* Active orders table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Active orders</p>
          <p className="text-xs text-muted-foreground">{pipeline.length} showing</p>
        </div>
        {pipeline.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No active orders</p>
        ) : (
          <div className="divide-y divide-border">
            {pipeline.map((o) => {
              const priority = getOrderPriority(o.delivery_date);
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {o.client_name ?? (o.shopify_order_number ? `#${o.shopify_order_number}` : `#${o.id.slice(0, 8)}`)}
                      </span>
                      {o.shopify_order_number && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
                          Shopify
                        </Badge>
                      )}
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", ORDER_STATUS_CLASS[o.status])}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </span>
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", PRIORITY_CLASS[priority])}>
                        {PRIORITY_LABEL[priority]}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm tabular-nums text-foreground">{o.total_kg.toFixed(0)} kg</p>
                    <p className="text-xs text-muted-foreground">{formatDate(parseISO(o.delivery_date), "EEE d MMM")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stock summary below */}
      <StockView />
    </div>
  );
}

/* ─── Small overview sub-components ─── */

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value?: string | number;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <p className={cn("text-2xl font-medium tabular-nums text-foreground", valueClass)}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function PipelineColumn({
  label,
  dotColor,
  count,
  sublabel,
}: {
  label: string;
  dotColor: string;
  count: number;
  sublabel: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("w-2 h-2 rounded-full", dotColor)} />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-3xl font-semibold tabular-nums text-foreground">{count}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}

/* ─── Roasting section ─── */

function RoastingSection() {
  const { data: orders = [], isLoading } = useRoasterOrders();
  const markRoasted = useMarkRoasted();
  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  return <RoasterView orders={orders} onMarkRoasted={(id, v) => markRoasted.mutate({ orderId: id, value: v })} />;
}

/* ─── Packaging section ─── */

function PackagingSection() {
  const { data: orders = [], isLoading } = usePackagingOrders();
  const updateStatus = useUpdatePackagingStatus();
  const updateChecklist = useUpdateChecklist();
  if (isLoading) return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  return (
    <PackagingView
      orders={orders}
      onStatusChange={(id, s) => updateStatus.mutate({ orderId: id, newStatus: s })}
      onChecklistChange={(id, f, v) => updateChecklist.mutate({ orderId: id, field: f, value: v })}
    />
  );
}
