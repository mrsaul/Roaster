import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ProductCard } from "@/components/ProductCard";
import { CartBar } from "@/components/CartBar";
import { MOCK_PRODUCTS, type Product } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ClipboardList } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ProductRow = Tables<"products">;

interface CatalogPageProps {
  cart: {
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string) => number;
    updateQuantity: (product: Product, qty: number) => void;
  };
  onCheckout: () => void;
  onViewOrders: () => void;
  onLogout: () => void;
}

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

export default function CatalogPage({ cart, onCheckout, onViewOrders, onLogout }: CatalogPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

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

      <main className="max-w-lg mx-auto px-4 py-4 pb-28">
        {loadingProducts ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            Loading coffee catalog…
          </div>
        ) : null}

        {!loadingProducts && productsError ? (
          <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Couldn’t load the synced catalog.</p>
            <p className="text-xs text-muted-foreground mt-1">Showing the default product list for now.</p>
          </div>
        ) : null}

        {!loadingProducts && !productsError && visibleProducts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            No synced products yet. Ask an admin to run the Sellsy sync.
          </div>
        ) : null}

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
              <ProductCard
                product={product}
                quantity={cart.getQuantity(product.id)}
                onQuantityChange={cart.updateQuantity}
              />
            </motion.div>
          ))}
        </motion.div>
      </main>

      <CartBar totalKg={cart.totalKg} totalPrice={cart.totalPrice} onCheckout={onCheckout} />
    </div>
  );
}
