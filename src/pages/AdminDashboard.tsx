import { useEffect, useMemo, useState, useCallback } from "react";
import { InvoicingView, type InvoicingOrder, type InvoicingStatus } from "@/components/InvoicingView";
import { UserManagementView } from "@/components/UserManagementView";
import {
  LogOut, Users, Package, Coffee, BadgeEuro,
  RefreshCw, AlertCircle, CheckCircle2, Clock3,
  Calendar, Search, X, Check, Send, RotateCcw, Truck,
  Plus, Minus, Trash2, Flame, FileText,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, isToday, differenceInHours } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AdminClientsSection } from "@/components/AdminClientsSection";
import { AdminProductDetail, type AdminProduct } from "@/components/AdminProductDetail";
import { AdminClientDetail, type AppClient } from "@/components/AdminClientDetail";
import { PackagingView, type PackagingOrder } from "@/components/PackagingView";
import { RoasterView, type RoasterOrder } from "@/components/RoasterView";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_CLASS,
  normalizeOrderStatus, type OrderStatus,
} from "@/lib/orderStatuses";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ─── Types ─── */

type AdminProductRow = {
  id: string;
  sellsy_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  is_active: boolean;
  synced_at: string;
  image_url: string | null;
  tags: string[];
  tasting_notes: string | null;
  process: string | null;
  data_source_mode: string;
  custom_name: string | null;
  custom_price_per_kg: number | null;
};

type ProductParseError = {
  sellsy_id: string | null;
  sku: string | null;
  name: string | null;
  message: string;
  available_keys: string[];
};

type SyncRunRow = {
  id: string;
  status: string;
  synced_count: number;
  parse_errors: ProductParseError[] | null;
  completed_at: string;
  created_at: string;
};

type AdminOrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  price_per_kg: number;
};

type AdminOrder = {
  id: string;
  user_id: string;
  user_email: string | null;
  client_name: string | null;
  delivery_date: string;
  total_kg: number;
  total_price: number;
  status: OrderStatus;
  sellsy_id: string | null;
  created_at: string;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  invoicing_status: InvoicingStatus;
  last_invoice_sync: string | null;
  items: AdminOrderItem[];
};

interface AdminDashboardProps {
  orders?: unknown[];
  onLogout: () => void;
}

/* ─── Helpers ─── */

function formatDate(value: string | null) {
  if (!value) return "—";
  try { return format(parseISO(value), "MMM d, yyyy"); } catch { return "—"; }
}

/* ─── Component ─── */

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [activeSection, setActiveSection] = useState<"orders" | "packaging" | "roaster" | "clients" | "products" | "invoicing" | "team">("orders");
  const [invoiceSendingIds, setInvoiceSendingIds] = useState<Set<string>>(new Set());
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"created_at" | "delivery_date" | "total_price">("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  // Clients
  const [clients, setClients] = useState<AppClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<AppClient | null>(null);

  // Products
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [runningProductSync, setRunningProductSync] = useState(false);
  const [syncRun, setSyncRun] = useState<SyncRunRow | null>(null);
  const [syncRunError, setSyncRunError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);

  const { toast } = useToast();

  /* ── Load orders ── */
  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, user_id, delivery_date, total_kg, total_price, status, sellsy_id, created_at,
          is_roasted, is_packed, is_labeled, invoicing_status, last_invoice_sync,
          order_items ( id, product_id, product_name, product_sku, quantity, price_per_kg )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((o: any) => o.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const mapped: AdminOrder[] = ((data ?? []) as any[]).map((o) => {
        const profile = profileMap.get(o.user_id);
        return {
          id: o.id,
          user_id: o.user_id,
          user_email: profile?.email ?? null,
          client_name: profile?.full_name || profile?.email || null,
          delivery_date: o.delivery_date,
          total_kg: Number(o.total_kg),
          total_price: Number(o.total_price),
          status: normalizeOrderStatus(o.status),
          sellsy_id: o.sellsy_id,
          created_at: o.created_at,
          is_roasted: Boolean(o.is_roasted),
          is_packed: Boolean(o.is_packed),
          is_labeled: Boolean(o.is_labeled),
          invoicing_status: (o.invoicing_status as InvoicingStatus) ?? "not_sent",
          last_invoice_sync: o.last_invoice_sync ?? null,
          items: (o.order_items ?? []).map((i: any) => ({
            id: i.id,
            product_id: i.product_id,
            product_name: i.product_name,
            product_sku: i.product_sku,
            quantity: Number(i.quantity),
            price_per_kg: Number(i.price_per_kg),
          })),
        };
      });

      setAdminOrders(mapped);
    } catch (err) {
      toast({ title: "Failed to load orders", description: String(err), variant: "destructive" });
    } finally {
      setLoadingOrders(false);
    }
  }, [toast]);

  /* ── Change order status ── */
  const changeOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus) => {
    try {
      const { error: updateErr } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);
      if (updateErr) throw updateErr;

      // Log status history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("order_status_history").insert({
          order_id: orderId,
          status: newStatus,
          changed_by: user.id,
        });
      }

      setAdminOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
      toast({ title: `Status → ${ORDER_STATUS_LABEL[newStatus]}` });
    } catch (err) {
      toast({ title: "Status update failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  /* ── Update checklist ── */
  const updateChecklist = useCallback(async (orderId: string, field: "is_roasted" | "is_packed" | "is_labeled", value: boolean) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ [field]: value })
        .eq("id", orderId);
      if (error) throw error;

      setAdminOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, [field]: value } : o));
    } catch (err) {
      toast({ title: "Checklist update failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  /* ── Approve order (with Sellsy sync) ── */
  const approveOrder = useCallback(async (order: AdminOrder) => {
    setApprovingIds((prev) => new Set(prev).add(order.id));
    try {
      await changeOrderStatus(order.id, "approved");

      // Lookup sellsy_client_id from client_onboarding
      const { data: clientRow } = await supabase
        .from("client_onboarding")
        .select("sellsy_client_id")
        .eq("user_id", order.user_id)
        .maybeSingle();

      const { data: sellsyResult, error: sellsyErr } = await supabase.functions.invoke("sellsy-sync", {
        body: {
          mode: "create-order",
          orderId: order.id,
          deliveryDate: order.delivery_date,
          createdAt: order.created_at,
          sellsy_client_id: clientRow?.sellsy_client_id ?? null,
          items: order.items.map((i) => ({
            name: i.product_name,
            sku: i.product_sku,
            quantity: i.quantity,
            pricePerKg: i.price_per_kg,
          })),
          totalKg: order.total_kg,
          totalPrice: order.total_price,
        },
      });

      if (sellsyErr || !sellsyResult?.success) {
        toast({
          title: "Sellsy sync failed",
          description: sellsyResult?.error || sellsyErr?.message || "Unknown error",
          variant: "destructive",
        });
      } else {
        await supabase
          .from("orders")
          .update({ sellsy_id: sellsyResult.sellsyId ?? sellsyResult.sellsy_id ?? null })
          .eq("id", order.id);
      }

      await loadOrders();
    } catch (err) {
      toast({ title: "Approve failed", description: String(err), variant: "destructive" });
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }, [changeOrderStatus, loadOrders, toast]);

  /* ── Bulk approve ── */
  const approveAllReceived = useCallback(async () => {
    const received = adminOrders.filter((o) => o.status === "received");
    if (received.length === 0) return;
    for (const r of received) {
      await approveOrder(r);
    }
  }, [adminOrders, approveOrder]);

  /* ── Send invoice to Sellsy ── */
  const sendInvoiceToSellsy = useCallback(async (orderId: string) => {
    setInvoiceSendingIds((prev) => new Set(prev).add(orderId));
    try {
      const order = adminOrders.find((o) => o.id === orderId);
      if (!order) throw new Error("Order not found");
      if (order.invoicing_status === "sent") throw new Error("Already sent");

      const { data: clientRow } = await supabase
        .from("client_onboarding")
        .select("sellsy_client_id")
        .eq("user_id", order.user_id)
        .maybeSingle();

      const { data: sellsyResult, error: sellsyErr } = await supabase.functions.invoke("sellsy-sync", {
        body: {
          mode: "create-order",
          orderId: order.id,
          deliveryDate: order.delivery_date,
          createdAt: order.created_at,
          sellsy_client_id: clientRow?.sellsy_client_id ?? null,
          items: order.items.map((i) => ({
            name: i.product_name,
            sku: i.product_sku,
            quantity: i.quantity,
            pricePerKg: i.price_per_kg,
          })),
          totalKg: order.total_kg,
          totalPrice: order.total_price,
        },
      });

      if (sellsyErr || !sellsyResult?.success) {
        await supabase.from("orders").update({
          invoicing_status: "error",
          last_invoice_sync: new Date().toISOString(),
        }).eq("id", orderId);
        setAdminOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, invoicing_status: "error" as InvoicingStatus, last_invoice_sync: new Date().toISOString() } : o));
        toast({
          title: "Invoice send failed",
          description: sellsyResult?.error || sellsyErr?.message || "Unknown error",
          variant: "destructive",
        });
      } else {
        const sellsyId = sellsyResult.sellsyId ?? sellsyResult.sellsy_id ?? null;
        await supabase.from("orders").update({
          sellsy_id: sellsyId,
          invoicing_status: "sent",
          last_invoice_sync: new Date().toISOString(),
        }).eq("id", orderId);
        setAdminOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, sellsy_id: sellsyId, invoicing_status: "sent" as InvoicingStatus, last_invoice_sync: new Date().toISOString() } : o));
        toast({ title: "Invoice sent to Sellsy", description: `Invoice ID: ${sellsyId ?? "—"}` });
      }
    } catch (err) {
      toast({ title: "Invoice send failed", description: String(err), variant: "destructive" });
    } finally {
      setInvoiceSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }, [adminOrders, toast]);

  const bulkSendInvoices = useCallback(async (orderIds: string[]) => {
    for (const id of orderIds) {
      await sendInvoiceToSellsy(id);
    }
  }, [sendInvoiceToSellsy]);

  /* ── Order item editing (only for "received" orders) ── */
  const recalcOrderTotals = useCallback(async (orderId: string) => {
    const { data: items } = await supabase
      .from("order_items")
      .select("quantity, price_per_kg")
      .eq("order_id", orderId);
    const totalKg = (items ?? []).reduce((s, i) => s + Number(i.quantity), 0);
    const totalPrice = (items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.price_per_kg), 0);
    await supabase.from("orders").update({ total_kg: totalKg, total_price: totalPrice }).eq("id", orderId);
    return { totalKg, totalPrice };
  }, []);

  const removeOrderItem = useCallback(async (orderId: string, itemId: string) => {
    const { error } = await supabase.from("order_items").delete().eq("id", itemId);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    const { totalKg, totalPrice } = await recalcOrderTotals(orderId);
    setAdminOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o;
      return { ...o, total_kg: totalKg, total_price: totalPrice, items: o.items.filter((i) => i.id !== itemId) };
    }));
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== orderId) return prev;
      return { ...prev, total_kg: totalKg, total_price: totalPrice, items: prev.items.filter((i) => i.id !== itemId) };
    });
    toast({ title: "Item removed" });
  }, [recalcOrderTotals, toast]);

  const updateOrderItemQty = useCallback(async (orderId: string, itemId: string, newQty: number) => {
    if (newQty <= 0) { await removeOrderItem(orderId, itemId); return; }
    const { error } = await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    const { totalKg, totalPrice } = await recalcOrderTotals(orderId);
    setAdminOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o;
      return { ...o, total_kg: totalKg, total_price: totalPrice, items: o.items.map((i) => i.id === itemId ? { ...i, quantity: newQty } : i) };
    }));
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== orderId) return prev;
      return { ...prev, total_kg: totalKg, total_price: totalPrice, items: prev.items.map((i) => i.id === itemId ? { ...i, quantity: newQty } : i) };
    });
  }, [recalcOrderTotals, removeOrderItem, toast]);

  const addProductToOrder = useCallback(async (orderId: string, product: AdminProductRow) => {
    const { data: inserted, error } = await supabase.from("order_items").insert({
      order_id: orderId,
      product_id: product.id,
      product_name: product.custom_name || product.name,
      product_sku: product.sku,
      price_per_kg: product.custom_price_per_kg ?? product.price_per_kg,
      quantity: 1,
    }).select("id, product_id, product_name, product_sku, quantity, price_per_kg").single();
    if (error || !inserted) { toast({ title: "Add failed", description: error?.message, variant: "destructive" }); return; }
    const { totalKg, totalPrice } = await recalcOrderTotals(orderId);
    const newItem: AdminOrderItem = {
      id: inserted.id, product_id: inserted.product_id, product_name: inserted.product_name,
      product_sku: inserted.product_sku, quantity: Number(inserted.quantity), price_per_kg: Number(inserted.price_per_kg),
    };
    setAdminOrders((prev) => prev.map((o) => o.id !== orderId ? o : { ...o, total_kg: totalKg, total_price: totalPrice, items: [...o.items, newItem] }));
    setSelectedOrder((prev) => !prev || prev.id !== orderId ? prev : { ...prev, total_kg: totalKg, total_price: totalPrice, items: [...prev.items, newItem] });
    toast({ title: `${newItem.product_name} added` });
  }, [recalcOrderTotals, toast]);

  const [showAddProduct, setShowAddProduct] = useState(false);

  /* ── Load clients ── */
  const loadClients = async () => {
    setLoadingClients(true);
    setClientError(null);
    try {
      const { data, error } = await supabase
        .from("client_onboarding")
        .select("*")
        .order("company_name", { ascending: true });
      if (error) throw new Error(error.message);
      setClients((data as AppClient[]) ?? []);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingClients(false);
    }
  };

  /* ── Load products ── */
  const loadProducts = async () => {
    setLoadingProducts(true);
    setProductError(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, sellsy_id, sku, name, description, origin, roast_level, price_per_kg, is_active, synced_at, image_url, tags, tasting_notes, process, data_source_mode, custom_name, custom_price_per_kg")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      setProducts((data as AdminProductRow[]) ?? []);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadLatestProductSync = async () => {
    setSyncRunError(null);
    try {
      const { data, error } = await supabase
        .from("sync_runs")
        .select("id, status, synced_count, parse_errors, completed_at, created_at")
        .eq("source", "sellsy")
        .eq("sync_type", "products")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      setSyncRun((data as SyncRunRow | null) ?? null);
    } catch (err) {
      setSyncRunError(err instanceof Error ? err.message : String(err));
    }
  };

  const runProductSync = async () => {
    setRunningProductSync(true);
    setProductError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
        body: { mode: "sync-products" },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Sync failed");
      await Promise.all([loadProducts(), loadLatestProductSync()]);
      toast({ title: "Product sync completed", description: `${data.syncedCount ?? 0} products refreshed.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProductError(msg);
      toast({ title: "Product sync failed", description: msg, variant: "destructive" });
    } finally {
      setRunningProductSync(false);
    }
  };

  /* ── Init ── */
  useEffect(() => {
    void loadOrders();
    void loadClients();
    void loadProducts();
    void loadLatestProductSync();
  }, [loadOrders]);

  /* ── Derived ── */
  const stats = useMemo(() => {
    const todayOrders = adminOrders.filter((o) => {
      try { return isToday(parseISO(o.created_at)); } catch { return false; }
    });
    const totalKg = adminOrders.reduce((s, o) => s + o.total_kg, 0);
    const receivedCount = adminOrders.filter((o) => o.status === "received").length;
    const packagingCount = adminOrders.filter((o) => o.status === "packaging").length;
    const deliveryTodayCount = adminOrders.filter((o) => {
      try { return isToday(parseISO(o.delivery_date)); } catch { return false; }
    }).length;
    return { todayCount: todayOrders.length, totalKg, receivedCount, packagingCount, deliveryTodayCount };
  }, [adminOrders]);

  const filteredOrders = useMemo(() => {
    let result = adminOrders;
    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.client_name ?? "").toLowerCase().includes(q) ||
          (o.user_email ?? "").toLowerCase().includes(q) ||
          o.items.some((i) => i.product_name.toLowerCase().includes(q)),
      );
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "number" && typeof bVal === "number") return sortAsc ? aVal - bVal : bVal - aVal;
      return sortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return result;
  }, [adminOrders, statusFilter, searchQuery, sortField, sortAsc]);

  const receivedCount = adminOrders.filter((o) => o.status === "received").length;
  const packagingBadge = adminOrders.filter((o) => o.status === "packaging").length;

  const clientSummary = useMemo(() => ({
    totalClients: clients.length,
    activeClients: clients.filter((c) => c.onboarding_status === "completed").length,
    pendingClients: clients.filter((c) => c.onboarding_status !== "completed").length,
  }), [clients]);

  const productSummary = useMemo(() => ({
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.is_active).length,
    averagePrice: products.length > 0 ? products.reduce((s, p) => s + p.price_per_kg, 0) / products.length : 0,
  }), [products]);

  const latestParseErrors = syncRun?.parse_errors ?? [];
  const latestSyncTimestamp = syncRun?.completed_at ?? syncRun?.created_at ?? null;

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const sectionLabels: Record<string, string> = {
    orders: "Orders",
    packaging: "Packaging",
    roaster: "Roaster",
    invoicing: "Invoicing",
    clients: "Clients",
    products: "Products",
  };

  /* ── Sidebar nav items ── */
  const roasterBadge = adminOrders.filter((o) => ["approved", "packaging"].includes(o.status) && !o.is_roasted).length;
  const invoicingBadge = adminOrders.filter((o) => ["ready_for_delivery", "delivered"].includes(o.status) && o.invoicing_status === "not_sent").length;
  const navItems = [
    { key: "orders" as const, icon: Package, label: "Orders", badge: receivedCount > 0 ? receivedCount : null },
    { key: "roaster" as const, icon: Flame, label: "Roaster", badge: roasterBadge > 0 ? roasterBadge : null },
    { key: "packaging" as const, icon: Truck, label: "Packaging", badge: packagingBadge > 0 ? packagingBadge : null },
    { key: "invoicing" as const, icon: FileText, label: "Invoicing", badge: invoicingBadge > 0 ? invoicingBadge : null },
    { key: "clients" as const, icon: Users, label: "Clients", badge: null },
    { key: "products" as const, icon: Coffee, label: "Products", badge: null },
  ];

  /* ── Packaging orders mapped ── */
  const packagingOrders: PackagingOrder[] = useMemo(() =>
    adminOrders.map((o) => ({
      id: o.id,
      client_name: o.client_name,
      delivery_date: o.delivery_date,
      total_kg: o.total_kg,
      status: o.status,
      is_roasted: o.is_roasted,
      is_packed: o.is_packed,
      is_labeled: o.is_labeled,
      items: o.items.map((i) => ({ product_name: i.product_name, quantity: i.quantity, price_per_kg: i.price_per_kg })),
    })),
    [adminOrders],
  );

  /* ── Roaster orders mapped ── */
  const roasterOrders: RoasterOrder[] = useMemo(() =>
    adminOrders.map((o) => ({
      id: o.id,
      client_name: o.client_name,
      delivery_date: o.delivery_date,
      total_kg: o.total_kg,
      status: o.status,
      is_roasted: o.is_roasted,
      items: o.items.map((i) => ({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity })),
    })),
    [adminOrders],
  );

  /* ── Invoicing orders mapped ── */
  const invoicingOrders: InvoicingOrder[] = useMemo(() =>
    adminOrders.map((o) => ({
      id: o.id,
      user_id: o.user_id,
      client_name: o.client_name,
      user_email: o.user_email,
      delivery_date: o.delivery_date,
      total_kg: o.total_kg,
      total_price: o.total_price,
      status: o.status,
      sellsy_id: o.sellsy_id,
      invoicing_status: o.invoicing_status,
      last_invoice_sync: o.last_invoice_sync,
      items: o.items.map((i) => ({ product_name: i.product_name, quantity: i.quantity, price_per_kg: i.price_per_kg })),
    })),
    [adminOrders],
  );

  return (
    <>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card p-6">
          <h1 className="text-base font-medium text-foreground tracking-tight mb-1">PluralRoaster</h1>
          <p className="text-xs text-muted-foreground mb-8">Admin Portal</p>

          <nav className="space-y-1 flex-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeSection === item.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.badge && (
                  <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">{item.badge}</Badge>
                )}
              </button>
            ))}
          </nav>

          <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 lg:p-8 pb-28 lg:pb-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {/* Mobile header */}
            <div className="flex lg:hidden items-center justify-between mb-6">
              <div>
                <h1 className="text-base font-medium text-foreground">PluralRoaster</h1>
                <p className="text-xs text-muted-foreground">{sectionLabels[activeSection]}</p>
              </div>
            </div>

            {/* ═══════════ ORDERS ═══════════ */}
            {activeSection === "orders" && (
              <section className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Orders today</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{stats.todayCount}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Total kg</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{stats.totalKg.toFixed(0)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Received</p>
                    <p className={cn("text-2xl font-medium tabular-nums", stats.receivedCount > 0 ? "text-primary" : "text-foreground")}>
                      {stats.receivedCount}
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">In packaging</p>
                    <p className={cn("text-2xl font-medium tabular-nums", stats.packagingCount > 0 ? "text-warning" : "text-foreground")}>
                      {stats.packagingCount}
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Delivery today</p>
                    <p className={cn("text-2xl font-medium tabular-nums", stats.deliveryTodayCount > 0 ? "text-info" : "text-foreground")}>
                      {stats.deliveryTodayCount}
                    </p>
                  </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="flex gap-2 items-center flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search orders…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-56"
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                          <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {ORDER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => void loadOrders()} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> Refresh
                    </Button>
                    {receivedCount > 0 && (
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => void approveAllReceived()}
                        disabled={approvingIds.size > 0}
                      >
                        <Send className="w-4 h-4" /> Approve all ({receivedCount})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Orders table */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Order ID</TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                            Date {sortField === "created_at" && (sortAsc ? "↑" : "↓")}
                          </TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead className="text-right">Weight</TableHead>
                          <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("total_price")}>
                            Total {sortField === "total_price" && (sortAsc ? "↑" : "↓")}
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("delivery_date")}>
                            Delivery {sortField === "delivery_date" && (sortAsc ? "↑" : "↓")}
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingOrders ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading orders…</TableCell>
                          </TableRow>
                        ) : filteredOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No orders found.</TableCell>
                          </TableRow>
                        ) : (
                          filteredOrders.map((order) => (
                            <TableRow
                              key={order.id}
                              className={cn(
                                "cursor-pointer transition-colors",
                                order.status === "received" && "bg-primary/[0.03]",
                              )}
                              onClick={() => setSelectedOrder(order)}
                            >
                              <TableCell className="font-mono text-xs text-foreground">{order.id.slice(0, 8)}</TableCell>
                              <TableCell className="text-muted-foreground">{format(parseISO(order.created_at), "MMM d, HH:mm")}</TableCell>
                              <TableCell className="text-foreground text-sm">{order.client_name || order.user_email || order.user_id.slice(0, 8) + "…"}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {order.items.length > 0
                                  ? order.items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ").slice(0, 40) + (order.items.length > 2 ? "…" : "")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-foreground">{order.total_kg.toFixed(0)} kg</TableCell>
                              <TableCell className="text-right tabular-nums text-foreground font-medium">€{order.total_price.toFixed(2)}</TableCell>
                              <TableCell className="text-muted-foreground">{format(parseISO(order.delivery_date), "MMM d")}</TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Select
                                  value={order.status}
                                  onValueChange={(val) => void changeOrderStatus(order.id, val as OrderStatus)}
                                >
                                  <SelectTrigger className={cn("h-7 w-auto min-w-[130px] text-xs border rounded-full px-2.5", ORDER_STATUS_CLASS[order.status])}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ORDER_STATUSES.map((s) => (
                                      <SelectItem key={s} value={s}>
                                        <span className={cn("inline-flex items-center gap-1.5")}>
                                          <span className={cn("w-2 h-2 rounded-full", ORDER_STATUS_CLASS[s].split(" ")[0])} />
                                          {ORDER_STATUS_LABEL[s]}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                {order.status === "received" && (
                                  <Button
                                    size="sm"
                                    className="gap-1.5"
                                    disabled={approvingIds.has(order.id)}
                                    onClick={() => void approveOrder(order)}
                                  >
                                    {approvingIds.has(order.id) ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                    Approve
                                  </Button>
                                )}
                                {order.sellsy_id && (
                                  <span className="text-xs font-mono text-muted-foreground">{order.sellsy_id}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>
            )}

            {/* ═══════════ ROASTER ═══════════ */}
            {activeSection === "roaster" && (
              <RoasterView
                orders={roasterOrders}
                onMarkRoasted={async (orderId, value) => {
                  await updateChecklist(orderId, "is_roasted", value);
                  if (value) {
                    await changeOrderStatus(orderId, "packaging");
                  }
                }}
              />
            )}

            {/* ═══════════ PACKAGING ═══════════ */}
            {activeSection === "packaging" && (
              <PackagingView
                orders={packagingOrders}
                onStatusChange={(orderId, newStatus) => void changeOrderStatus(orderId, newStatus)}
                onChecklistChange={(orderId, field, value) => void updateChecklist(orderId, field, value)}
              />
            )}

            {/* ═══════════ INVOICING ═══════════ */}
            {activeSection === "invoicing" && (
              <InvoicingView
                orders={invoicingOrders}
                onSendToSellsy={sendInvoiceToSellsy}
                onBulkSendToSellsy={bulkSendInvoices}
                sendingIds={invoiceSendingIds}
              />
            )}

            {/* ═══════════ CLIENTS ═══════════ */}
            {activeSection === "clients" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Total clients</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{clientSummary.totalClients}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Active clients</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{clientSummary.activeClients}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Pending onboarding</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{clientSummary.pendingClients}</p>
                  </div>
                </div>
                <AdminClientsSection
                  clients={clients}
                  loading={loadingClients}
                  error={clientError}
                  onSelectClient={setSelectedClient}
                />
              </>
            )}

            {/* ═══════════ PRODUCTS ═══════════ */}
            {activeSection === "products" && (
              <section>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Sellsy products</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{productSummary.totalProducts}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Active products</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{productSummary.activeProducts}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Average €/kg</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">€{productSummary.averagePrice.toFixed(2)}</p>
                  </div>
                </div>

                {/* Sync status */}
                <div className="mb-8 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <BadgeEuro className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium text-foreground">Product sync status</h2>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Latest Sellsy product import, synced count, and any price parsing issues.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 self-start">
                      <Button size="sm" className="gap-2" onClick={() => void runProductSync()} disabled={runningProductSync}>
                        <RefreshCw className={cn("h-4 w-4", runningProductSync && "animate-spin")} />
                        {runningProductSync ? "running sync…" : "run product sync"}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => void loadLatestProductSync()} disabled={runningProductSync}>
                        <RefreshCw className="h-4 w-4" /> refresh status
                      </Button>
                    </div>
                  </div>

                  {syncRunError ? (
                    <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">Sync status fetch failed</p>
                      <p className="mt-1 text-xs text-muted-foreground">{syncRunError}</p>
                    </div>
                  ) : syncRun ? (
                    <>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Last sync</p>
                          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                            <Clock3 className="h-4 w-4 text-muted-foreground" />
                            {latestSyncTimestamp ? formatDate(latestSyncTimestamp) : "—"}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {latestSyncTimestamp ? formatDistanceToNow(parseISO(latestSyncTimestamp), { addSuffix: true }) : "No run recorded"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Synced items</p>
                          <p className="mt-2 text-2xl font-medium tabular-nums text-foreground">{syncRun.synced_count}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Result</p>
                          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                            {syncRun.status === "success" ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : syncRun.status === "warning" ? (
                              <AlertCircle className="h-4 w-4 text-primary" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                            {syncRun.status}
                          </div>
                        </div>
                      </div>

                      {latestParseErrors.length > 0 && (
                        <div className="mt-4 rounded-lg border border-border overflow-hidden">
                          <div className="border-b border-border bg-muted/40 px-4 py-3">
                            <p className="text-sm font-medium text-foreground">Pricing parse errors ({latestParseErrors.length})</p>
                          </div>
                          <div className="divide-y divide-border">
                            {latestParseErrors.map((error, index) => (
                              <div key={`${error.sellsy_id ?? index}`} className="px-4 py-3">
                                <p className="text-sm font-medium text-foreground">{error.name ?? error.sku ?? "Unknown product"}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-4 rounded-lg bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                      No product sync run has been logged yet.
                    </div>
                  )}
                </div>

                {/* Products table */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  {productError && (
                    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">Product fetch failed</p>
                      <p className="mt-1 text-xs text-muted-foreground">{productError}</p>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Product</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead>Roast</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingProducts ? (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading products…</TableCell></TableRow>
                        ) : products.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No products found.</TableCell></TableRow>
                        ) : (
                          products.map((product) => {
                            const isCustom = product.data_source_mode === "custom";
                            const displayName = isCustom && product.custom_name ? product.custom_name : product.name;
                            const displayPrice = isCustom && product.custom_price_per_kg != null ? product.custom_price_per_kg : product.price_per_kg;
                            return (
                            <TableRow
                              key={product.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setSelectedProduct(product as AdminProduct)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {product.image_url ? (
                                    <img src={product.image_url} alt="" className="h-8 w-8 rounded object-cover border border-border" />
                                  ) : (
                                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                      <Coffee className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium text-foreground">{displayName}</p>
                                    <p className="text-xs text-muted-foreground">{product.sellsy_id}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{product.origin ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground capitalize">{product.roast_level ?? "—"}</TableCell>
                              <TableCell className="font-mono text-foreground">{product.sku ?? "—"}</TableCell>
                              <TableCell className="text-right tabular-nums text-foreground font-medium">€{displayPrice.toFixed(2)}/kg</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {isCustom && (
                                    <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Override</Badge>
                                  )}
                                  <span className="text-muted-foreground">{product.is_active ? "Active" : "Archived"}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {/* ── Order detail dialog ── */}
      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Order {selectedOrder?.id.slice(0, 8)}
              {selectedOrder && (
                <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", ORDER_STATUS_CLASS[selectedOrder.status])}>
                  {ORDER_STATUS_LABEL[selectedOrder.status]}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>Full order breakdown and actions.</DialogDescription>
          </DialogHeader>

          {selectedOrder && (() => {
            const isEditable = selectedOrder.status === "received";
            return (
            <div className="space-y-5">
              {/* Info grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedOrder.client_name || selectedOrder.user_email || "Unknown"}</p>
                  {selectedOrder.user_email && selectedOrder.client_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedOrder.user_email}</p>
                  )}
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Delivery date</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{format(parseISO(selectedOrder.delivery_date), "EEEE d MMMM yyyy")}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Order date</p>
                  <p className="mt-1 text-sm text-foreground">{format(parseISO(selectedOrder.created_at), "MMM d, yyyy HH:mm")}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Change status</p>
                  <Select
                    value={selectedOrder.status}
                    onValueChange={(val) => {
                      void changeOrderStatus(selectedOrder.id, val as OrderStatus);
                      setSelectedOrder({ ...selectedOrder, status: val as OrderStatus });
                    }}
                  >
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{ORDER_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Checklist */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preparation checklist</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedOrder.is_roasted}
                    onCheckedChange={(v) => {
                      void updateChecklist(selectedOrder.id, "is_roasted", Boolean(v));
                      setSelectedOrder({ ...selectedOrder, is_roasted: Boolean(v) });
                    }}
                  />
                  <span className={cn(selectedOrder.is_roasted && "line-through text-muted-foreground")}>Roasted</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedOrder.is_packed}
                    onCheckedChange={(v) => {
                      void updateChecklist(selectedOrder.id, "is_packed", Boolean(v));
                      setSelectedOrder({ ...selectedOrder, is_packed: Boolean(v) });
                    }}
                  />
                  <span className={cn(selectedOrder.is_packed && "line-through text-muted-foreground")}>Packed</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedOrder.is_labeled}
                    onCheckedChange={(v) => {
                      void updateChecklist(selectedOrder.id, "is_labeled", Boolean(v));
                      setSelectedOrder({ ...selectedOrder, is_labeled: Boolean(v) });
                    }}
                  />
                  <span className={cn(selectedOrder.is_labeled && "line-through text-muted-foreground")}>Labeled</span>
                </label>
              </div>

              {/* Items table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty (kg)</TableHead>
                      <TableHead className="text-right">€/kg</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      {isEditable && <TableHead className="w-[80px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.length === 0 ? (
                      <TableRow><TableCell colSpan={isEditable ? 5 : 4} className="text-center text-muted-foreground py-4">No items</TableCell></TableRow>
                    ) : (
                      selectedOrder.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-foreground">{item.product_name}</TableCell>
                          <TableCell className="text-right">
                            {isEditable ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  className="w-6 h-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:bg-muted transition-colors"
                                  onClick={() => void updateOrderItemQty(selectedOrder.id, item.id, item.quantity - 1)}
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-8 text-center tabular-nums text-foreground font-medium">{item.quantity}</span>
                                <button
                                  className="w-6 h-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:bg-muted transition-colors"
                                  onClick={() => void updateOrderItemQty(selectedOrder.id, item.id, item.quantity + 1)}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="tabular-nums text-foreground">{item.quantity}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">€{item.price_per_kg.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground font-medium">€{(item.quantity * item.price_per_kg).toFixed(2)}</TableCell>
                          {isEditable && (
                            <TableCell className="text-right">
                              <button
                                className="w-7 h-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                                onClick={() => void removeOrderItem(selectedOrder.id, item.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Add product (only for received orders) */}
              {isEditable && (
                <div>
                  {showAddProduct ? (
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">Add a product</p>
                        <button onClick={() => setShowAddProduct(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid gap-1 max-h-48 overflow-y-auto">
                        {products.filter((p) => p.is_active && !selectedOrder.items.some((i) => i.product_id === p.id)).map((p) => (
                          <button
                            key={p.id}
                            className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                            onClick={() => { void addProductToOrder(selectedOrder.id, p); setShowAddProduct(false); }}
                          >
                            <span className="text-foreground">{p.custom_name || p.name}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">€{(p.custom_price_per_kg ?? p.price_per_kg).toFixed(2)}/kg</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddProduct(true)}>
                      <Plus className="w-3.5 h-3.5" /> Add product
                    </Button>
                  )}
                </div>
              )}

              {/* Totals */}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">{selectedOrder.total_kg.toFixed(0)} kg total</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">€{selectedOrder.total_price.toFixed(2)}</span>
              </div>

              {/* Actions */}
              {selectedOrder.status === "received" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    className="gap-2"
                    disabled={approvingIds.has(selectedOrder.id)}
                    onClick={() => {
                      void approveOrder(selectedOrder);
                      setSelectedOrder(null);
                    }}
                  >
                    <Check className="w-4 h-4" /> Approve & Send to Sellsy
                  </Button>
                </div>
              )}
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Client detail dialog ── */}
      <AdminClientDetail
        client={selectedClient}
        open={Boolean(selectedClient)}
        onOpenChange={(open) => { if (!open) setSelectedClient(null); }}
        onSaved={() => void loadClients()}
      />

      {/* ── Product detail dialog ── */}
      <AdminProductDetail
        product={selectedProduct}
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}
        onSaved={() => void loadProducts()}
      />

      {/* ── Floating bottom dock (mobile) ── */}
      <div className="fixed inset-x-0 bottom-4 z-50 px-4 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-full border border-border bg-card/95 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-medium transition-colors",
                activeSection === item.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {activeSection === item.key && <span className="hidden min-[400px]:inline">{item.label}</span>}
              {item.badge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
