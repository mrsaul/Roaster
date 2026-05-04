import { useMemo } from "react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { Truck, Clock3, Weight, CheckSquare, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeliveryOrders, useHandOffToCarrier, type AppRole } from "@/hooks/useOperationsData";

interface DeliveryViewProps {
  role: AppRole;
}

function formatDelivery(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEE d MMM");
  } catch {
    return dateStr;
  }
}

export function DeliveryView({ role }: DeliveryViewProps) {
  const { data: orders = [], isLoading } = useDeliveryOrders();
  const handOff = useHandOffToCarrier();

  // Group by delivery date, today first then ascending
  const groups = useMemo(() => {
    const map = new Map<string, typeof orders>();
    for (const o of orders) {
      const key = o.delivery_date;
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({ date, list }));
  }, [orders]);

  const totalKg = orders.reduce((s, o) => s + o.total_kg, 0);
  const todayCount = orders.filter((o) => isToday(parseISO(o.delivery_date))).length;

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  }

  return (
    <section className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Ready to deliver</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{orders.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Total kg</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{totalKg.toFixed(0)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Due today</p>
          <p className={cn("text-2xl font-medium tabular-nums", todayCount > 0 ? "text-destructive" : "text-foreground")}>
            {todayCount}
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          <Truck className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No orders ready for delivery</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ date, list }) => (
            <div key={date}>
              {/* Date heading */}
              <div className="flex items-center gap-2 mb-2">
                <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {formatDelivery(date)}
                </span>
                <span className="text-xs text-muted-foreground">· {list.length} order{list.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="space-y-2">
                {list.map((order) => (
                  <div key={order.id} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Order info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">
                            {order.client_name ?? `#${order.id.slice(0, 8)}`}
                          </span>
                          {order.shopify_order_number && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
                              Shopify
                            </Badge>
                          )}
                        </div>

                        {/* Items */}
                        <div className="mt-2 space-y-0.5">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Package className="w-3 h-3 shrink-0" />
                              <span>{item.product_name}</span>
                              <span className="tabular-nums">· {item.quantity} kg</span>
                            </div>
                          ))}
                        </div>

                        {/* Checklist dots */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <div className={cn("w-2 h-2 rounded-full", order.is_roasted ? "bg-success" : "bg-border")} />
                            Roasted
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <div className={cn("w-2 h-2 rounded-full", order.is_packed ? "bg-success" : "bg-border")} />
                            Packed
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <div className={cn("w-2 h-2 rounded-full", order.is_labeled ? "bg-success" : "bg-border")} />
                            Labeled
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                            <Weight className="w-3 h-3" />
                            {order.total_kg.toFixed(0)} kg
                          </span>
                        </div>
                      </div>

                      {/* Action — admin only */}
                      {role === "admin" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" className="gap-1.5 shrink-0">
                              <Truck className="w-3.5 h-3.5" /> Hand off
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hand off to carrier?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will mark the order as <span className="font-medium">Delivered</span> and cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handOff.mutate(order.id)}
                                disabled={handOff.isPending}
                              >
                                <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
