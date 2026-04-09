import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PackagingView, type PackagingOrder } from "@/components/PackagingView";
import { LogOut, Package } from "lucide-react";
import { type OrderStatus, normalizeOrderStatus } from "@/lib/orderStatuses";
import { useToast } from "@/components/ui/use-toast";

interface PackagingDashboardProps {
  onLogout: () => void;
}

export default function PackagingDashboard({ onLogout }: PackagingDashboardProps) {
  const [orders, setOrders] = useState<PackagingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, delivery_date, total_kg, status, is_roasted, is_packed, is_labeled,
          order_items ( product_name, quantity, price_per_kg )
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
          is_packed: Boolean(o.is_packed),
          is_labeled: Boolean(o.is_labeled),
          items: (o.order_items ?? []).map((i: any) => ({
            product_name: i.product_name,
            quantity: Number(i.quantity),
            price_per_kg: Number(i.price_per_kg),
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

  const handleStatusChange = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    try {
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      toast({ title: "Status update failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  const handleChecklistChange = useCallback(async (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => {
    try {
      const { error } = await supabase.from("orders").update({ [field]: value } as { is_roasted?: boolean; is_packed?: boolean; is_labeled?: boolean }).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, [field]: value } : o));
    } catch (err) {
      toast({ title: "Update failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-info" />
          <h1 className="text-base font-medium text-foreground">Packaging View</h1>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </header>
      <main className="p-4 lg:p-8 max-w-6xl mx-auto">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading…</p>
        ) : (
          <PackagingView
            orders={orders}
            onStatusChange={handleStatusChange}
            onChecklistChange={handleChecklistChange}
          />
        )}
      </main>
    </div>
  );
}
