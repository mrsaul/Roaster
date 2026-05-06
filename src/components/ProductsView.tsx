import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, Search, Coffee, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddProductDialog } from "@/components/AddProductDialog";
import { AdminProductDetail, type AdminProduct } from "@/components/AdminProductDetail";

/* ─── Types ─── */

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  is_active: boolean;
  image_url: string | null;
  tags: string[];
  tasting_notes: string | null;
  process: string | null;
  description: string | null;
  data_source_mode: string;
  custom_name: string | null;
  custom_price_per_kg: number | null;
  source: string;
  shopify_product_id: string | null;
  shopify_synced_at: string | null;
};

type SourceFilter = "all" | "shopify" | "manual";

/* ─── Query ─── */

async function fetchProducts(): Promise<ProductRow[]> {
  const { data, error } = await (supabase as any)
    .from("products")
    .select(
      "id, name, sku, origin, roast_level, price_per_kg, is_active, image_url, tags, tasting_notes, process, description, data_source_mode, custom_name, custom_price_per_kg, source, shopify_product_id, shopify_synced_at",
    )
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

/* ─── Source badge ─── */

function SourceBadge({ source }: { source: string }) {
  if (source === "shopify") {
    return (
      <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-600 bg-green-500/5">
        Shopify
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Manual
    </Badge>
  );
}

/* ─── Component ─── */

export function ProductsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [productDetailOpen, setProductDetailOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductRow | null>(null);
  const [syncingShopify, setSyncingShopify] = useState(false);

  const { data: products = [], isLoading, error, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("product_variants").delete().eq("product_id", id);
      const { error: err } = await (supabase as any).from("products").delete().eq("id", id);
      if (err) throw new Error(err.message);
    },
    onSuccess: () => {
      toast({ title: "Product deleted" });
      setProductToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSyncShopify = useCallback(async () => {
    setSyncingShopify(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("shopify-product-sync");
      if (invokeErr) throw new Error(invokeErr.message);
      if (!data?.success) throw new Error(data?.error ?? "Sync failed");
      toast({
        title: "Shopify sync complete",
        description: `${data.syncedCount ?? 0} products synced.`,
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast({ title: "Shopify sync failed", description: String(err), variant: "destructive" });
    } finally {
      setSyncingShopify(false);
    }
  }, [toast, queryClient]);

  /* ── Filtering ── */
  const filtered = products.filter((p) => {
    const displayName = p.custom_name || p.name;
    const matchesSearch =
      !search.trim() ||
      displayName.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.origin ?? "").toLowerCase().includes(search.toLowerCase());

    const matchesSource =
      sourceFilter === "all" ||
      p.source === sourceFilter;

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && p.is_active) ||
      (statusFilter === "archived" && !p.is_active);

    return matchesSearch && matchesSource && matchesStatus;
  });

  const shopifyCount = products.filter((p) => p.source === "shopify").length;
  const manualCount = products.filter((p) => p.source === "manual").length;
  const activeCount = products.filter((p) => p.is_active).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{products.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Active</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{activeCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">From Shopify</p>
          <p className="text-2xl font-medium tabular-nums text-green-600">{shopifyCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Manual</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{manualCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-52"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Source filter pills */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(["all", "shopify", "manual"] as SourceFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  sourceFilter === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s === "all" ? "All" : s === "shopify" ? "Shopify" : "Manual"}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(["all", "active", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors capitalize",
                  statusFilter === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4" /> Add Product
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSyncShopify}
            disabled={syncingShopify}
          >
            <RefreshCw className={cn("w-4 h-4", syncingShopify && "animate-spin")} />
            {syncingShopify ? "Syncing…" : "Sync Shopify"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {error && (
          <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-foreground">Failed to load products</p>
            <p className="mt-1 text-xs text-muted-foreground">{String(error)}</p>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Product</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">€/kg</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading products…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((product) => {
                  const displayName = product.custom_name || product.name;
                  const displayPrice = product.custom_price_per_kg ?? product.price_per_kg;
                  return (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => {
                        setSelectedProduct(product as unknown as AdminProduct);
                        setProductDetailOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt=""
                              className="h-9 w-9 rounded object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                              <Coffee className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-foreground text-sm">{displayName}</p>
                            {product.custom_name && product.custom_name !== product.name && (
                              <p className="text-xs text-muted-foreground">{product.name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {product.origin ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground">
                        {product.sku ?? "—"}
                      </TableCell>
                      <TableCell>
                        <SourceBadge source={product.source} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground font-medium">
                        €{displayPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            product.is_active ? "text-green-600" : "text-muted-foreground",
                          )}
                        >
                          {product.is_active ? "Active" : "Archived"}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductToDelete(product);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Product dialog */}
      <AddProductDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["products"] })}
      />

      {/* Edit Product dialog */}
      <AdminProductDetail
        product={selectedProduct}
        open={productDetailOpen}
        onOpenChange={setProductDetailOpen}
        onSaved={() => {
          setProductDetailOpen(false);
          queryClient.invalidateQueries({ queryKey: ["products"] });
        }}
      />

      {/* Delete confirmation */}
      {productToDelete && (
        <Dialog open onOpenChange={(open) => { if (!open) setProductToDelete(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete product?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently delete "{productToDelete.custom_name || productToDelete.name}" and all its size variants. This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProductToDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(productToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
