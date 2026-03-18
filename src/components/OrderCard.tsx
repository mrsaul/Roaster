import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/store";

interface OrderCardProps {
  order: Order;
  onReorder?: (order: Order) => void;
}

export function OrderCard({ order, onReorder }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusLabel: Record<string, string> = {
    pending: "Pending",
    confirmed: "Preparing",
    fulfilled: "Delivered",
    synced: "Confirmed",
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Collapsed summary — tap to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold text-foreground">
            {format(parseISO(order.deliveryDate), "EEEE d MMMM")}
          </p>
          <p className="text-xs text-muted-foreground">
            {order.items.length} item{order.items.length !== 1 ? "s" : ""} · {order.totalKg.toFixed(0)} kg
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} sellsyId={order.sellsyId} />
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {/* Info card */}
              <div className="rounded-xl bg-secondary/50 p-3 space-y-1 text-sm">
                <p className="text-foreground">
                  <span className="text-muted-foreground">Status: </span>
                  {statusLabel[order.status] ?? order.status}
                </p>
                {order.sellsyId && (
                  <p className="text-foreground">
                    <span className="text-muted-foreground">Invoice: </span>
                    <span className="font-mono">{order.sellsyId}</span>
                  </p>
                )}
                <p className="text-foreground">
                  <span className="text-muted-foreground">Order date: </span>
                  {format(parseISO(order.createdAt), "dd/MM/yyyy")}
                </p>
                <p className="text-foreground">
                  <span className="text-muted-foreground">Delivery date: </span>
                  {format(parseISO(order.deliveryDate), "dd/MM/yyyy")}
                </p>
              </div>

              {/* Items table */}
              <div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b-2 border-foreground pb-2 text-sm font-semibold text-foreground">
                  <span>Product</span>
                  <span className="text-center">Units/Kgs</span>
                  <span className="text-right">Sub.Total</span>
                </div>
                <div className="divide-y divide-border">
                  {order.items.map((item) => (
                    <div
                      key={item.product.id}
                      className="grid grid-cols-[1fr_auto_auto] gap-x-4 py-3 text-sm"
                    >
                      <span className="font-medium text-foreground">{item.product.name}</span>
                      <span className="text-center tabular-nums text-muted-foreground">
                        {item.quantity} KG
                      </span>
                      <span className="text-right tabular-nums text-foreground">
                        {(item.quantity * item.product.pricePerKg).toFixed(0)}€
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">{order.totalKg.toFixed(0)} kg total</span>
                <span className="font-semibold tabular-nums text-foreground">
                  €{order.totalPrice.toFixed(2)}
                </span>
              </div>

              {/* Reorder button */}
              {onReorder && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReorder(order)}
                    className="rounded-full border-primary/40 text-primary hover:bg-primary/10"
                  >
                    Order again
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
