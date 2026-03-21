import { useState, useRef } from "react";
import { X, Upload, Plus, Loader2 } from "lucide-react";
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

  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [tastingNotes, setTastingNotes] = useState(product?.tasting_notes ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [process, setProcess] = useState(product?.process ?? "");
  const [origin, setOrigin] = useState(product?.origin ?? "");
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset state when product changes
  const [lastProductId, setLastProductId] = useState<string | null>(null);
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id);
    setImageUrl(product.image_url ?? "");
    setTags(product.tags ?? []);
    setTastingNotes(product.tasting_notes ?? "");
    setIsActive(product.is_active);
    setProcess(product.process ?? "");
    setOrigin(product.origin ?? "");
    setTagInput("");
  }

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
      const { error } = await supabase
        .from("products")
        .update({
          image_url: imageUrl || null,
          tags,
          tasting_notes: tastingNotes || null,
          is_active: isActive,
          process: process || null,
          origin: origin || null,
        })
        .eq("id", product.id);
      if (error) throw error;
      toast({ title: "Product updated" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  const suggestionsFiltered = SUGGESTED_TAGS.filter((t) => !tags.includes(t.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Edit app-only display fields — these are not synced to Sellsy.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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

          {/* Sellsy info (read-only) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Roast level</p>
              <p className="mt-1 text-sm font-medium text-foreground capitalize">{product.roast_level ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="mt-1 text-sm font-medium text-foreground">€{product.price_per_kg.toFixed(2)}/kg</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">SKU</p>
              <p className="mt-1 text-sm font-mono text-foreground">{product.sku ?? "—"}</p>
            </div>
          </div>

          {/* Image (1:1) */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Product image (square)</p>
            <div className="max-w-[200px]">
              <AspectRatio ratio={1}>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="h-full w-full rounded-lg object-cover border border-border"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground">No image</p>
                  </div>
                )}
              </AspectRatio>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="gap-2"
            >
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                }}
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

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">Visible to clients in the shop</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Save */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
