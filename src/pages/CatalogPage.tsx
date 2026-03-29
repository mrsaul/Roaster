import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CartBar } from "@/components/CartBar";

import { Button } from "@/components/ui/button";
import { MOCK_PRODUCTS, type Product, type ProductVariant } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, ClipboardList, House, ShoppingBag, RefreshCw, MapPin, Coffee, Minus, Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ProductRow = Tables<"products">;

type UsualOrderPreset = {
  name: string;
  quantity: number;
};

interface CatalogPageProps {
  cart: {
    items: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[];
    totalKg: number;
    totalPrice: number;
    getQuantity: (id: string, sizeLabel?: string) => number;
    updateQuantity: (product: Product, qty: number, sizeLabel?: string, sizeKg?: number, unitPrice?: number) => void;
    hydrateCart: (items: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[]) => void;
  };
  usualOrderItems: { product: Product; quantity: number; sizeLabel?: string; sizeKg?: number; unitPrice?: number }[];
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

const mapProductRow = (product: ProductRow, variants?: ProductVariant[]): Product => {
  const row = product as any;
  const isCustom = row.data_source_mode === "custom";
  return {
    id: product.id,
    name: isCustom && row.custom_name ? row.custom_name : product.name,
    origin: product.origin ?? "Unknown origin",
    sku: product.sku ?? product.sellsy_id,
    pricePerKg: isCustom && row.custom_price_per_kg != null ? Number(row.custom_price_per_kg) : product.price_per_kg,
    roastLevel: normalizeRoastLevel(product.roast_level),
    available: product.is_active,
    description: product.description ?? undefined,
    imageUrl: row.image_url ?? null,
    tags: row.tags ?? [],
    tastingNotes: row.tasting_notes ?? null,
    process: row.process ?? null,
    variants: variants && variants.length > 0 ? variants : undefined,
  };
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* ── Size Quantity Stepper ── */
function SizeQuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-8 h-8 rounded-lg border border-border bg-secondary flex items-center justify-center text-foreground transition-colors hover:bg-muted"
        aria-label="Decrease"
      >
        <Minus className="w-3.5 h-3.5" />
      </motion.button>
      <span className="w-8 text-center font-mono text-sm tabular-nums font-medium text-foreground">
        {value}
      </span>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => onChange(value + 1)}
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
          value > 0
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-secondary text-foreground hover:bg-muted"
        )}
        aria-label="Increase"
      >
        <Plus className="w-3.5 h-3.5" />
      </motion.button>
    </div>
  );
}

export default function CatalogPage({ cart, usualOrderItems, lastOrderDate, lastOrderTotal, mode, onCheckout, onReorderLastOrder, onGoHome, onGoShop, onViewOrders, onLogout }: CatalogPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  
  const initializedUsualOrder = useRef(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError(null);

    // Load products
    const { data, error } = await supabase
      .from("products")
      .select("id, sellsy_id, sku, name, description, origin, roast_level, price_per_kg, is_active, image_url, tags, tasting_notes, process, data_source_mode, custom_name, custom_price_per_kg")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      setProductsError(error.message);
      setProducts(MOCK_PRODUCTS.filter((product) => product.available));
      setLoadingProducts(false);
      return;
    }

    // Load all variants
    const { data: variantsData } = await supabase
      .from("product_variants")
      .select("id, product_id, size_label, size_kg, price, sku, is_active")
      .eq("is_active", true)
      .order("size_kg", { ascending: true });

    const variantsByProduct = new Map<string, ProductVariant[]>();
    ((variantsData ?? []) as any[]).forEach((v) => {
      const list = variantsByProduct.get(v.product_id) ?? [];
      list.push({
        id: v.id,
        size_label: v.size_label,
        size_kg: Number(v.size_kg),
        price: Number(v.price),
        sku: v.sku,
        is_active: v.is_active,
      });
      variantsByProduct.set(v.product_id, list);
    });

    const remoteProducts = (data ?? []).map((p) => mapProductRow(p, variantsByProduct.get(p.id)));
    setProducts(remoteProducts.length > 0 ? remoteProducts : []);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

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
                  {product.variants && product.variants.length > 0 ? (
                    <div className="space-y-1.5">
                      {product.variants.map((v) => (
                        <div key={v.size_label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-10">{v.size_label}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">€{v.price.toFixed(2)}</span>
                          </div>
                          <SizeQuantityStepper
                            value={cart.getQuantity(product.id, v.size_label)}
                            onChange={(qty) => cart.updateQuantity(product, qty, v.size_label, v.size_kg, v.price)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs tabular-nums text-muted-foreground">€{product.pricePerKg.toFixed(2)}/kg</span>
                      <SizeQuantityStepper
                        value={cart.getQuantity(product.id)}
                        onChange={(qty) => cart.updateQuantity(product, qty)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-sm text-muted-foreground">TOTAL</p>
                <p className="text-3xl font-medium tabular-nums text-foreground">{Math.round(cart.totalPrice)} €</p>
                <p className="text-xs text-muted-foreground tabular-nums">{cart.totalKg.toFixed(2)} kg</p>
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
                  disabled={cart.items.length === 0}
                  className="w-full rounded-xl"
                >
                  Reorder last order
                </Button>
                <Button
                  size="lg"
                  onClick={onCheckout}
                  disabled={cart.items.length === 0}
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
              className="flex flex-col gap-3"
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
                  <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                    {/* Product image */}
                    {product.imageUrl && (
                      <div className="aspect-square w-full">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* Header */}
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold leading-snug text-foreground">
                          {product.name}
                        </h3>
                        {product.tastingNotes && (
                          <p className="text-sm italic text-muted-foreground">
                            {product.tastingNotes}
                          </p>
                        )}
                        {product.description && !product.tastingNotes && (
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {product.description}
                          </p>
                        )}
                      </div>

                      {/* Tags */}
                      {product.tags && product.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {product.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Detail chips */}
                      <div className="flex flex-wrap items-center gap-2">
                        {product.roastLevel && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            <Coffee className="h-3 w-3" />
                            {product.roastLevel.charAt(0).toUpperCase() + product.roastLevel.slice(1)}
                          </span>
                        )}
                        {product.origin && product.origin !== "Unknown origin" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            <MapPin className="h-3 w-3" />
                            {product.origin}
                          </span>
                        )}
                        {product.process && (
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground capitalize">
                            {product.process}
                          </span>
                        )}
                      </div>

                      {/* Size variants or legacy pricing */}
                      <div className="border-t border-border pt-3">
                        {product.variants && product.variants.length > 0 ? (
                          <div className="space-y-2">
                            {product.variants.map((v) => {
                              const qty = cart.getQuantity(product.id, v.size_label);
                              return (
                                <div key={v.size_label} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-3">
                                    <span className={cn(
                                      "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums min-w-[48px]",
                                      qty > 0
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border bg-muted/30 text-muted-foreground"
                                    )}>
                                      {v.size_label}
                                    </span>
                                    <span className="text-sm font-medium tabular-nums text-foreground">
                                      €{v.price.toFixed(2)}
                                    </span>
                                  </div>
                                  <SizeQuantityStepper
                                    value={qty}
                                    onChange={(q) => cart.updateQuantity(product, q, v.size_label, v.size_kg, v.price)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-lg font-semibold tabular-nums text-foreground">
                                €{product.pricePerKg.toFixed(2)}
                              </span>
                              <span className="ml-1 text-xs text-muted-foreground">/kg</span>
                              <p className="text-[11px] text-muted-foreground">3 kg units</p>
                            </div>
                            <SizeQuantityStepper
                              value={cart.getQuantity(product.id)}
                              onChange={(qty) => cart.updateQuantity(product, qty)}
                            />
                          </div>
                        )}
                      </div>
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
                    <p className="text-sm font-medium text-foreground">Couldn't load the synced catalog.</p>
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
            className="flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ClipboardList className="h-4 w-4" />
            Orders
          </button>
        </div>
      </div>

      {cart.items.length > 0 && mode === "shop" && (
        <CartBar itemCount={cart.items.length} totalKg={cart.totalKg} totalPrice={cart.totalPrice} onCheckout={onCheckout} />
      )}
    </div>
  );
}
