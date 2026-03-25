import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoasterView, type RoasterOrder } from "@/components/RoasterView";
import { LogOut, Flame } from "lucide-react";
import { type OrderStatus, normalizeOrderStatus } from "@/lib/orderStatuses";
import { useToast } from "@/components/ui/use-toast";

interface RoasterDashboardProps {
  onLogout: () => void;
}

export default function RoasterDashboard({ onLogout }: RoasterDashboardProps) {
  const [orders, setOrders] = useState<RoasterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, delivery_date, total_kg, status, is_roasted,
          order_items ( product_id, product_name, quantity )
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
      const { error } = await supabase.from("orders").update({ is_roasted: value }).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, is_roasted: value } : o));
      if (value) {
        await supabase.from("orders").update({ status: "packaging" }).eq("id", orderId);
        setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: "packaging" as OrderStatus } : o));
      }
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-warning" />
          <h1 className="text-base font-medium text-foreground">Roaster View</h1>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </header>
      <main className="p-4 lg:p-8 max-w-6xl mx-auto">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading…</p>
        ) : (
          <RoasterView orders={orders} onMarkRoasted={handleMarkRoasted} />
        )}
      </main>
    </div>
  );
}
