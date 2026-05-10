import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { Truck, CheckCircle2, Circle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeliveryOrders, useHandOffToCarrier } from "@/hooks/useOperationsData";
import type { AppRole } from "@/hooks/useOperationsData";

/* ─── helpers ─── */

function dateHeading(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

function customerLabel(order: {
  client_name: string | null;
  shopify_customer_name: string | null;
  shopify_order_number?: string | null;
}): string {
  if (order.client_name) return order.client_name;
  if (order.shopify_customer_name) return order.shopify_customer_name;
  if (order.shopify_order_number) return `#${order.shopify_order_number}`;
  return "—";
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${done ? "text-success" : "text-muted-foreground"}`}>
      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
      {label}
    </span>
  );
}

/* ─── Component ─── */

interface DeliveryViewProps {
  role: AppRole;
}

export default function DeliveryView({ role }: DeliveryViewProps) {
  const { data: orders = [], isLoading } = useDeliveryOrders();
  const handOff = useHandOffToCarrier();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Loading delivery orders…
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
        <Truck className="w-8 h-8 opacity-40" />
        <p className="text-sm">No orders ready for delivery</p>
      </div>
    );
  }

  // Group by delivery_date
  const grouped = new Map<string, typeof orders>();
  for (const o of orders) {
    const list = grouped.get(o.delivery_date) ?? [];
    list.push(o);
    grouped.set(o.delivery_date, list);
  }

  const canHandOff = role === "admin";

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([date, dayOrders]) => (
        <section key={date}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {dateHeading(date)}
            <span className="ml-2 normal-case font-normal">
              — {dayOrders.length} order{dayOrders.length !== 1 ? "s" : ""}
            </span>
          </h2>

          <div className="space-y-3">
            {dayOrders.map((order) => (
              <div
                key={order.id}
                className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                {/* Left: order info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm truncate">
                      {customerLabel(order)}
                    </span>
                    {order.shopify_order_number && (
                      <Badge variant="outline" className="text-xs font-mono">
                        #{order.shopify_order_number}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {order.total_kg} kg
                    </Badge>
                  </div>

                  {/* Items */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                    {order.items.map((item, idx) => (
                      <span key={idx} className="text-xs text-muted-foreground">
                        <Package className="w-3 h-3 inline mr-0.5" />
                        {item.product_name} × {item.quantity}
                      </span>
                    ))}
                  </div>

                  {/* Checklist badges */}
                  <div className="flex gap-3 flex-wrap">
                    <CheckItem done={order.is_roasted} label="Roasted" />
                    <CheckItem done={order.is_packed} label="Packed" />
                    <CheckItem done={order.is_labeled} label="Labeled" />
                  </div>
                </div>

                {/* Right: action */}
                {canHandOff && (
                  <Button
                    size="sm"
                    variant="default"
                    className="shrink-0 gap-1.5"
                    disabled={handOff.isPending}
                    onClick={() => handOff.mutate(order.id)}
                  >
                    <Truck className="w-4 h-4" />
                    Handed off to carrier
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
