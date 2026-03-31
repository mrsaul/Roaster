import { useState, useRef } from "react";
import { Plus, X, Upload, Loader2, Link2, Unlink2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const SUGGESTED_TAGS = [
  "espresso", "filter", "blend", "single origin",
  "chocolate", "fruity", "nutty", "floral", "caramel", "citrus",
  "high body", "medium body", "light body",
  "low acidity", "medium acidity", "bright acidity",
];

const SIZE_OPTIONS = [
  { label: "250g", kg: 0.25 },
  { label: "1kg", kg: 1 },
  { label: "3kg", kg: 3 },
];

type SizeVariant = {
  size_label: string;
  size_kg: number;
  price: number;
  sku: string;
  is_active: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddProductDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Basic info
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [process, setProcess] = useState("");
  const [description, setDescription] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [roastLevel, setRoastLevel] = useState("");

  // Sellsy
  const [dataSourceMode, setDataSourceMode] = useState<"custom" | "sellsy">("custom");
  const [sellsyId, setSellsyId] = useState("");

  // Image
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tempProductId] = useState(() => crypto.randomUUID());

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Variants
  const [variants, setVariants] = useState<SizeVariant[]>([]);

  // Status
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setOrigin(""); setProcess(""); setDescription("");
    setPricePerKg(""); setRoastLevel(""); setDataSourceMode("custom");
    setSellsyId(""); setImageUrl(""); setTags([]); setTagInput("");
    setVariants([]); setIsActive(true);
  };

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !tags.includes(normalized)) setTags([...tags, normalized]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const addVariant = (opt: typeof SIZE_OPTIONS[number]) => {
    if (variants.some((v) => v.size_label === opt.label)) return;
    const basePrice = parseFloat(pricePerKg) || 0;
    setVariants((prev) => [
      ...prev,
      { size_label: opt.label, size_kg: opt.kg, price: +(basePrice * opt.kg).toFixed(2), sku: "", is_active: true },
    ]);
  };

  const removeVariant = (idx: number) => setVariants((prev) => prev.filter((_, i) => i !== idx));

  const updateVariant = (idx: number, field: keyof SizeVariant, value: any) => {
    setVariants((prev) => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${tempProductId}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      setImageUrl(`${urlData.publicUrl}?t=${Date.now()}`);
      toast({ title: "Image uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }

    const price = parseFloat(pricePerKg);
    if (isNaN(price) || price <= 0) {
      toast({ title: "Please set a valid base price per kg", variant: "destructive" });
      return;
    }

    const activeVariants = variants.filter((v) => v.is_active);
    if (variants.length > 0 && activeVariants.length === 0) {
      toast({ title: "At least one size must be active", variant: "destructive" });
      return;
    }

    for (const v of activeVariants) {
      if (!v.price || v.price <= 0) {
        toast({ title: `Price required for ${v.size_label}`, variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const effectiveSellsyId = dataSourceMode === "sellsy" && sellsyId.trim()
        ? sellsyId.trim()
        : `app-${tempProductId.slice(0, 8)}`;

      const { data: product, error } = await supabase.from("products").insert({
        id: tempProductId,
        name: name.trim(),
        origin: origin.trim() || null,
        process: process || null,
        description: description.trim() || null,
        price_per_kg: price,
        roast_level: roastLevel || null,
        image_url: imageUrl || null,
        tags,
        is_active: isActive,
        data_source_mode: dataSourceMode,
        custom_name: dataSourceMode === "custom" ? name.trim() : null,
        custom_price_per_kg: dataSourceMode === "custom" ? price : null,
        sellsy_id: effectiveSellsyId,
      }).select("id").single();

      if (error) throw error;

      // Insert variants
      if (variants.length > 0) {
        const rows = variants.map((v) => ({
          product_id: product.id,
          size_label: v.size_label,
          size_kg: v.size_kg,
          price: v.price,
          sku: v.sku || null,
          is_active: v.is_active,
        }));
        const { error: varErr } = await supabase.from("product_variants").insert(rows);
        if (varErr) throw varErr;
      }

      toast({ title: "Product created" });
      reset();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Create failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const availableSizes = SIZE_OPTIONS.filter((opt) => !variants.some((v) => v.size_label === opt.label));
  const suggestionsFiltered = SUGGESTED_TAGS.filter((t) => !tags.includes(t.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>Create a new coffee reference with sizes and pricing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Data Source Mode */}
          <div className="rounded-xl border-2 border-border p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Data Source</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDataSourceMode("sellsy")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                  dataSourceMode === "sellsy" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Link2 className={cn("h-4 w-4 shrink-0", dataSourceMode === "sellsy" ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", dataSourceMode === "sellsy" ? "text-primary" : "text-foreground")}>Sync with Sellsy</p>
                  <p className="text-[11px] text-muted-foreground">Linked to Sellsy</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDataSourceMode("custom")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                  dataSourceMode === "custom" ? "border-accent-foreground bg-accent/50" : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Unlink2 className={cn("h-4 w-4 shrink-0", dataSourceMode === "custom" ? "text-accent-foreground" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", dataSourceMode === "custom" ? "text-accent-foreground" : "text-foreground")}>App Only</p>
                  <p className="text-[11px] text-muted-foreground">Managed locally</p>
                </div>
              </button>
            </div>
            {dataSourceMode === "sellsy" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Sellsy Product ID</p>
                <Input value={sellsyId} onChange={(e) => setSellsyId(e.target.value)} placeholder="e.g. 12345" />
              </div>
            )}
          </div>

          {/* Basic Info */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Product Name *</p>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Colombia Huila" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Base Price per kg (€) *</p>
              <Input type="number" step="0.01" min="0" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} placeholder="e.g. 18.00" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Origin</p>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Ethiopia, Yirgacheffe" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Process</p>
              <div className="flex gap-1.5">
                {["washed", "natural", "honey"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProcess(process === p ? "" : p)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      process === p
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Roast Level</p>
              <div className="flex gap-1.5">
                {["light", "medium", "dark"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoastLevel(roastLevel === r ? "" : r)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      roastLevel === r
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Description</p>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" />
            </div>
          </div>

          {/* Image */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Product image (square)</p>
            <div className="max-w-[200px]">
              <AspectRatio ratio={1}>
                {imageUrl ? (
                  <img src={imageUrl} alt={name} className="h-full w-full rounded-lg object-cover border border-border" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground">No image</p>
                  </div>
                )}
              </AspectRatio>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} className="gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 rounded-full p-0.5 hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                className="max-w-[200px]"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {suggestionsFiltered.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {suggestionsFiltered.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Size Variants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Bag Sizes & Pricing</p>
              {pricePerKg && <p className="text-[11px] text-muted-foreground">Base: €{parseFloat(pricePerKg).toFixed(2)}/kg</p>}
            </div>

            {variants.length > 0 && (
              <div className="space-y-2">
                {variants.map((variant, idx) => (
                  <div key={variant.size_label} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                    <div className="w-14 text-center">
                      <span className="text-sm font-semibold text-foreground">{variant.size_label}</span>
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-muted-foreground w-10 shrink-0">Price</label>
                        <Input
                          type="number" step="0.01" min="0"
                          value={variant.price}
                          onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) updateVariant(idx, "price", val); }}
                          className="h-7 text-sm tabular-nums w-24"
                        />
                        <span className="text-[11px] text-muted-foreground">€</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-muted-foreground w-10 shrink-0">SKU</label>
                        <Input
                          value={variant.sku}
                          onChange={(e) => updateVariant(idx, "sku", e.target.value)}
                          placeholder="Optional"
                          className="h-7 text-sm font-mono w-32"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={variant.is_active} onCheckedChange={(v) => updateVariant(idx, "is_active", v)} />
                      <button
                        onClick={() => removeVariant(idx)}
                        className="w-7 h-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
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

            {variants.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Add bag sizes above. Without variants, the product uses the base per-kg pricing.
              </p>
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">Visible to clients in the shop</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Product
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
