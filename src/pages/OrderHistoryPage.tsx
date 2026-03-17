import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import type { Order } from "@/lib/store";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { ClipboardList, House, ShoppingBag } from "lucide-react";

interface OrderHistoryPageProps {
  orders: Order[];
  draftItems: Order["items"];
  draftTotalKg: number;
  draftTotalPrice: number;
  draftDeliveryDate: string | null;
  onDraftDeliveryDateChange: (date: string) => void;
  onGoHome: () => void;
  onGoShop: () => void;
  onViewOrders: () => void;
}

export default function OrderHistoryPage({
  orders,
  draftItems,
  draftTotalKg,
  draftTotalPrice,
  draftDeliveryDate,
  onDraftDeliveryDateChange,
  onGoHome,
  onGoShop,
  onViewOrders,
}: OrderHistoryPageProps) {
  const [activeTab, setActiveTab] = useState<"in-progress" | "order-placed">("in-progress");

  const draftOrder: Order | null = draftItems.length > 0
    ? {
        id: "Draft order",
        items: draftItems,
        totalKg: draftTotalKg,
        totalPrice: draftTotalPrice,
        deliveryDate: draftDeliveryDate ?? new Date().toISOString(),
        status: "pending",
        createdAt: new Date().toISOString(),
      }
    : null;

  const groupedOrders = useMemo(() => {
    const inProgressOrders = orders.filter((order) => order.status === "pending" || order.status === "confirmed" || order.status === "fulfilled");

    return {
      inProgress: draftOrder ? [draftOrder, ...inProgressOrders] : inProgressOrders,
      orderPlaced: orders.filter((order) => order.status === "synced"),
    };
  }, [draftOrder, orders]);

  const visibleOrders = activeTab === "in-progress" ? groupedOrders.inProgress : groupedOrders.orderPlaced;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto space-y-4">
          <div>
            <h1 className="text-base font-medium text-foreground">Orders</h1>
            <p className="text-xs text-muted-foreground">Track active and placed orders</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <button
              onClick={() => setActiveTab("in-progress")}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activeTab === "in-progress" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              In progress
            </button>
            <button
              onClick={() => setActiveTab("order-placed")}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activeTab === "order-placed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Order placed
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-32">
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        >
          {visibleOrders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No orders in this section yet.</p>
          )}
          {visibleOrders.map((order) => {
            const isDraft = order.id === "Draft order";

            return (
              <motion.div
                key={`${order.id}-${isDraft ? "draft" : order.createdAt}`}
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                className={cn(
                  "border rounded-lg p-4 space-y-3",
                  isDraft ? "bg-secondary/40 border-primary/30" : "bg-card border-border"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="font-mono text-sm text-foreground">{order.id}</span>
                    {isDraft ? (
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Editable draft</p>
                    ) : null}
                  </div>
                  <StatusBadge status={order.status} sellsyId={order.sellsyId} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isDraft ? "From current cart" : format(parseISO(order.createdAt), "MMM d, yyyy")}
                  </span>
                  <span className="tabular-nums text-foreground font-medium">
                    {order.totalKg.toFixed(1)} kg · €{order.totalPrice.toFixed(2)}
                  </span>
                </div>

                {isDraft ? (
                  <div className="rounded-xl border border-border bg-background/80 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">Delivery date</span>
                      <span className="text-xs text-muted-foreground">
                        {draftDeliveryDate ? format(new Date(`${draftDeliveryDate}T00:00:00`), "EEE, MMM d") : "Select a weekday"}
                      </span>
                    </div>
                    <DeliveryDatePicker selected={draftDeliveryDate} onSelect={onDraftDeliveryDateChange} />
                  </div>
                ) : null}

                <div className="text-xs text-muted-foreground">
                  {order.items.map((item) => (
                    <span key={item.product.id} className="inline-block mr-3">
                      {item.product.name} ({item.quantity}kg)
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </main>
      <div className="fixed inset-x-0 bottom-4 z-50 px-4">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-full border border-border bg-card/95 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <button
            onClick={onGoHome}
            className="flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <House className="h-4 w-4" />
            Home
          </button>
          <button
            onClick={onGoShop}
            className="flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShoppingBag className="h-4 w-4" />
            Shop
          </button>
          <button
            onClick={onViewOrders}
            className="relative flex flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-4 py-3 text-sm font-medium text-foreground"
          >
            <ClipboardList className="h-4 w-4" />
            Orders
            {draftItems.length > 0 ? <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
