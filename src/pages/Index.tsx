import { useEffect, useState, useCallback } from "react";
import { useCart, MOCK_ORDERS, type Order } from "@/lib/store";
import LoginPage from "./LoginPage";
import CatalogPage from "./CatalogPage";
import CheckoutPage from "./CheckoutPage";
import OrderHistoryPage from "./OrderHistoryPage";
import AdminDashboard from "./AdminDashboard";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

type View = "catalog" | "checkout" | "orders" | "admin";
type AppRole = "admin" | "user";

const Index = () => {
  const [view, setView] = useState<View>("catalog");
  const [role, setRole] = useState<AppRole | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const cart = useCart();

  const syncUserRole = useCallback(async () => {
    const { data: ensuredRole, error: ensureError } = await supabase.rpc("ensure_current_user_role");

    if (ensureError) {
      throw ensureError;
    }

    const normalizedRole = ensuredRole === "admin" ? "admin" : "user";
    setRole(normalizedRole);
    setView(normalizedRole === "admin" ? "admin" : "catalog");
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setRole(null);
        setAuthLoading(false);
        cart.clearCart();
        return;
      }

      setAuthLoading(true);
      void syncUserRole().finally(() => setAuthLoading(false));
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setRole(null);
        setAuthLoading(false);
        return;
      }

      void syncUserRole().finally(() => setAuthLoading(false));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [cart, syncUserRole]);

  const handleLogout = useCallback(async () => {
    cart.clearCart();
    await supabase.auth.signOut();
  }, [cart]);

  const handleConfirmOrder = useCallback((deliveryDate: string) => {
    const newOrder: Order = {
      id: `ORD-${String(MOCK_ORDERS.length + orders.length + 1).padStart(3, "0")}`,
      items: cart.items,
      totalKg: cart.totalKg,
      totalPrice: cart.totalPrice,
      deliveryDate,
      status: "synced",
      sellsyId: `SY-${Math.floor(10000 + Math.random() * 90000)}`,
      createdAt: format(new Date(), "yyyy-MM-dd"),
    };
    setOrders((prev) => [newOrder, ...prev]);
    cart.clearCart();
    setView("catalog");
  }, [cart, orders.length]);

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
    case "catalog":
      return (
        <CatalogPage
          cart={cart}
          onCheckout={() => setView("checkout")}
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
          onBack={() => setView("catalog")}
          onConfirm={handleConfirmOrder}
        />
      );
    case "orders":
      return (
        <OrderHistoryPage
          orders={[...orders, ...MOCK_ORDERS]}
          onBack={() => setView("catalog")}
        />
      );
    case "admin":
      return <AdminDashboard orders={orders} onLogout={handleLogout} />;
    default:
      return null;
  }
};

export default Index;
