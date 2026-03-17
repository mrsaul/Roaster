import { useEffect, useState, useCallback } from "react";
import { useCart, MOCK_ORDERS, type CartItem, type Order, type Product } from "@/lib/store";
import LoginPage from "./LoginPage";
import CatalogPage from "./CatalogPage";
import CheckoutPage from "./CheckoutPage";
import OrderHistoryPage from "./OrderHistoryPage";
import AdminDashboard from "./AdminDashboard";
import { supabase } from "@/integrations/supabase/client";

type View = "home" | "shop" | "checkout" | "orders" | "admin";
type AppRole = "admin" | "user";

type PersistedOrderRow = {
  id: string;
  delivery_date: string;
  total_kg: number;
  total_price: number;
  status: Order["status"];
  sellsy_id: string | null;
  created_at: string;
  order_items: {
    quantity: number;
    price_per_kg: number;
    product_name: string;
    product_sku: string | null;
    product_id: string;
    products: {
      id: string;
      name: string;
      origin: string | null;
      sku: string | null;
      price_per_kg: number;
      roast_level: string | null;
      is_active: boolean;
    } | null;
  }[];
};

const normalizeRoastLevel = (roastLevel: string | null): Product["roastLevel"] => {
  if (roastLevel === "light" || roastLevel === "medium" || roastLevel === "dark" || roastLevel === "espresso") {
    return roastLevel;
  }

  return "medium";
};

const mapPersistedOrder = (order: PersistedOrderRow): Order => ({
  id: order.id,
  deliveryDate: order.delivery_date,
  totalKg: Number(order.total_kg),
  totalPrice: Number(order.total_price),
  status: order.status,
  sellsyId: order.sellsy_id ?? undefined,
  createdAt: order.created_at,
  items: (order.order_items ?? []).map((item) => ({
    quantity: Number(item.quantity),
    product: {
      id: item.products?.id ?? item.product_id,
      name: item.products?.name ?? item.product_name,
      origin: item.products?.origin ?? "Unknown origin",
      sku: item.products?.sku ?? item.product_sku ?? item.product_id,
      pricePerKg: Number(item.products?.price_per_kg ?? item.price_per_kg),
      roastLevel: normalizeRoastLevel(item.products?.roast_level ?? null),
      available: item.products?.is_active ?? true,
    },
  })),
});

const Index = () => {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<AppRole | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draftDeliveryDate, setDraftDeliveryDate] = useState<string | null>(null);
  const cart = useCart();
  const { clearCart } = cart;

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        delivery_date,
        total_kg,
        total_price,
        status,
        sellsy_id,
        created_at,
        order_items (
          quantity,
          price_per_kg,
          product_name,
          product_sku,
          product_id,
          products (
            id,
            name,
            origin,
            sku,
            price_per_kg,
            roast_level,
            is_active
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    setOrders(((data ?? []) as unknown as PersistedOrderRow[]).map(mapPersistedOrder));
  }, []);

  const syncUserRole = useCallback(async () => {
    const { data: ensuredRole, error: ensureError } = await supabase.rpc("ensure_current_user_role");

    if (ensureError) {
      throw ensureError;
    }

    const normalizedRole = ensuredRole === "admin" ? "admin" : "user";
    setRole(normalizedRole);
    setView(normalizedRole === "admin" ? "admin" : "home");

    if (normalizedRole === "user") {
      await loadOrders();
    }
  }, [loadOrders]);

  useEffect(() => {
    const handleAuthenticatedSession = async () => {
      setAuthLoading(true);
      try {
        await syncUserRole();
      } finally {
        setAuthLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setRole(null);
        setOrders([]);
        setAuthLoading(false);
        clearCart();
        return;
      }

      void handleAuthenticatedSession();
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setRole(null);
        setOrders([]);
        setAuthLoading(false);
        return;
      }

      void handleAuthenticatedSession();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearCart, syncUserRole]);

  const handleLogout = useCallback(async () => {
    cart.clearCart();
    await supabase.auth.signOut();
  }, [cart]);

  const handleConfirmOrder = useCallback(async (deliveryDate: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const payload = {
      user_id: user.id,
      delivery_date: deliveryDate,
      total_kg: cart.totalKg,
      total_price: cart.totalPrice,
      status: "synced" as const,
      sellsy_id: `SY-${Math.floor(10000 + Math.random() * 90000)}`,
    };

    const { data: createdOrder, error: orderError } = await supabase
      .from("orders")
      .insert(payload)
      .select("id, delivery_date, total_kg, total_price, status, sellsy_id, created_at")
      .single();

    if (orderError || !createdOrder) {
      throw orderError ?? new Error("Failed to create order");
    }

    const itemRows = cart.items.map((item) => ({
      order_id: createdOrder.id,
      product_id: item.product.id,
      product_name: item.product.name,
      product_sku: item.product.sku,
      price_per_kg: item.product.pricePerKg,
      quantity: item.quantity,
    }));

    if (itemRows.length > 0) {
      const { error: itemsError } = await supabase.from("order_items").insert(itemRows);

      if (itemsError) {
        throw itemsError;
      }
    }

    await loadOrders();
    setDraftDeliveryDate(null);
    cart.clearCart();
    setView("home");
  }, [cart, loadOrders]);

  const usualOrderItems: CartItem[] = orders[0]?.items ?? [];
  const lastOrderDate = orders[0]?.createdAt ?? null;
  const lastOrderTotal = orders[0]?.totalPrice ?? null;
  const visibleOrders = role === "admin" ? [...orders, ...MOCK_ORDERS] : orders;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 text-sm text-muted-foreground">
        Checking authentication…
      </div>
    );
  }

  if (!role) {
    return <LoginPage />;
  }

  switch (view) {
    case "home":
      return (
        <CatalogPage
          cart={cart}
          usualOrderItems={usualOrderItems}
          lastOrderDate={lastOrderDate}
          lastOrderTotal={lastOrderTotal}
          mode="home"
          onCheckout={() => setView("checkout")}
          onReorderLastOrder={() => setView("checkout")}
          onGoHome={() => setView("home")}
          onGoShop={() => setView("shop")}
          onViewOrders={() => setView("orders")}
          onLogout={handleLogout}
        />
      );
    case "shop":
      return (
        <CatalogPage
          cart={cart}
          usualOrderItems={usualOrderItems}
          lastOrderDate={lastOrderDate}
          lastOrderTotal={lastOrderTotal}
          mode="shop"
          onCheckout={() => setView("checkout")}
          onReorderLastOrder={() => setView("checkout")}
          onGoHome={() => setView("home")}
          onGoShop={() => setView("shop")}
          onViewOrders={() => setView("orders")}
          onLogout={handleLogout}
        />
      );
    case "checkout":
      return (
        <CheckoutPage
          items={cart.items}
          totalKg={cart.totalKg}
          totalPrice={cart.totalPrice}
          onBack={() => setView("home")}
          onConfirm={handleConfirmOrder}
        />
      );
    case "orders":
      return (
        <OrderHistoryPage
          orders={visibleOrders}
          draftItems={cart.items}
          draftTotalKg={cart.totalKg}
          draftTotalPrice={cart.totalPrice}
          draftDeliveryDate={draftDeliveryDate}
          onDraftDeliveryDateChange={setDraftDeliveryDate}
          onGoHome={() => setView("home")}
          onGoShop={() => setView("shop")}
          onViewOrders={() => setView("orders")}
        />
      );
    case "admin":
      return <AdminDashboard orders={orders} onLogout={handleLogout} />;
    default:
      return null;
  }
};

export default Index;
