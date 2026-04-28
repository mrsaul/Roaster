import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { getCachedUid } from "@/hooks/useDraftPersistence";

// ── Constants ─────────────────────────────────────────────────────────────────

const SIZE_OPTIONS = [
  { label: "250g", kg: 0.25 },
  { label: "1kg", kg: 1 },
  { label: "3kg", kg: 3 },
];

const VARIANTS_DRAFT_PREFIX = "draft:variants";

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = {
  id?: string;
  size_label: string;
  size_kg: number;
  price: number;
  sku: string;
  is_active: boolean;
  isNew?: boolean;
};

// ── localStorage helpers ───────────────────────────────────────────────────────

function variantsDraftKey(productId: string): string {
  // Use cached uid if available; fall back to __anon__ for key construction.
  // This matches what useDraftPersistence does.
  const uid = getCachedUid() ?? "__anon__";
  return `${VARIANTS_DRAFT_PREFIX}:${productId}:${uid}`;
}

function loadVariantsDraft(productId: string): Variant[] | null {
  try {
    const raw = localStorage.getItem(variantsDraftKey(productId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Variant[]; savedAt: string };
    return Array.isArray(parsed?.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveVariantsDraft(productId: string, variants: Variant[]): void {
  try {
    localStorage.setItem(
      variantsDraftKey(productId),
      JSON.stringify({ data: variants, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Ignore quota errors
  }
}

function clearVariantsDraft(productId: string): void {
  try {
    localStorage.removeItem(variantsDraftKey(productId));
  } catch { /* ignore */ }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductVariantsEditorProps {
  productId: string;
  productName: string;
  basePricePerKg: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductVariantsEditor({ productId, productName, basePricePerKg }: ProductVariantsEditorProps) {
  const { toast } = useToast();
  const [variants, setVariantsRaw] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const variantsRef = useRef<Variant[]>([]);

  // ── Persist variants to localStorage on every change (debounced 400ms) ──
  const setVariants = useCallback((updater: Variant[] | ((prev: Variant[]) => Variant[])) => {
    setVariantsRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      variantsRef.current = next;

      // Debounced localStorage save
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveVariantsDraft(productId, variantsRef.current);
      }, 400);

      return next;
    });
  }, [productId]);

  // ── Flush immediately (used on tab hide and before DB save) ─────────────
  const flushVariantsDraft = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveVariantsDraft(productId, variantsRef.current);
  }, [productId]);

  // ── Load: prefer localStorage draft, fall back to DB ────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // 1. Check for a local draft first
      const draft = loadVariantsDraft(productId);
      if (draft !== null) {
        if (!cancelled) {
          variantsRef.current = draft;
          setVariantsRaw(draft);
          setLoading(false);
        }
        return;
      }

      // 2. No draft — load from DB
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size_label, size_kg, price, sku, is_active")
        .eq("product_id", productId)
        .order("size_kg", { ascending: true });

      if (cancelled) return;

      if (error) {
        toast({ title: "Failed to load variants", variant: "destructive" });
        setLoading(false);
        return;
      }

      const mapped: Variant[] = (data ?? []).map((v: any) => ({
        id: v.id,
        size_label: v.size_label,
        size_kg: Number(v.size_kg),
        price: Number(v.price),
        sku: v.sku ?? "",
        is_active: v.is_active,
      }));

      variantsRef.current = mapped;
      setVariantsRaw(mapped);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]); // intentionally omit `toast` — it's stable and would cause spurious reloads

  // ── Flush on tab hide ────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushVariantsDraft();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [flushVariantsDraft]);

  // ── Cleanup debounce on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Variant mutations ────────────────────────────────────────────────────

  const addVariant = (option: typeof SIZE_OPTIONS[number]) => {
    if (variants.some((v) => v.size_label === option.label)) return;
    const suggestedPrice = +(basePricePerKg * option.kg).toFixed(2);
    setVariants((prev) => [
      ...prev,
      {
        size_label: option.label,
        size_kg: option.kg,
        price: suggestedPrice,
        sku: "",
        is_active: true,
        isNew: true,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof Variant, value: any) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );
  };

  // ── Save to DB ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    // Flush any pending draft save before the DB write
    flushVariantsDraft();
    try {
      // Delete all existing variants for this product, then insert
      await supabase.from("product_variants").delete().eq("product_id", productId);

      if (variants.length > 0) {
        const rows = variants.map((v) => ({
          product_id: productId,
          size_label: v.size_label,
          size_kg: v.size_kg,
          price: v.price,
          sku: v.sku || null,
          is_active: v.is_active,
        }));
        const { error } = await supabase.from("product_variants").insert(rows);
        if (error) throw error;
      }

      // Clear the local draft — DB is now the source of truth
      clearVariantsDraft(productId);
      toast({ title: "Variants saved" });
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const availableSizes = SIZE_OPTIONS.filter(
    (opt) => !variants.some((v) => v.size_label === opt.label),
  );

  // Suppress unused-variable warning (kept for semantic clarity in JSX)
  void productName;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading variants…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Bag Sizes & Pricing</p>
        <p className="text-[11px] text-muted-foreground">Base: €{basePricePerKg.toFixed(2)}/kg</p>
      </div>

      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((variant, index) => (
            <div
              key={variant.size_label}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5"
            >
              <div className="w-14 text-center">
                <span className="text-sm font-semibold text-foreground">{variant.size_label}</span>
              </div>

              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-10 shrink-0">Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={variant.price}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) updateVariant(index, "price", val);
                    }}
                    className="h-7 text-sm tabular-nums w-24"
                  />
                  <span className="text-[11px] text-muted-foreground">€</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted-foreground w-10 shrink-0">SKU</label>
                  <Input
                    value={variant.sku}
                    onChange={(e) => updateVariant(index, "sku", e.target.value)}
                    placeholder="Optional"
                    className="h-7 text-sm font-mono w-32"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={variant.is_active}
                  onCheckedChange={(v) => updateVariant(index, "is_active", v)}
                />
                <button
                  onClick={() => removeVariant(index)}
                  className="w-7 h-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {availableSizes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableSizes.map((opt) => (
            <button
              key={opt.label}
              onClick={() => addVariant(opt)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> {opt.label}
            </button>
          ))}
        </div>
      )}

      {variants.length > 0 && (
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? "Saving…" : "Save Variants"}
        </Button>
      )}

      {variants.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No size variants configured. Add sizes above, or the product will use the legacy per-kg pricing.
        </p>
      )}
    </div>
  );
}
