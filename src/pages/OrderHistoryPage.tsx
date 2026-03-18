import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/store";
import { format, getDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { ClipboardList, House, ShoppingBag, X } from "lucide-react";
import { OrderCard } from "@/components/OrderCard";

interface OrderHistoryPageProps {
  orders: Order[];
  draftItems: Order["items"];
  draftTotalKg: number;
  draftTotalPrice: number;
  draftDeliveryDate: string | null;
  onDraftDeliveryDateChange: (date: string) => void;
  onRemoveDraftItem: (productId: string) => void;
  onDraftQuantityChange: (productId: string, nextQuantity: number) => void;
  onPlaceDraftOrder: () => void;
  onGoHome: () => void;
  onGoShop: () => void;
  onViewOrders: () => void;
}

function getDefaultDeliveryCopy() {
  return "Friday · daytime delivery";
}

function getEstimatedDeliveryLabel(selectedDate: string | null) {
  if (!selectedDate) {
    return getDefaultDeliveryCopy();
  }

  return `${format(new Date(`${selectedDate}T00:00:00`), "EEEE d MMMM")} · daytime delivery`;
}

function getDeliveryHint(selectedDate: string | null) {
  if (!selectedDate) {
    return "Choose a Tuesday or Friday delivery slot.";
  }

  const day = getDay(new Date(`${selectedDate}T00:00:00`));
  return day === 2 ? "Tuesday route · daytime delivery" : "Friday route · daytime delivery";
}

export default function OrderHistoryPage({
  orders,
  draftItems,
  draftTotalKg,
  draftTotalPrice,
  draftDeliveryDate,
  onDraftDeliveryDateChange,
  onRemoveDraftItem,
  onDraftQuantityChange,
  onPlaceDraftOrder,
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
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg space-y-3">
          <div>
            <h1 className="text-base font-medium text-foreground">Orders</h1>
            <p className="text-xs text-muted-foreground">Track active and placed orders</p>
          </div>

          <div className="grid grid-cols-2 gap-6 border-b border-border/80 px-2">
            <button
              onClick={() => setActiveTab("in-progress")}
              className={cn(
                "border-b-[3px] pb-2 text-left text-sm font-medium transition-colors",
                activeTab === "in-progress" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              In progress
            </button>
            <button
              onClick={() => setActiveTab("order-placed")}
              className={cn(
                "border-b-[3px] pb-2 text-left text-sm font-medium transition-colors",
                activeTab === "order-placed" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Order placed
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4 pb-40">
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        >
          {visibleOrders.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">No orders in this section yet.</p>
          )}

          {visibleOrders.map((order) => {
            const isDraft = order.id === "Draft order";

            if (isDraft) {
              return (
                <motion.section
                  key="draft-order"
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                  className="space-y-3"
                >
                  <div className="space-y-1 px-1">
                    <p className="text-lg font-semibold tracking-tight text-foreground">
                      Delivering: {getEstimatedDeliveryLabel(draftDeliveryDate)}
                    </p>
                    <p className="text-sm text-muted-foreground">{getDeliveryHint(draftDeliveryDate)}</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                    <div className="space-y-2 rounded-xl border border-border bg-background/80 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">Delivery date</span>
                        <span className="text-xs text-muted-foreground">
                          {draftDeliveryDate ? format(new Date(`${draftDeliveryDate}T00:00:00`), "EEE, MMM d") : "Tue or Fri only"}
                        </span>
                      </div>
                      <DeliveryDatePicker selected={draftDeliveryDate} onSelect={onDraftDeliveryDateChange} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <motion.article
                        key={item.product.id}
                        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                        className="rounded-[1.5rem] border-2 border-foreground bg-card p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <h2 className="text-xl font-semibold uppercase leading-tight tracking-tight text-foreground">
                              {item.product.name}
                            </h2>
                            <p className="text-base font-semibold text-foreground">
                              €{item.product.pricePerKg.toFixed(0)}/kg
                              <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                3kg units
                              </span>
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{item.product.roastLevel}</span>
                              <span aria-hidden="true">•</span>
                              <span>{item.product.origin}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveDraftItem(item.product.id)}
                            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label={`Remove ${item.product.name}`}
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-[1.4fr_auto_auto_auto] overflow-hidden rounded-xl border border-primary/40 bg-background">
                          <button
                            type="button"
                            onClick={() => onDraftQuantityChange(item.product.id, Math.max(0, item.quantity - 3))}
                            className="flex items-center justify-center px-3 py-2.5 text-lg font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-secondary"
                          >
                            Order
                          </button>
                          <button
                            type="button"
                            onClick={() => onDraftQuantityChange(item.product.id, Math.max(0, item.quantity - 3))}
                            className="flex items-center justify-center border-l border-primary/40 px-4 py-2.5 text-xl font-semibold text-foreground transition-colors hover:bg-secondary"
                            aria-label={`Decrease ${item.product.name} quantity`}
                          >
                            –
                          </button>
                          <div className="flex items-center justify-center border-l border-primary/40 px-4 py-2.5 text-xl font-semibold text-foreground">
                            {item.quantity}
                          </div>
                          <button
                            type="button"
                            onClick={() => onDraftQuantityChange(item.product.id, item.quantity + 3)}
                            className="flex items-center justify-center border-l border-primary/40 px-4 py-2.5 text-xl font-semibold text-foreground transition-colors hover:bg-secondary"
                            aria-label={`Increase ${item.product.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                      </motion.article>
                    ))}
                  </div>

                  <div className="space-y-3 px-1 pt-1">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{draftTotalKg.toFixed(0)} kg total</span>
                      <span className="font-semibold text-foreground">€{draftTotalPrice.toFixed(2)}</span>
                    </div>
                    <Button size="lg" onClick={onPlaceDraftOrder} className="h-14 w-full rounded-2xl text-lg font-semibold uppercase tracking-[0.16em]">
                      Order
                    </Button>
                  </div>
                </motion.section>
              );
            }

            return <OrderCard key={`${order.id}-${order.createdAt}`} order={order} />;
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
