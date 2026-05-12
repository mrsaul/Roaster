import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { useCart, MOCK_ORDERS, type CartItem, type Order, type Product } from "@/lib/store";
import { useToast } from "@/components/ui/use-toast";

const LoginPage = lazy(() => import("./LoginPage"));
const CatalogPage = lazy(() => import("./CatalogPage"));
const CheckoutPage = lazy(() => import("./CheckoutPage"));
const OrderHistoryPage = lazy(() => import("./OrderHistoryPage"));
const AccountPage = lazy(() => import("./AccountPage"));
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const RoasterDashboard = lazy(() => import("./RoasterDashboard"));
const PackagingDashboard = lazy(() => import("./PackagingDashboard"));
const OnboardingPage = lazy(() => import("./OnboardingPage"));
import { supabase } from "@/integrations/supabase/client";

type View = "home" | "shop" | "checkout" | "orders" | "account" | "admin" | "roaster_dashboard" | "packaging_dashboard" | "onboarding";
type AppRole = "admin" | "user" | "roaster" | "packaging";

// ── View persistence (sessionStorage) ────────────────────────────────────────
// sessionStorage survives tab switches and is cleared when the browser session ends.

const VIEW_KEY = "pr_view";

// Views that are safe to restore per role on initial load
const RESTORABLE_CLIENT_VIEWS: View[] = ["home", "shop", "orders", "account"];

function saveView(v: View): void {
  try { sessionStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
}

function loadSavedView(): View | null {
  try { return sessionStorage.getItem(VIEW_KEY) as View | null; } catch { return null; }
}

function clearSavedView(): void {
  try { sessionStorage.removeItem(VIEW_KEY); } catch { /* ignore */ }
}

// ── Data types ────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

const Index = () => {
  // View starts as whatever was last saved (or "home") — auth loading spinner hides
  // this until syncUserRole confirms what the user should see.
  const [view, setViewRaw] = useState<View>("home");
  const [role, setRole] = useState<AppRole | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draftDeliveryDate, setDraftDeliveryDate] = useState<string | null>(null);
  const [onboardingData, setOnboardingData] = useState<Record<string, unknown> | null>(null);
  const cart = useCart();
  const { clearCart } = cart;
  const { toast } = useToast();

  // Wraps setView so every navigation is saved to sessionStorage automatically.
  const setView = useCallback((v: View) => {
    saveView(v);
    setViewRaw(v);
  }, []);

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

    const normalizedRole: AppRole = ensuredRole === "admin" ? "admin"
      : ensuredRole === "roaster" ? "roaster"
      : ensuredRole === "packaging" ? "packaging"
      : "user";
    setRole(normalizedRole);

    // Non-client roles always land on their single dedicated view
    if (normalizedRole === "admin") {
      setView("admin");
      return;
    }
    if (normalizedRole === "roaster") {
      window.location.replace("/operations?section=roasting");
      return;
    }
    if (normalizedRole === "packaging") {
      window.location.replace("/operations?section=packaging");
      return;
    }

    // Regular user — check onboarding via contacts→companies
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, company_id, last_name, first_name, companies(id, onboarding_status, name, email, phone, siret, vat_number, legal_company_name, preferred_delivery_days, delivery_time_window, delivery_instructions, coffee_type, estimated_weekly_volume, grinder_type, notes, current_step, client_data_mode, company_addresses(label, address_line1, address_line2))")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    const company = (contact?.companies as any) ?? null;
    if (!contact || !company || company.onboarding_status !== "completed") {
      // contact_name lives in contacts.last_name (set by user_save_onboarding_progress)
      const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() || null;
      // delivery address lives in company_addresses (label = "Delivery")
      const addresses = (company?.company_addresses as any[]) ?? [];
      const deliveryAddr = addresses.find((a: any) => a.label === "Delivery") ?? null;
      setOnboardingData(company ? {
        company_name: company.name,
        contact_name: contactName,
        email: company.email,
        phone: company.phone,
        siret: company.siret,
        vat_number: company.vat_number,
        legal_company_name: company.legal_company_name,
        preferred_delivery_days: company.preferred_delivery_days ?? [],
        delivery_time_window: company.delivery_time_window,
        delivery_address: deliveryAddr?.address_line1 ?? null,
        delivery_instructions: deliveryAddr?.address_line2 ?? company.delivery_instructions ?? null,
        coffee_type: company.coffee_type,
        estimated_weekly_volume: company.estimated_weekly_volume,
        grinder_type: company.grinder_type,
        notes: company.notes,
        current_step: company.current_step,
        onboarding_status: company.onboarding_status,
        _company_id: company.id,
        _contact_id: contact.id,
      } : null);
      setView("onboarding");
      return;
    }

    // Restore last client view (home/shop/orders) — skip checkout since cart
    // might be stale. Falls back to "home" if nothing saved or view is incompatible.
    const savedView = loadSavedView();
    const restored = savedView && RESTORABLE_CLIENT_VIEWS.includes(savedView) ? savedView : "home";
    setView(restored);
    await loadOrders();
  }, [loadOrders, setView]);

  // ── Auth lifecycle ──────────────────────────────────────────────────────────
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

    const handleSignedOut = () => {
      clearSavedView();
      setRole(null);
      setOrders([]);
      setAuthLoading(false);
      clearCart();
    };

    // onAuthStateChange fires for every auth event — including background
    // TOKEN_REFRESHED when the JWT silently renews (e.g. on tab focus).
    // We must NOT reset the view for passive events — only for actual sign-in/out.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Silent refresh — session valid, stay on current page, don't reset anything.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;

      // INITIAL_SESSION fires on subscribe when an existing session is found.
      // Defer entirely to getSession() below to avoid double-initialization.
      if (event === "INITIAL_SESSION") return;

      if (!session?.user || event === "SIGNED_OUT") {
        handleSignedOut();
        return;
      }

      // SIGNED_IN — covers first login AND re-login after logout.
      void handleAuthenticatedSession();
    });

    // Single source of truth on mount. INITIAL_SESSION is filtered above,
    // so only getSession() drives the startup auth cycle.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        handleSignedOut();
        return;
      }
      void handleAuthenticatedSession();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearCart, syncUserRole]);

  // ── Tab visibility: refresh data when user returns, never reset view ─────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible" || !role) return;
      // Refresh stale data silently in background — no loading state, no view change
      if (role === "user") {
        void loadOrders().catch(() => { /* non-critical */ });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [role, loadOrders]);

  const handleLogout = useCallback(async () => {
    clearSavedView();
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Build items array for the atomic RPC — single DB transaction, no orphaned orders
    const items = cart.items.map((item) => ({
      product_id: item.product.id,
      product_name: item.product.name,
      product_sku: item.product.sku ?? null,
      price_per_kg: item.unitPrice != null && item.sizeKg
        ? item.unitPrice / item.sizeKg
        : item.product.pricePerKg,
      quantity: item.sizeKg ? item.sizeKg * item.quantity : item.quantity,
      size_label: item.sizeLabel ?? null,
      size_kg: item.sizeKg ?? null,
    }));

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "create_order_with_items",
      {
        p_user_id:       user.id,
        p_delivery_date: deliveryDate,
        p_total_kg:      cart.totalKg,
        p_total_price:   cart.totalPrice,
        p_status:        "received",
        p_confirmed_at:  new Date().toISOString(),
        p_notes:         notes ?? null,
        p_items:         items,
      },
    );

    if (rpcError || !rpcResult?.order_id) {
      const msg = rpcError?.message ?? "Failed to create order";
      toast({ title: "Order failed", description: msg, variant: "destructive" });
      throw rpcError ?? new Error(msg);
    }

    // Refresh orders in background; CheckoutPage shows success screen, not Index
    void loadOrders();
    setDraftDeliveryDate(null);
    cart.clearCart();

    return { orderId: rpcResult.order_id as string };
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
  }, [cart, setView]);

  const usualOrderItems: CartItem[] = orders[0]?.items ?? [];
  const visibleOrders = role === "admin" ? [...orders, ...MOCK_ORDERS] : orders;

  // ── Render ──────────────────────────────────────────────────────────────────

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
            lastOrder={orders[0] ?? null}
            mode="home"
            onCheckout={() => setView("checkout")}
            onReorderLastOrder={() => { cart.hydrateCart(orders[0]?.items ?? []); setView("checkout"); }}
            onGoHome={() => setView("home")}
            onGoShop={() => setView("shop")}
            onGoAccount={() => setView("account")}
          />
        </Suspense>
      );
    case "shop":
      return (
        <Suspense fallback={fallback}>
          <CatalogPage
            cart={cart}
            usualOrderItems={usualOrderItems}
            lastOrder={orders[0] ?? null}
            mode="shop"
            onCheckout={() => setView("checkout")}
            onReorderLastOrder={() => { cart.hydrateCart(orders[0]?.items ?? []); setView("checkout"); }}
            onGoHome={() => setView("home")}
            onGoShop={() => setView("shop")}
            onGoAccount={() => setView("account")}
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
            onGoAccount={() => setView("account")}
          />
        </Suspense>
      );
    case "account":
      return (
        <Suspense fallback={fallback}>
          <AccountPage
            orders={visibleOrders}
            onGoHome={() => setView("home")}
            onGoShop={() => setView("shop")}
            onGoAccount={() => setView("account")}
            onLogout={handleLogout}
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
