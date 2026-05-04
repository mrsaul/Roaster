import { useMemo, useState } from "react";
import { format, parseISO, differenceInHours, isToday, isTomorrow, addDays, startOfDay, endOfDay } from "date-fns";
import { Flame, ChevronDown, ChevronRight, Clock3, Package, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { type OrderStatus } from "@/lib/orderStatuses";

/* ─── Types ─── */

export interface RoasterOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
}

export interface RoasterOrder {
  id: string;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  shopify_order_number?: string | null;
  items: RoasterOrderItem[];
}

interface RoasterViewProps {
  orders: RoasterOrder[];
  onMarkRoasted: (orderId: string, value: boolean) => void;
}

type DateFilter = "all" | "today" | "tomorrow" | "this_week";

/* ─── Helpers ─── */

function getPriority(deliveryDate: string): "urgent" | "normal" | "low" {
  const diff = differenceInHours(parseISO(deliveryDate), new Date());
  if (diff <= 48) return "urgent";
  if (diff <= 96) return "normal";
  return "low";
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  normal: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

const RELEVANT_STATUSES: OrderStatus[] = ["approved", "packaging"];

/* ─── Component ─── */

export function RoasterView({ orders, onMarkRoasted }: RoasterViewProps) {
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [roastedKgInput, setRoastedKgInput] = useState<Record<string, string>>({});

  // Filter orders to relevant statuses
  const relevantOrders = useMemo(() => {
    let filtered = orders.filter((o) => RELEVANT_STATUSES.includes(o.status));

    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((o) => {
        const d = parseISO(o.delivery_date);
        if (dateFilter === "today") return isToday(d);
        if (dateFilter === "tomorrow") return isTomorrow(d);
        if (dateFilter === "this_week") {
          const weekEnd = endOfDay(addDays(startOfDay(now), 7));
          return d <= weekEnd;
        }
        return true;
      });
    }

    return filtered;
  }, [orders, dateFilter]);

  // Aggregate by product
  const productGroups = useMemo(() => {
    const map = new Map<string, {
      productId: string;
      productName: string;
      totalKg: number;
      roastedKg: number;
      orderCount: number;
      earliestDelivery: string;
      priority: "urgent" | "normal" | "low";
      orders: {
        orderId: string;
        clientName: string;
        quantity: number;
        deliveryDate: string;
        status: OrderStatus;
        isRoasted: boolean;
        shopifyOrderNumber: string | null;
      }[];
    }>();

    for (const order of relevantOrders) {
      for (const item of order.items) {
        const existing = map.get(item.product_id);
        const orderEntry = {
          orderId: order.id,
          clientName: order.client_name || "Unknown",
          quantity: item.quantity,
          deliveryDate: order.delivery_date,
          status: order.status,
          isRoasted: order.is_roasted,
          shopifyOrderNumber: order.shopify_order_number ?? null,
        };

        if (existing) {
          existing.totalKg += item.quantity;
          if (order.is_roasted) existing.roastedKg += item.quantity;
          existing.orderCount += 1;
          if (order.delivery_date < existing.earliestDelivery) {
            existing.earliestDelivery = order.delivery_date;
          }
          existing.orders.push(orderEntry);
        } else {
          map.set(item.product_id, {
            productId: item.product_id,
            productName: item.product_name,
            totalKg: item.quantity,
            roastedKg: order.is_roasted ? item.quantity : 0,
            orderCount: 1,
            earliestDelivery: order.delivery_date,
            priority: "low",
            orders: [orderEntry],
          });
        }
      }
    }

    // Set priority based on earliest delivery
    const groups = Array.from(map.values()).map((g) => ({
      ...g,
      priority: getPriority(g.earliestDelivery),
    }));

    // Sort: urgent first, then by earliest delivery
    groups.sort((a, b) => {
      const pOrder = { urgent: 0, normal: 1, low: 2 };
      if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
      return a.earliestDelivery.localeCompare(b.earliestDelivery);
    });

    return groups;
  }, [relevantOrders]);

  // Summary stats
  const totalKgToRoast = productGroups.reduce((s, g) => s + g.totalKg, 0);
  const totalRoastedKg = productGroups.reduce((s, g) => s + g.roastedKg, 0);
  const urgentCount = productGroups.filter((g) => g.priority === "urgent").length;

  const formatDeliveryLabel = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      if (isToday(d)) return "Today";
      if (isTomorrow(d)) return "Tomorrow";
      return format(d, "EEE, MMM d");
    } catch {
      return dateStr;
    }
  };

  const suggestBatches = (kg: number) => {
    if (kg <= 15) return null;
    const batchSize = kg <= 30 ? 15 : 20;
    const batches = Math.ceil(kg / batchSize);
    return `${batches} batches of ~${(kg / batches).toFixed(0)} kg`;
  };

  const toggleExpand = (productId: string) => {
    setExpandedProduct((prev) => (prev === productId ? null : productId));
  };

  return (
    <section className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Total to roast</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{totalKgToRoast.toFixed(0)} kg</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Roasted</p>
          <p className="text-2xl font-medium tabular-nums text-success">{totalRoastedKg.toFixed(0)} kg</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Remaining</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{(totalKgToRoast - totalRoastedKg).toFixed(0)} kg</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Urgent coffees</p>
          <p className={cn("text-2xl font-medium tabular-nums", urgentCount > 0 ? "text-destructive" : "text-foreground")}>
            {urgentCount}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 items-center">
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Delivery date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="this_week">This week</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {productGroups.length} coffee{productGroups.length !== 1 ? "s" : ""} · {relevantOrders.length} order{relevantOrders.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Product list */}
      {productGroups.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Flame className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No coffees to roast right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {productGroups.map((group) => {
            const isExpanded = expandedProduct === group.productId;
            const remainingKg = group.totalKg - group.roastedKg;
            const progressPct = group.totalKg > 0 ? (group.roastedKg / group.totalKg) * 100 : 0;
            const batchSuggestion = suggestBatches(remainingKg);

            return (
              <div key={group.productId} className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Product row */}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(group.productId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate">{group.productName}</span>
                      <Badge variant="outline" className={cn("text-[10px]", PRIORITY_STYLES[group.priority])}>
                        {group.priority === "urgent" && <AlertCircle className="w-3 h-3 mr-0.5" />}
                        {group.priority.charAt(0).toUpperCase() + group.priority.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" /> {group.orderCount} order{group.orderCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock3 className="w-3 h-3" /> {formatDeliveryLabel(group.earliestDelivery)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{group.totalKg.toFixed(0)} kg</p>
                    {group.roastedKg > 0 && (
                      <p className="text-xs text-success">{group.roastedKg.toFixed(0)} kg roasted</p>
                    )}
                  </div>
                </button>

                {/* Progress bar */}
                {group.roastedKg > 0 && (
                  <div className="px-4 pb-2">
                    <Progress value={progressPct} className="h-1.5" />
                  </div>
                )}

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Batching insight */}
                    {batchSuggestion && remainingKg > 0 && (
                      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
                        <Flame className="w-3 h-3 text-warning" />
                        <span>Suggest: {batchSuggestion}</span>
                      </div>
                    )}

                    {/* Order breakdown */}
                    <div className="divide-y divide-border">
                      {group.orders.map((o) => (
                        <div key={o.orderId} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium text-foreground truncate">{o.clientName}</p>
                              {o.shopifyOrderNumber && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
                                  Shopify
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span>{o.quantity} kg</span>
                              <span>·</span>
                              <span>{formatDeliveryLabel(o.deliveryDate)}</span>
                              <span>·</span>
                              <span className="capitalize">{o.status.replace(/_/g, " ")}</span>
                            </div>
                          </div>
                          <Button
                            variant={o.isRoasted ? "secondary" : "outline"}
                            size="sm"
                            className="gap-1.5 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkRoasted(o.orderId, !o.isRoasted);
                            }}
                          >
                            {o.isRoasted ? (
                              <><Check className="w-3.5 h-3.5 text-success" /> Roasted</>
                            ) : (
                              <><Flame className="w-3.5 h-3.5" /> Mark Roasted</>
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Summary footer */}
                    <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {group.roastedKg.toFixed(0)} / {group.totalKg.toFixed(0)} kg roasted
                      </span>
                      <div className="flex items-center gap-2">
                        {remainingKg > 0 ? (
                          <>
                            <span className="font-medium text-foreground">{remainingKg.toFixed(0)} kg remaining</span>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs">
                                  <Flame className="w-3 h-3" /> Mark All Roasted
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Mark all as roasted?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will mark {group.orders.filter((o) => !o.isRoasted).length} order{group.orders.filter((o) => !o.isRoasted).length !== 1 ? "s" : ""} of <span className="font-medium">{group.productName}</span> ({remainingKg.toFixed(0)} kg) as roasted.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => {
                                    group.orders.filter((o) => !o.isRoasted).forEach((o) => onMarkRoasted(o.orderId, true));
                                  }}>
                                    Confirm
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : (
                          <span className="font-medium text-success flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> All roasted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
