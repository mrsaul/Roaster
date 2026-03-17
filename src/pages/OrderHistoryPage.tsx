import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StatusBadge } from "@/components/StatusBadge";
import type { Order } from "@/lib/store";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { ClipboardList, House, ShoppingBag } from "lucide-react";

interface OrderHistoryPageProps {
  orders: Order[];
  onGoHome: () => void;
  onGoShop: () => void;
  onViewOrders: () => void;
}

export default function OrderHistoryPage({ orders, onGoHome, onGoShop, onViewOrders }: OrderHistoryPageProps) {
  const [activeTab, setActiveTab] = useState<"in-progress" | "order-placed">("order-placed");

  const groupedOrders = useMemo(() => {
    return {
      inProgress: orders.filter((order) => order.status === "pending" || order.status === "confirmed" || order.status === "fulfilled"),
      orderPlaced: orders.filter((order) => order.status === "synced"),
    };
  }, [orders]);

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
          {visibleOrders.map((order) => (
            <motion.div
              key={order.id}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              className="bg-card border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-foreground">{order.id}</span>
                <StatusBadge status={order.status} sellsyId={order.sellsyId} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {format(parseISO(order.createdAt), "MMM d, yyyy")}
                </span>
                <span className="tabular-nums text-foreground font-medium">
                  {order.totalKg.toFixed(1)} kg · €{order.totalPrice.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {order.items.map((item) => (
                  <span key={item.product.id} className="inline-block mr-3">
                    {item.product.name} ({item.quantity}kg)
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
