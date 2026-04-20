import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { useCart, MOCK_ORDERS, type CartItem, type Order, type Product } from "@/lib/store";
import { useToast } from "@/components/ui/use-toast";

const LoginPage = lazy(() => import("./LoginPage"));
const CatalogPage = lazy(() => import("./CatalogPage"));
const CheckoutPage = lazy(() => import("./CheckoutPage"));
const OrderHistoryPage = lazy(() => import("./OrderHistoryPage"));
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const RoasterDashboard = lazy(() => import("./RoasterDashboard"));
const PackagingDashboard = lazy(() => import("./PackagingDashboard"));
const OnboardingPage = lazy(() => import("./OnboardingPage"));
import { supabase } from "@/integrations/supabase/client";

type View = "home" | "shop" | "checkout" | "orders" | "admin" | "roaster_dashboard" | "packaging_dashboard" | "onboarding";
type AppRole = "admin" | "user" | "roaster" | "packaging";

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draftDeliveryDate, setDraftDeliveryDate] = useState<string | null>(null);
  const [onboardingData, setOnboardingData] = useState<Record<string, unknown> | null>(null);
  const cart = useCart();
  const { clearCart } = cart;
  const { toast } = useToast();

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

    const normalizedRole = ensuredRole === "admin" ? "admin" 
      : ensuredRole === "roaster" ? "roaster"
      : ensuredRole === "packaging" ? "packaging"
      : "user";
    setRole(normalizedRole);

    if (normalizedRole === "admin") {
      setView("admin");
      return;
    }

    if (normalizedRole === "roaster") {
      setView("roaster_dashboard");
      return;
    }

    if (normalizedRole === "packaging") {
      setView("packaging_dashboard");
      return;
    }

    // Check onboarding status for regular users
    const { data: onboarding } = await supabase
      .from("client_onboarding")
      .select("*")
      .maybeSingle();

    if (!onboarding || onboarding.onboarding_status !== "completed") {
      setOnboardingData(onboarding as Record<string, unknown> | null);
      setView("onboarding");
    } else {
      setView("home");
      await loadOrders();
    }
  }, [loadOrders]);

  useEffect(() => {
    const handleAuthenticatedSession = async () => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        await syncUserRole();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Authentication error. Please refresh and try again.");
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

  const handleRemoveDraftItem = useCallback((productId: string) => {
    const draftItem = cart.items.find((item) => item.product.id === productId);

    if (!draftItem) {
      return;
    }

    cart.updateQuantity(draftItem.product, 0);
  }, [cart]);

  const handleDraftQuantityChange = useCallback((productId: string, nextQuantity: number) => {
    const draftItem = cart.items.find((item) => item.product.id === productId);

    if (!draftItem) {
      return;
    }

    cart.updateQuantity(draftItem.product, Math.max(0, nextQuantity));
  }, [cart]);

  const handleConfirmOrder = useCallback(async (deliveryDate: string, notes?: string): Promise<{ orderId: string }> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const payload = {
      user_id: user.id,
      delivery_date: deliveryDate,
      total_kg: cart.totalKg,
      total_price: cart.totalPrice,
      status: "received" as const,
      confirmed_at: new Date().toISOString(),
      notes: notes ?? null,
    };

    const { data: createdOrder, error: orderError } = await supabase
      .from("orders")
      .insert(payload)
      .select("id, delivery_date, total_kg, total_price, status, sellsy_id, created_at")
      .single();

    if (orderError || !createdOrder) {
      const msg = orderError?.message ?? "Failed to create order";
      toast({ title: "Order failed", description: msg, variant: "destructive" });
      throw orderError ?? new Error(msg);
    }

    const itemRows = cart.items.map((item) => ({
      order_id: createdOrder.id,
      product_id: item.product.id,
      product_name: item.product.name,
      product_sku: item.product.sku,
      price_per_kg: item.unitPrice != null && item.sizeKg
        ? item.unitPrice / item.sizeKg
        : item.product.pricePerKg,
      quantity: item.sizeKg ? item.sizeKg * item.quantity : item.quantity,
      size_label: item.sizeLabel ?? null,
      size_kg: item.sizeKg ?? null,
    }));

    if (itemRows.length > 0) {
      const { error: itemsError } = await supabase.from("order_items").insert(itemRows);

      if (itemsError) {
        toast({ title: "Order items failed", description: itemsError.message, variant: "destructive" });
        throw itemsError;
      }
    }

    // Refresh orders in background; CheckoutPage shows success screen, not Index
    void loadOrders();
    setDraftDeliveryDate(null);
    cart.clearCart();

    return { orderId: createdOrder.id };
  }, [cart, loadOrders, toast]);

  const handlePlaceDraftOrder = useCallback(() => {
    if (!draftDeliveryDate || cart.items.length === 0) {
      return;
    }

    void handleConfirmOrder(draftDeliveryDate);
  }, [cart.items.length, draftDeliveryDate, handleConfirmOrder]);

  const handleReorder = useCallback((order: Order) => {
    cart.hydrateCart(order.items);
    setView("checkout");
  }, [cart]);

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

  if (authError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm text-destructive">{authError}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          Reload page
        </button>
      </div>
    );
  }

  const fallback = (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 text-sm text-muted-foreground">
      Loading…
    </div>
  );

  if (!role) {
    return <Suspense fallback={fallback}><LoginPage /></Suspense>;
  }

  switch (view) {
    case "onboarding":
      return (
        <Suspense fallback={fallback}>
          <OnboardingPage
            existingData={onboardingData as any}
            onComplete={async () => {
              setView("home");
              await loadOrders();
            }}
          />
        </Suspense>
      );
    case "home":
      return (
        <Suspense fallback={fallback}>
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
        </Suspense>
      );
    case "shop":
      return (
        <Suspense fallback={fallback}>
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
        </Suspense>
      );
    case "checkout":
      return (
        <Suspense fallback={fallback}>
          <CheckoutPage
            items={cart.items}
            totalKg={cart.totalKg}
            totalPrice={cart.totalPrice}
            onBack={() => setView("home")}
            onConfirm={handleConfirmOrder}
          />
        </Suspense>
      );
    case "orders":
      return (
        <Suspense fallback={fallback}>
          <OrderHistoryPage
            orders={visibleOrders}
            draftItems={cart.items}
            draftTotalKg={cart.totalKg}
            draftTotalPrice={cart.totalPrice}
            draftDeliveryDate={draftDeliveryDate}
            onDraftDeliveryDateChange={setDraftDeliveryDate}
            onRemoveDraftItem={handleRemoveDraftItem}
            onDraftQuantityChange={handleDraftQuantityChange}
            onPlaceDraftOrder={handlePlaceDraftOrder}
            onReorder={handleReorder}
            onGoHome={() => setView("home")}
            onGoShop={() => setView("shop")}
            onViewOrders={() => setView("orders")}
          />
        </Suspense>
      );
    case "admin":
      return <Suspense fallback={fallback}><AdminDashboard orders={orders} onLogout={handleLogout} /></Suspense>;
    case "roaster_dashboard":
      return <Suspense fallback={fallback}><RoasterDashboard onLogout={handleLogout} /></Suspense>;
    case "packaging_dashboard":
      return <Suspense fallback={fallback}><PackagingDashboard onLogout={handleLogout} /></Suspense>;
    default:
      return null;
  }
};

export default Index;
