import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CartBar } from "@/components/CartBar";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import { MOCK_PRODUCTS, type Product } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ClipboardList, House, ShoppingBag, RefreshCw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { addDays, format, isWeekend, startOfDay } from "date-fns";

type ProductRow = Tables<"products">;

type UsualOrderPreset = {
  name: string;
  quantity: number;
};

interface CatalogPageProps {
  cart: {
    items: { product: Product; quantity: number }[];
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string) => number;
    updateQuantity: (product: Product, qty: number) => void;
    hydrateCart: (items: { product: Product; quantity: number }[]) => void;
  };
  usualOrderItems: { product: Product; quantity: number }[];
  lastOrderDate?: string | null;
  lastOrderTotal?: number | null;
  mode: "home" | "shop";
  onCheckout: () => void;
  onReorderLastOrder: () => void;
  onGoHome: () => void;
  onGoShop: () => void;
  onViewOrders: () => void;
  onLogout: () => void;
}

const USUAL_ORDER_PRESET: UsualOrderPreset[] = [
  { name: "Colombia Huila", quantity: 2 },
  { name: "Ethiopia Washed", quantity: 1 },
  { name: "Brazil Espresso", quantity: 3 },
];

const normalizeRoastLevel = (roastLevel: string | null): Product["roastLevel"] => {
  if (roastLevel === "light" || roastLevel === "medium" || roastLevel === "dark" || roastLevel === "espresso") {
    return roastLevel;
  }

  return "medium";
};

const mapProductRow = (product: ProductRow): Product => ({
  id: product.id,
  name: product.name,
  origin: product.origin ?? "Unknown origin",
  sku: product.sku ?? product.sellsy_id,
  pricePerKg: product.price_per_kg,
  roastLevel: normalizeRoastLevel(product.roast_level),
  available: product.is_active,
});

function getNextWeekdayLabel() {
  let candidate = addDays(startOfDay(new Date()), 1);

  while (isWeekend(candidate)) {
    candidate = addDays(candidate, 1);
  }

  return format(candidate, "EEEE");
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export default function CatalogPage({ cart, usualOrderItems, lastOrderDate, lastOrderTotal, mode, onCheckout, onReorderLastOrder, onGoHome, onGoShop, onViewOrders, onLogout }: CatalogPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const initializedUsualOrder = useRef(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);

    const { data, error } = await supabase
      .from("products")
      .select("id, sellsy_id, sku, name, origin, roast_level, price_per_kg, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      setProductsError(error.message);
      setProducts(MOCK_PRODUCTS.filter((product) => product.available));
      setLoadingProducts(false);
      return;
    }

    const remoteProducts = (data ?? []).map(mapProductRow);
    setProducts(remoteProducts.length > 0 ? remoteProducts : []);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setLoadingProducts(true);
      setProductsError(null);

      const { data, error } = await supabase
        .from("products")
        .select("id, sellsy_id, sku, name, origin, roast_level, price_per_kg, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!active) return;

      if (error) {
        setProductsError(error.message);
        setProducts(MOCK_PRODUCTS.filter((product) => product.available));
        setLoadingProducts(false);
        return;
      }

      const remoteProducts = (data ?? []).map(mapProductRow);
      setProducts(remoteProducts.length > 0 ? remoteProducts : []);
      setLoadingProducts(false);
    };

    void loadCatalog();

    return () => {
      active = false;
    };
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) => product.available), [products]);

  const fallbackUsualOrderProducts = useMemo(() => {
    return USUAL_ORDER_PRESET.map((preset) => {
      const product = visibleProducts.find((item) => normalizeName(item.name).includes(normalizeName(preset.name)));
      return product ? { product, quantity: preset.quantity } : null;
    }).filter((entry): entry is { product: Product; quantity: number } => Boolean(entry));
  }, [visibleProducts]);

  const resolvedUsualOrderItems = usualOrderItems.length > 0 ? usualOrderItems : fallbackUsualOrderProducts;

  useEffect(() => {
    if (initializedUsualOrder.current || resolvedUsualOrderItems.length === 0) {
      return;
    }

    cart.hydrateCart(resolvedUsualOrderItems);
    initializedUsualOrder.current = true;
  }, [cart, resolvedUsualOrderItems]);

  const usualOrderTotal = useMemo(() => {
    return resolvedUsualOrderItems.reduce((sum, { product }) => {
      const quantity = cart.getQuantity(product.id);
      return sum + quantity * product.pricePerKg;
    }, 0);
  }, [cart, resolvedUsualOrderItems]);

  const usualOrderHasItems = resolvedUsualOrderItems.some(({ product }) => cart.getQuantity(product.id) > 0);
  const deliveryLabel = deliveryDate ? format(new Date(`${deliveryDate}T00:00:00`), "EEEE") : getNextWeekdayLabel();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-medium tracking-tight text-foreground">PluralRoaster</h1>
            <p className="text-xs text-muted-foreground">{mode === "home" ? "Your latest order" : "Full catalog"}</p>
          </div>
          <div className="flex items-center gap-2">
            {mode === "shop" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadProducts()}
                disabled={loadingProducts}
                className="rounded-full"
              >
                <RefreshCw className={loadingProducts ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Refresh
              </Button>
            ) : null}
            <button onClick={onLogout} className="p-2 rounded-full border border-border bg-card/80 shadow-sm transition-colors hover:bg-muted" aria-label="Logout">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-40 space-y-6">
        {mode === "home" ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
            <div>
              <p className="text-sm text-muted-foreground">Client Login</p>
              <h2 className="mt-2 text-xl font-medium tracking-tight text-foreground">Your usual order:</h2>
            </div>

            <div className="space-y-4">
              {resolvedUsualOrderItems.map(({ product }) => (
                <div key={product.id} className="space-y-2">
                  <p className="text-base font-medium text-foreground">{product.name}</p>
                  <QuantityStepper
                    value={cart.getQuantity(product.id)}
                    onChange={(qty) => cart.updateQuantity(product, qty)}
                    className="justify-start"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Delivery Date:</span>
                <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">{deliveryLabel}</span>
              </div>
              <DeliveryDatePicker selected={deliveryDate} onSelect={setDeliveryDate} />
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-sm text-muted-foreground">TOTAL</p>
                <p className="text-3xl font-medium tabular-nums text-foreground">{Math.round(usualOrderTotal)} €</p>
              </div>
              {lastOrderDate || lastOrderTotal ? (
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last order</p>
                  <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                    <span className="text-foreground">{lastOrderDate ? format(new Date(lastOrderDate), "MMMM d, yyyy") : "—"}</span>
                    <span className="font-medium tabular-nums text-foreground">{typeof lastOrderTotal === "number" ? `${Math.round(lastOrderTotal)} €` : "—"}</span>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={onReorderLastOrder}
                  disabled={!usualOrderHasItems}
                  className="w-full rounded-xl"
                >
                  Reorder last order
                </Button>
                <Button
                  size="lg"
                  onClick={onCheckout}
                  disabled={!usualOrderHasItems}
                  className="w-full rounded-xl"
                >
                  Confirm Order
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {mode === "shop" ? (
          <>
            <motion.div
              className="flex flex-col gap-2"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.05 } },
              }}
            >
              {visibleProducts.map((product) => (
                <motion.div
                  key={product.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-base font-medium text-foreground">{product.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{product.origin}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium tabular-nums text-foreground">€{product.pricePerKg.toFixed(2)}/kg</span>
                      <QuantityStepper
                        value={cart.getQuantity(product.id)}
                        onChange={(qty) => cart.updateQuantity(product, qty)}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {loadingProducts ? (
              <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                Loading coffee catalog…
              </div>
            ) : null}

            {!loadingProducts && productsError ? (
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Couldn’t load the synced catalog.</p>
                    <p className="mt-1 text-xs text-muted-foreground">Showing the default product list for now.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadProducts()} className="rounded-full">
                    Retry
                  </Button>
                </div>
              </div>
            ) : null}

            {!loadingProducts && !productsError && visibleProducts.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>No synced products yet. Ask an admin to run the Sellsy sync.</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadProducts()} className="rounded-full">
                    Refresh
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-4 z-50 px-4">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-full border border-border bg-card/95 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <button
            onClick={onGoHome}
            className={mode === "home" ? "flex flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-4 py-3 text-sm font-medium text-foreground" : "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"}
          >
            <House className="h-4 w-4" />
            Home
          </button>
          <button
            onClick={onGoShop}
            className={mode === "shop" ? "flex flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-4 py-3 text-sm font-medium text-foreground" : "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"}
          >
            <ShoppingBag className="h-4 w-4" />
            Shop
          </button>
          <button
            onClick={onViewOrders}
            className="relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ClipboardList className="h-4 w-4" />
            Orders
            {cart.items.length > 0 ? <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

