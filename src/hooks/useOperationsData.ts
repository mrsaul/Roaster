import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOrderStatus, type OrderStatus } from "@/lib/orderStatuses";

/* ─── Types ─── */

export type AppRole = "admin" | "roaster" | "packaging" | "user";

export interface OrderCounts {
  received: number;
  approved: number;
  packaging: number;
  ready_for_delivery: number;
  delivered: number;
}

export interface OverviewMetrics {
  ordersThisWeek: number;
  kgThisWeek: number;
  urgentCount: number;
  pendingPackaging: number;
}

export interface PipelineOrder {
  id: string;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  shopify_order_number?: string | null;
}

export interface DeliveryOrder {
  id: string;
  user_id: string | null;
  client_name: string | null;       // companies.name or contact full_name or email
  shopify_customer_name: string | null; // shopify_orders.customer_name if no user_id
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  shopify_order_number?: string | null;
  items: { product_name: string; quantity: number }[];
}

export interface RoasterOrderFull {
  id: string;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  shopify_order_number?: string | null;
  items: { product_id: string; product_name: string; quantity: number }[];
}

export interface PackagingOrderFull {
  id: string;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  status: OrderStatus;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  shopify_order_number?: string | null;
  items: { product_name: string; quantity: number; price_per_kg: number }[];
}

/* ─── Query keys ─── */

export const QUERY_KEYS = {
  role: ["role"] as const,
  orderCounts: ["orderCounts"] as const,
  overviewMetrics: ["overviewMetrics"] as const,
  overviewPipeline: ["overviewPipeline"] as const,
  roasterOrders: ["roasterOrders"] as const,
  packagingOrders: ["packagingOrders"] as const,
  deliveryOrders: ["deliveryOrders"] as const,
};

const POLL = { refetchInterval: 30_000, staleTime: 25_000 };

/* ─── Role ─── */

export function useRole() {
  return useQuery({
    queryKey: QUERY_KEYS.role,
    queryFn: async (): Promise<AppRole> => {
      const { data, error } = await supabase.rpc("ensure_current_user_role");
      // On error (e.g. wrong project, no session yet) — fall back to "user"
      // instead of throwing, which would leave the dashboard blank.
      if (error) {
        console.warn("[useRole] RPC error, defaulting to 'user':", error.message);
        return "user";
      }
      return (data as AppRole) ?? "user";
    },
    staleTime: Infinity,
    retry: 2,
  });
}

/* ─── Order counts (pipeline overview) ─── */

export function useOrderCounts() {
  return useQuery({
    queryKey: QUERY_KEYS.orderCounts,
    queryFn: async (): Promise<OrderCounts> => {
      const { data, error } = await supabase
        .from("orders")
        .select("status");
      if (error) throw error;
      const counts: OrderCounts = { received: 0, approved: 0, packaging: 0, ready_for_delivery: 0, delivered: 0 };
      for (const row of data ?? []) {
        const s = normalizeOrderStatus(row.status);
        if (s in counts) counts[s as keyof OrderCounts]++;
      }
      return counts;
    },
    ...POLL,
  });
}

/* ─── Overview metrics ─── */

export function useOverviewMetrics() {
  return useQuery({
    queryKey: QUERY_KEYS.overviewMetrics,
    queryFn: async (): Promise<OverviewMetrics> => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("orders")
        .select("total_kg, delivery_date, status");
      if (error) throw error;

      const now = new Date();
      let ordersThisWeek = 0;
      let kgThisWeek = 0;
      let urgentCount = 0;
      let pendingPackaging = 0;

      for (const o of data ?? []) {
        const delivery = new Date(o.delivery_date);
        if (delivery >= weekStart) {
          ordersThisWeek++;
          kgThisWeek += Number(o.total_kg);
        }
        const hoursUntil = (delivery.getTime() - now.getTime()) / 36e5;
        if (hoursUntil <= 48 && normalizeOrderStatus(o.status) !== "delivered") urgentCount++;
        if (normalizeOrderStatus(o.status) === "packaging") pendingPackaging++;
      }

      return { ordersThisWeek, kgThisWeek, urgentCount, pendingPackaging };
    },
    ...POLL,
  });
}

/* ─── Pipeline (overview tab) ─── */

export function useOverviewPipeline() {
  return useQuery({
    queryKey: QUERY_KEYS.overviewPipeline,
    queryFn: async (): Promise<PipelineOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, delivery_date, total_kg, status, shopify_orders(shopify_order_number)")
        .not("status", "eq", "delivered")
        .order("delivery_date", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((o: any) => ({
        id: o.id,
        client_name: null,
        delivery_date: o.delivery_date,
        total_kg: Number(o.total_kg),
        status: normalizeOrderStatus(o.status),
        shopify_order_number: o.shopify_orders?.[0]?.shopify_order_number ?? null,
      }));
    },
    ...POLL,
  });
}

/* ─── Roaster orders ─── */

export function useRoasterOrders() {
  return useQuery({
    queryKey: QUERY_KEYS.roasterOrders,
    queryFn: async (): Promise<RoasterOrderFull[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, delivery_date, total_kg, status, is_roasted,
          order_items ( product_id, product_name, quantity ),
          shopify_orders ( shopify_order_number )
        `)
        .in("status", ["approved", "packaging"])
        .order("delivery_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((o: any) => ({
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
      }));
    },
    ...POLL,
  });
}

/* ─── Packaging orders ─── */

export function usePackagingOrders() {
  return useQuery({
    queryKey: QUERY_KEYS.packagingOrders,
    queryFn: async (): Promise<PackagingOrderFull[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, delivery_date, total_kg, status, is_roasted, is_packed, is_labeled,
          order_items ( product_name, quantity, price_per_kg ),
          shopify_orders ( shopify_order_number )
        `)
        .eq("status", "packaging")
        .order("delivery_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((o: any) => ({
        id: o.id,
        client_name: null,
        delivery_date: o.delivery_date,
        total_kg: Number(o.total_kg),
        status: normalizeOrderStatus(o.status),
        is_roasted: Boolean(o.is_roasted),
        is_packed: Boolean(o.is_packed),
        is_labeled: Boolean(o.is_labeled),
        shopify_order_number: o.shopify_orders?.[0]?.shopify_order_number ?? null,
        items: (o.order_items ?? []).map((i: any) => ({
          product_name: i.product_name,
          quantity: Number(i.quantity),
          price_per_kg: Number(i.price_per_kg),
        })),
      }));
    },
    ...POLL,
  });
}

/* ─── Delivery orders ─── */

export function useDeliveryOrders() {
  return useQuery({
    queryKey: QUERY_KEYS.deliveryOrders,
    queryFn: async (): Promise<DeliveryOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, user_id, delivery_date, total_kg, status, is_roasted, is_packed, is_labeled,
          order_items ( product_name, quantity ),
          shopify_orders ( shopify_order_number, customer_name )
        `)
        .eq("status", "ready_for_delivery")
        .order("delivery_date", { ascending: true });
      if (error) throw error;

      // Two-step contacts join (contacts.user_id → companies.name)
      const userIds = [...new Set((data ?? []).map((o: any) => o.user_id).filter(Boolean))];
      const { data: contactRows } = userIds.length > 0
        ? await supabase
            .from("contacts")
            .select("user_id, first_name, last_name, email, companies(name)")
            .in("user_id", userIds)
        : { data: [] };
      const profileMap = new Map(
        (contactRows ?? []).map((c: any) => [
          c.user_id,
          {
            id: c.user_id,
            full_name: (c.companies as any)?.name
              ?? [c.first_name, c.last_name].filter(Boolean).join(" ")
              || null,
            email: c.email,
          },
        ])
      );

      return (data ?? []).map((o: any) => {
        const profile = profileMap.get(o.user_id);
        const shopify = o.shopify_orders?.[0];
        return {
          id: o.id,
          user_id: o.user_id ?? null,
          client_name: profile?.full_name || profile?.email || null,
          shopify_customer_name: shopify?.customer_name ?? null,
          delivery_date: o.delivery_date,
          total_kg: Number(o.total_kg),
          status: normalizeOrderStatus(o.status),
          is_roasted: Boolean(o.is_roasted),
          is_packed: Boolean(o.is_packed),
          is_labeled: Boolean(o.is_labeled),
          shopify_order_number: shopify?.shopify_order_number ?? null,
          items: (o.order_items ?? []).map((i: any) => ({
            product_name: i.product_name,
            quantity: Number(i.quantity),
          })),
        };
      });
    },
    ...POLL,
  });
}

/* ─── Mutations ─── */

export function useMarkRoasted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, value }: { orderId: string; value: boolean }) => {
      const patch = value
        ? { is_roasted: true, status: "packaging" as const }
        : { is_roasted: false };
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.roasterOrders });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.orderCounts });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.overviewPipeline });
    },
  });
}

export function useUpdatePackagingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: OrderStatus }) => {
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.packagingOrders });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.deliveryOrders });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.orderCounts });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.overviewPipeline });
    },
  });
}

export function useUpdateChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      field,
      value,
    }: {
      orderId: string;
      field: "is_roasted" | "is_packed" | "is_labeled";
      value: boolean;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ [field]: value } as Record<string, boolean>)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.packagingOrders });
    },
  });
}

export function useHandOffToCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", orderId);
      if (orderError) throw orderError;

      const { error: histError } = await supabase.from("order_status_history").insert({
        order_id: orderId,
        new_status: "delivered",
        changed_by: null,
        note: "Handed off to carrier via Operations Dashboard",
      });
      if (histError) throw histError;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.deliveryOrders });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.orderCounts });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.overviewPipeline });
    },
  });
}
