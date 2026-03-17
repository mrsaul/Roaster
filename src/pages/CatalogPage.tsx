import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CartBar } from "@/components/CartBar";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Button } from "@/components/ui/button";
import { MOCK_PRODUCTS, type Product } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ClipboardList } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { addDays, format, isWeekend, startOfDay } from "date-fns";

type ProductRow = Tables<"products">;

type UsualOrderPreset = {
  name: string;
  quantity: number;
};

interface CatalogPageProps {
  cart: {
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string) => number;
    updateQuantity: (product: Product, qty: number) => void;
    hydrateCart: (items: { product: Product; quantity: number }[]) => void;
  };
  usualOrderItems: { product: Product; quantity: number }[];
  onCheckout: () => void;
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

export default function CatalogPage({ cart, usualOrderItems, onCheckout, onViewOrders, onLogout }: CatalogPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const initializedUsualOrder = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadProducts = async () => {
      setLoadingProducts(true);
      setProductsError(null);

      const { data, error } = await supabase
        .from("products")
        .select("id, sellsy_id, sku, name, origin, roast_level, price_per_kg, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!mounted) return;

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

    void loadProducts();

    return () => {
      mounted = false;
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
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-medium tracking-tight text-foreground">PluralRoaster</h1>
            <p className="text-xs text-muted-foreground">Catalog</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onViewOrders} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Order history">
              <ClipboardList className="w-5 h-5 text-muted-foreground" />
            </button>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Logout">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-28 space-y-6">
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
            <Button
              size="lg"
              onClick={onCheckout}
              disabled={!usualOrderHasItems}
              className="w-full rounded-xl"
            >
              Confirm Order
            </Button>
          </div>
        </section>

        {loadingProducts ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            Loading coffee catalog…
          </div>
        ) : null}

        {!loadingProducts && productsError ? (
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Couldn’t load the synced catalog.</p>
            <p className="mt-1 text-xs text-muted-foreground">Showing the default product list for now.</p>
          </div>
        ) : null}

        {!loadingProducts && !productsError && visibleProducts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            No synced products yet. Ask an admin to run the Sellsy sync.
          </div>
        ) : null}
      </main>

      <CartBar totalKg={cart.totalKg} totalPrice={cart.totalPrice} onCheckout={onCheckout} />
    </div>
  );
}
