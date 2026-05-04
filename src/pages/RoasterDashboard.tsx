import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoasterView, type RoasterOrder } from "@/components/RoasterView";
import { StockView } from "@/components/StockView";
import { LogOut, Flame, Warehouse } from "lucide-react";
import { type OrderStatus, normalizeOrderStatus } from "@/lib/orderStatuses";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface RoasterDashboardProps {
  onLogout: () => void;
}

export default function RoasterDashboard({ onLogout }: RoasterDashboardProps) {
  const [orders, setOrders] = useState<RoasterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"orders" | "stock">("orders");
  const { toast } = useToast();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, delivery_date, total_kg, status, is_roasted,
          order_items ( product_id, product_name, quantity ),
          shopify_orders ( shopify_order_number )
        `)
        .order("delivery_date", { ascending: true });
      if (error) throw error;
      setOrders(
        (data ?? []).map((o: any) => ({
          id: o.id,
          client_name: null,
          delivery_date: o.delivery_date,
          total_kg: Number(o.total_kg),
          status: normalizeOrderStatus(o.status),
          is_roasted: Boolean(o.is_roasted),
          shopify_order_number: o.shopify_orders?.[0]?.shopify_order_number ?? null,
          items: (o.order_items ?? []).map((i: any) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: Number(i.quantity),
          })),
        })),
      );
    } catch (err) {
      toast({ title: "Failed to load orders", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleMarkRoasted = useCallback(async (orderId: string, value: boolean) => {
    try {
      const patch = value
        ? { is_roasted: value, status: "packaging" as const }
        : { is_roasted: value };
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, is_roasted: value, ...(value ? { status: "packaging" as OrderStatus } : {}) }
            : o,
        ),
      );
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Flame className="w-5 h-5 text-warning" />
          <h1 className="text-base font-medium text-foreground">Roaster View</h1>
        </div>
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setSection("orders")}
            className={cn(
              "px-3 min-h-[44px] text-sm rounded-md transition-colors",
              section === "orders"
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Orders
          </button>
          <button
            onClick={() => setSection("stock")}
            className={cn(
              "flex items-center gap-1.5 px-3 min-h-[44px] text-sm rounded-md transition-colors",
              section === "stock"
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Warehouse className="w-3.5 h-3.5" />
            Stock
          </button>
        </nav>
        <button onClick={onLogout} className="flex items-center gap-2 px-3 min-h-[44px] text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </header>
      <main className="p-4 lg:p-8 max-w-6xl mx-auto">
        {section === "stock" ? (
          <StockView />
        ) : loading ? (
          <p className="text-center text-muted-foreground py-8">Loading…</p>
        ) : (
          <RoasterView orders={orders} onMarkRoasted={handleMarkRoasted} />
        )}
      </main>
    </div>
  );
}
