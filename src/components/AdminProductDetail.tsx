import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, Plus, Loader2, AlertTriangle, Link2, Unlink2, Save, CloudOff } from "lucide-react";
import { ProductVariantsEditor } from "./ProductVariantsEditor";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AdminProduct = {
  id: string;
  sellsy_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  is_active: boolean;
  synced_at: string;
  image_url: string | null;
  tags: string[];
  tasting_notes: string | null;
  process: string | null;
  data_source_mode: "sellsy" | "custom";
  custom_name: string | null;
  custom_price_per_kg: number | null;
};

// ── Draft-persisted form type ─────────────────────────────────────────────────
type ProductFormData = {
  imageUrl: string;
  tags: string[];
  tastingNotes: string;
  isActive: boolean;
  process: string;
  origin: string;
  dataSourceMode: "sellsy" | "custom";
  customName: string;
  customPrice: string;
};

function productToForm(product: AdminProduct): ProductFormData {
  return {
    imageUrl: product.image_url ?? "",
    tags: product.tags ?? [],
    tastingNotes: product.tasting_notes ?? "",
    isActive: product.is_active,
    process: product.process ?? "",
    origin: product.origin ?? "",
    dataSourceMode: product.data_source_mode ?? "sellsy",
    customName: product.custom_name ?? "",
    customPrice: product.custom_price_per_kg?.toString() ?? "",
  };
}

const PRODUCT_FORM_DEFAULT: ProductFormData = {
  imageUrl: "", tags: [], tastingNotes: "", isActive: true,
  process: "", origin: "", dataSourceMode: "sellsy", customName: "", customPrice: "",
};

const SUGGESTED_TAGS = [
  "espresso", "filter", "blend", "single origin",
  "chocolate", "fruity", "nutty", "floral", "caramel", "citrus",
  "high body", "medium body", "light body",
  "low acidity", "medium acidity", "bright acidity",
  "Brazil", "Ethiopia", "Colombia", "Kenya", "Guatemala", "Costa Rica", "Indonesia",
];

interface Props {
  product: AdminProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AdminProductDetail({ product, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Transient UI state — not persisted
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<"sellsy" | "custom" | null>(null);
  const [pendingClose, setPendingClose] = useState(false);

  // Dynamic draft key per product; defaultValue is always current DB values
  const draftKey = product ? `admin-product-edit:${product.id}` : "admin-product-none";
  const draftDefault = product ? productToForm(product) : PRODUCT_FORM_DEFAULT;

  const {
    value: form,
    setValue: setForm,
    clearDraft,
    discardDraft,
    flushDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<ProductFormData>(draftKey, draftDefault);

  // ── Flush draft to localStorage the instant the tab hides ─────────────────
  // This guarantees that even if the user switches tabs within the 500ms
  // debounce window, no keystrokes are lost.
  useEffect(() => {
    if (!open) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [open, flushDraft]);

  // ── Warn the user before closing the browser tab / refreshing ─────────────
  useEffect(() => {
    if (!open) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges()) {
        e.preventDefault();
        // Modern browsers show their own generic message; setting returnValue
        // is required for the dialog to appear at all.
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // hasChanges is stable via useCallback — safe to omit from deps

  const { imageUrl, tags, tastingNotes, isActive, process, origin, dataSourceMode, customName, customPrice } = form;

  // Field setters
  const setImageUrl = useCallback((v: string) => setForm(p => ({ ...p, imageUrl: v })), [setForm]);
  const setTags = useCallback((v: string[]) => setForm(p => ({ ...p, tags: v })), [setForm]);
  const setTastingNotes = useCallback((v: string) => setForm(p => ({ ...p, tastingNotes: v })), [setForm]);
  const setIsActive = useCallback((v: boolean) => setForm(p => ({ ...p, isActive: v })), [setForm]);
  const setProcess = useCallback((v: string) => setForm(p => ({ ...p, process: v })), [setForm]);
  const setOrigin = useCallback((v: string) => setForm(p => ({ ...p, origin: v })), [setForm]);
  const setCustomName = useCallback((v: string) => setForm(p => ({ ...p, customName: v })), [setForm]);
  const setCustomPrice = useCallback((v: string) => setForm(p => ({ ...p, customPrice: v })), [setForm]);

  const hasChanges = useCallback(() => {
    if (!product) return false;
    const db = productToForm(product);
    return (
      imageUrl !== db.imageUrl ||
      JSON.stringify(tags) !== JSON.stringify(db.tags) ||
      tastingNotes !== db.tastingNotes ||
      isActive !== db.isActive ||
      process !== db.process ||
      origin !== db.origin ||
      dataSourceMode !== db.dataSourceMode ||
      customName !== db.customName ||
      customPrice !== db.customPrice
    );
  }, [product, imageUrl, tags, tastingNotes, isActive, process, origin, dataSourceMode, customName, customPrice]);

  const isSellsyMode = dataSourceMode === "sellsy";

  const handleModeSwitch = (newMode: "sellsy" | "custom") => {
    if (newMode === dataSourceMode) return;
    setPendingModeSwitch(newMode);
  };

  const confirmModeSwitch = () => {
    if (!pendingModeSwitch || !product) return;
    if (pendingModeSwitch === "custom") {
      setForm(p => ({ ...p, dataSourceMode: "custom", customName: product.name, customPrice: product.price_per_kg.toString() }));
    } else {
      setForm(p => ({ ...p, dataSourceMode: "sellsy", customName: "", customPrice: "" }));
    }
    setPendingModeSwitch(null);
  };

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !tags.includes(normalized)) {
      setTags([...tags, normalized]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !product) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${product.id}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setImageUrl(publicUrl);
      toast({ title: "Image uploaded" });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const parsedPrice = customPrice ? parseFloat(customPrice) : null;
      const { error } = await supabase
        .from("products")
        .update({
          image_url: imageUrl || null,
          tags,
          tasting_notes: tastingNotes || null,
          is_active: isActive,
          process: process || null,
          origin: origin || null,
          data_source_mode: dataSourceMode,
          custom_name: dataSourceMode === "custom" ? (customName || null) : null,
          custom_price_per_kg: dataSourceMode === "custom" ? parsedPrice : null,
        })
        .eq("id", product.id);
      if (error) throw error;
      clearDraft();
      toast({ title: "Product updated" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    discardDraft();
    setTagInput("");
    toast({ title: "Changes discarded" });
  };

  const handleClose = (openState: boolean) => {
    if (!openState && hasChanges()) {
      setPendingClose(true);
      return;
    }
    onOpenChange(openState);
  };

  const confirmClose = () => {
    setPendingClose(false);
    onOpenChange(false);
  };

  if (!product) return null;

  const displayName = dataSourceMode === "custom" && customName ? customName : product.name;
  const displayPrice = dataSourceMode === "custom" && customPrice ? parseFloat(customPrice) : product.price_per_kg;
  const suggestionsFiltered = SUGGESTED_TAGS.filter((t) => !tags.includes(t.toLowerCase()));
  const dirty = hasChanges();

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {displayName}
              {dirty && (
                <Badge variant="outline" className="ml-2 gap-1 text-[11px] border-amber-400 text-amber-600 bg-amber-50">
                  <CloudOff className="h-3 w-3" />
                  Unsaved changes
                </Badge>
              )}
              {!dirty && draftSavedAt && (
                <Badge variant="outline" className="ml-2 gap-1 text-[11px] border-green-400 text-green-600 bg-green-50">
                  <Save className="h-3 w-3" />
                  All saved
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Manage product display and data source.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {showDraftBanner && draftSavedAt && (
              <DraftBanner savedAt={draftSavedAt} onDiscard={handleDiscard} />
            )}

            {/* Data Source Mode */}
            <div className="rounded-xl border-2 border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Data Source</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeSwitch("sellsy")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                    isSellsyMode
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Link2 className={cn("h-4 w-4 shrink-0", isSellsyMode ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <p className={cn("text-sm font-medium", isSellsyMode ? "text-primary" : "text-foreground")}>Sync with Sellsy</p>
                    <p className="text-[11px] text-muted-foreground">Auto-synced data</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch("custom")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                    !isSellsyMode
                      ? "border-accent-foreground bg-accent/50"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Unlink2 className={cn("h-4 w-4 shrink-0", !isSellsyMode ? "text-accent-foreground" : "text-muted-foreground")} />
                  <div>
                    <p className={cn("text-sm font-medium", !isSellsyMode ? "text-accent-foreground" : "text-foreground")}>Custom Override</p>
                    <p className="text-[11px] text-muted-foreground">App-only pricing</p>
                  </div>
                </button>
              </div>

              {isSellsyMode ? (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-primary font-medium">Synced with Sellsy — name and price are read-only</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-accent/30 border border-accent px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent-foreground" />
                  <p className="text-xs text-accent-foreground font-medium">Custom override active — invoices may differ from app pricing</p>
                </div>
              )}
            </div>

            {/* Name & Price */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Product Name</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">{product.name}</p>
                  </div>
                ) : (
                  <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={product.name} />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Price per kg (€)</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium tabular-nums text-foreground">€{product.price_per_kg.toFixed(2)}</p>
                  </div>
                ) : (
                  <Input type="number" step="0.01" min="0" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder={product.price_per_kg.toFixed(2)} />
                )}
              </div>
            </div>

            {!isSellsyMode && (
              <div className="rounded-lg bg-muted/30 border border-dashed border-border px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Sellsy reference: <span className="font-medium">{product.name}</span> — €{product.price_per_kg.toFixed(2)}/kg
                </p>
              </div>
            )}

            {/* Editable info */}
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

            {/* Sellsy read-only info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Roast level</p>
                <p className="mt-1 text-sm font-medium text-foreground capitalize">{product.roast_level ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">SKU</p>
                <p className="mt-1 text-sm font-mono text-foreground">{product.sku ?? "—"}</p>
              </div>
            </div>

            {/* Image */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Product image (square)</p>
              <div className="max-w-[200px]">
                <AspectRatio ratio={1}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={product.name} className="h-full w-full rounded-lg object-cover border border-border" />
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
                  {suggestionsFiltered.slice(0, 12).map((tag) => (
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

            {/* Tasting notes */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Tasting notes <span className="text-muted-foreground font-normal">({tastingNotes.length}/120)</span>
              </p>
              <Input
                value={tastingNotes}
                onChange={(e) => setTastingNotes(e.target.value.slice(0, 120))}
                placeholder="e.g. Bright citrus acidity, chocolate finish, silky body"
                maxLength={120}
              />
            </div>

            {/* Bag Size Variants */}
            <ProductVariantsEditor productId={product.id} productName={displayName} basePricePerKg={displayPrice} />

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Active</p>
                <p className="text-xs text-muted-foreground">Visible to clients in the shop</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Save / Discard */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <div>
                {dirty && (
                  <Button variant="ghost" size="sm" onClick={handleDiscard} className="text-muted-foreground hover:text-destructive">
                    Discard changes
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mode switch confirmation */}
      <AlertDialog open={!!pendingModeSwitch} onOpenChange={(open) => !open && setPendingModeSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {pendingModeSwitch === "custom" ? "Switch to Custom Override?" : "Switch to Sellsy Sync?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingModeSwitch === "custom"
                ? "You are overriding Sellsy data. Invoices may differ from app pricing. The Sellsy reference values will still be visible for comparison."
                : "App changes to name and price will be lost and replaced by Sellsy data on the next sync."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeSwitch}>
              {pendingModeSwitch === "custom" ? "Use Custom Override" : "Restore Sellsy Sync"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes close confirmation */}
      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unsaved changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Your draft has been saved locally and will be restored when you reopen this product. Close anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>Close anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
