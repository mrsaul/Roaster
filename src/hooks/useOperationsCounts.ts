import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OperationsCounts {
  ordersToday: number;
  roasting: number;        // approved + is_roasted=false
  packaging: number;       // status='packaging'
  delivery: number;        // status='ready_for_delivery'
  lowStock: number;        // roasted_stock rows below threshold
  lastShopifySync: string | null; // ISO timestamp of latest shopify_orders.received_at
  ordersActive: number;    // status != 'delivered' AND created_at >= today 00:00
}

const REFETCH = { refetchInterval: 30_000, staleTime: 25_000 };

/* ─── Main counts hook ─── */

export function useOperationsCounts() {
  return useQuery({
    queryKey: ["operationsCounts"],
    queryFn: async (): Promise<OperationsCounts> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Single orders query — compute all order-based counts client-side
      const [ordersResult, stockResult, shopifyResult] = await Promise.all([
        supabase
          .from("orders")
          .select("status, is_roasted, created_at")
          .neq("status", "delivered"),

        // roasted_stock via any cast (table not in auto-generated types)
        (supabase as any)
          .from("roasted_stock")
          .select("quantity_kg, low_stock_threshold_kg"),

        supabase
          .from("shopify_orders" as any)
          .select("received_at")
          .order("received_at", { ascending: false })
          .limit(1),
      ]);

      const orders = (ordersResult.data ?? []) as {
        status: string;
        is_roasted: boolean;
        created_at: string;
      }[];

      let ordersToday = 0;
      let ordersActive = 0;
      let roasting = 0;
      let packaging = 0;
      let delivery = 0;

      for (const o of orders) {
        if (new Date(o.created_at) >= todayStart) ordersToday++;
        if (new Date(o.created_at) >= todayStart && o.status !== "delivered") ordersActive++;
        if (o.status === "approved" && !o.is_roasted) roasting++;
        if (o.status === "packaging") packaging++;
        if (o.status === "ready_for_delivery") delivery++;
      }

      const stockRows = (stockResult.data ?? []) as {
        quantity_kg: number | null;
        low_stock_threshold_kg: number | null;
      }[];

      const lowStock = stockRows.filter(
        (r) =>
          r.quantity_kg !== null &&
          r.low_stock_threshold_kg !== null &&
          r.quantity_kg < r.low_stock_threshold_kg
      ).length;

      const shopifyRows = (shopifyResult.data ?? []) as { received_at: string }[];
      const lastShopifySync = shopifyRows[0]?.received_at ?? null;

      return { ordersToday, roasting, packaging, delivery, lowStock, lastShopifySync, ordersActive };
    },
    ...REFETCH,
  });
}
