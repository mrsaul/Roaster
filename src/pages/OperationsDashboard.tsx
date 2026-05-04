import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Flame, Package, Truck, LayoutDashboard, LogOut, RefreshCw, Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

import { RoasterView } from "@/components/RoasterView";
import { PackagingView } from "@/components/PackagingView";
import { DeliveryView } from "@/components/DeliveryView";
import { StockView } from "@/components/StockView";

import {
  useRole, useOrderCounts, useOverviewMetrics, useOverviewPipeline,
  useRoasterOrders, usePackagingOrders, useMarkRoasted,
  useUpdatePackagingStatus, useUpdateChecklist,
} from "@/hooks/useOperationsData";

import {
  ORDER_STATUS_LABEL, ORDER_STATUS_CLASS, getOrderPriority, PRIORITY_CLASS, PRIORITY_LABEL,
} from "@/lib/orderStatuses";
import { format, parseISO } from "date-fns";

type Section = "overview" | "roasting" | "packaging" | "delivery" | "stock";

const NAV: { id: Section; label: string; icon: React.ReactNode; roles: string[] }[] = [
  { id: "overview",  label: "Overview",  icon: <LayoutDashboard className="w-4 h-4" />, roles: ["admin"] },
  { id: "roasting",  label: "Roasting",  icon: <Flame className="w-4 h-4" />,           roles: ["admin", "roaster"] },
  { id: "packaging", label: "Packaging", icon: <Package className="w-4 h-4" />,          roles: ["admin", "packaging"] },
  { id: "delivery",  label: "Delivery",  icon: <Truck className="w-4 h-4" />,            roles: ["admin"] },
  { id: "stock",     label: "Stock",     icon: <Warehouse className="w-4 h-4" />,        roles: ["admin", "roaster"] },
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
      if (Date.now() - lastSuccessRef.current > 60_000) {
        setState("offline");
      }
    }, 10_000);

    return () => {
      unsub();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [qc]);

  if (isFetching > 0) return "syncing";
  return state;
}

/* ─── Sync badge ─── */

function SyncBadge() {
  const state = useSyncState();
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
      {state === "syncing" && (
        <>
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" />
          <span className="hidden sm:inline">Syncing…</span>
        </>
      )}
      {state === "live" && (
        <>
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="hidden sm:inline">Live</span>
        </>
      )}
      {state === "offline" && (
        <>
          <span className="w-2 h-2 rounded-full bg-warning" />
          <span className="hidden sm:inline">Offline</span>
        </>
      )}
    </div>
  );
}

/* ─── Main component ─── */

export default function OperationsDashboard() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isFetching = useIsFetching();

  const { data: role, isLoading: roleLoading } = useRole();
  const section = (params.get("section") as Section) ?? "overview";

  useEffect(() => {
    if (!role) return;
    if (role === "roaster" && !params.get("section")) setParams({ section: "roasting" });
    if (role === "packaging" && !params.get("section")) setParams({ section: "packaging" });
  }, [role, params, setParams]);

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

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Flame className="w-5 h-5 text-warning" />
          <h1 className="text-base font-medium text-foreground">Operations</h1>
        </div>

        {/* Desktop nav — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
          {visibleNav.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 min-h-[44px] text-sm rounded-md transition-colors whitespace-nowrap",
                section === n.id
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {n.icon}{n.label}
              {n.id === "roasting"  && <RoastingBadge />}
              {n.id === "packaging" && <PackagingBadge />}
              {n.id === "delivery"  && <DeliveryBadge />}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
          <SyncBadge />
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleRefresh} title="Refresh">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching > 0 && "animate-spin")} />
          </Button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="p-4 lg:p-8 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {section === "overview"  && role === "admin"                         && <OverviewSection />}
            {section === "roasting"                                               && <RoastingSection />}
            {section === "packaging"                                              && <PackagingSection />}
            {section === "delivery"  && role === "admin"                         && <DeliveryView role="admin" />}
            {section === "stock"     && (role === "admin" || role === "roaster") && <StockView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <motion.nav
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around px-2 py-1 z-50"
      >
        {visibleNav.map((n) => (
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
              {n.id === "roasting"  && <MobileBadge type="roasting" />}
              {n.id === "packaging" && <MobileBadge type="packaging" />}
              {n.id === "delivery"  && <MobileBadge type="delivery" />}
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
        ))}
      </motion.nav>
    </div>
  );
}

/* ─── Nav badge helpers ─── */

function RoastingBadge() {
  const { data } = useOrderCounts();
  const n = (data?.approved ?? 0) + (data?.packaging ?? 0);
  if (!n) return null;
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{n}</Badge>;
}

function PackagingBadge() {
  const { data } = useOrderCounts();
  const n = data?.packaging ?? 0;
  if (!n) return null;
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{n}</Badge>;
}

function DeliveryBadge() {
  const { data } = useOrderCounts();
  const n = data?.ready_for_delivery ?? 0;
  if (!n) return null;
  return (
    <Badge className="text-[10px] px-1.5 py-0 ml-0.5 bg-warning/20 text-warning border-warning/30">{n}</Badge>
  );
}

function MobileBadge({ type }: { type: "roasting" | "packaging" | "delivery" }) {
  const { data } = useOrderCounts();
  const n = type === "roasting"
    ? (data?.approved ?? 0) + (data?.packaging ?? 0)
    : type === "packaging"
    ? (data?.packaging ?? 0)
    : (data?.ready_for_delivery ?? 0);
  if (!n) return null;
  return (
    <span className={cn(
      "absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-bold flex items-center justify-center px-0.5",
      type === "delivery" ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground"
    )}>
      {n}
    </span>
  );
}

/* ─── Overview section ─── */

function OverviewSection() {
  const { data: metrics } = useOverviewMetrics();
  const { data: pipeline = [] } = useOverviewPipeline();
  const { data: counts } = useOrderCounts();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Orders this week</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{metrics?.ordersThisWeek ?? "—"}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Kg this week</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{metrics ? metrics.kgThisWeek.toFixed(0) : "—"}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Urgent orders</p>
          <p className={cn("text-2xl font-medium tabular-nums", (metrics?.urgentCount ?? 0) > 0 ? "text-destructive" : "text-foreground")}>
            {metrics?.urgentCount ?? "—"}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">In packaging</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{metrics?.pendingPackaging ?? "—"}</p>
        </div>
      </div>

      {counts && (
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Pipeline</p>
          <div className="flex items-stretch gap-1">
            {(["received", "approved", "packaging", "ready_for_delivery", "delivered"] as const).map((s) => (
              <div key={s} className="flex-1 text-center">
                <p className="text-lg font-semibold tabular-nums text-foreground">{counts[s]}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{ORDER_STATUS_LABEL[s]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-foreground">Active orders</p>
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
                      <span className="text-sm font-medium text-foreground">{o.client_name ?? `#${o.id.slice(0, 8)}`}</span>
                      {o.shopify_order_number && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">Shopify</Badge>
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
                    <p className="text-xs text-muted-foreground">{format(parseISO(o.delivery_date), "EEE d MMM")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
