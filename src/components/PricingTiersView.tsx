import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Percent, Bike, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type PricingTier = {
  id: string;
  name: string;
  description: string | null;
  product_discount_percent: number;
  delivery_discount_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function PricingTiersView() {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTier, setEditTier] = useState<PricingTier | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTier, setDeleteTier] = useState<PricingTier | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productDiscount, setProductDiscount] = useState(0);
  const [deliveryDiscount, setDeliveryDiscount] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const loadTiers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pricing_tiers")
        .select("*")
        .order("name");
      if (error) throw error;
      setTiers((data ?? []) as PricingTier[]);
    } catch (err) {
      toast({ title: "Failed to load pricing tiers", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadTiers(); }, [loadTiers]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setProductDiscount(0);
    setDeliveryDiscount(0);
    setIsActive(true);
  };

  const openEdit = (tier: PricingTier) => {
    setName(tier.name);
    setDescription(tier.description ?? "");
    setProductDiscount(tier.product_discount_percent);
    setDeliveryDiscount(tier.delivery_discount_percent);
    setIsActive(tier.is_active);
    setEditTier(tier);
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        product_discount_percent: productDiscount,
        delivery_discount_percent: deliveryDiscount,
        is_active: isActive,
      };

      if (editTier) {
        const { error } = await supabase
          .from("pricing_tiers")
          .update(payload)
          .eq("id", editTier.id);
        if (error) throw error;
        toast({ title: "Tier updated" });
        setEditTier(null);
      } else {
        const { error } = await supabase
          .from("pricing_tiers")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Tier created" });
        setShowCreate(false);
      }
      resetForm();
      void loadTiers();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTier) return;
    try {
      const { error } = await supabase.from("pricing_tiers").delete().eq("id", deleteTier.id);
      if (error) throw error;
      toast({ title: "Tier deleted" });
      setDeleteTier(null);
      void loadTiers();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  const dialogOpen = showCreate || !!editTier;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pricing Tiers</h2>
          <p className="text-sm text-muted-foreground">Create reusable pricing templates to assign to clients.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> New Tier
        </Button>
      </div>

      {/* Tiers table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Product Discount</TableHead>
              <TableHead className="text-center">Delivery Discount</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            ) : tiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No pricing tiers yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              tiers.map((tier) => (
                <TableRow key={tier.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">{tier.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{tier.description ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {tier.product_discount_percent > 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <Percent className="w-3 h-3" />
                        {tier.product_discount_percent}% off
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {tier.delivery_discount_percent > 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <Bike className="w-3 h-3" />
                        {tier.delivery_discount_percent === 100 ? "Free" : `${tier.delivery_discount_percent}% off`}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={tier.is_active ? "default" : "secondary"} className="text-[10px]">
                      {tier.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                        onClick={() => openEdit(tier)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="w-7 h-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setDeleteTier(tier)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setShowCreate(false); setEditTier(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTier ? "Edit Pricing Tier" : "Create Pricing Tier"}</DialogTitle>
            <DialogDescription>
              {editTier ? "Update this pricing template." : "Define a reusable pricing template for clients."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tier VIP" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 30% off all products + free delivery" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Product Discount (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={productDiscount}
                  onChange={(e) => setProductDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Delivery Discount (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={deliveryDiscount}
                  onChange={(e) => setDeliveryDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
                />
                <p className="text-[11px] text-muted-foreground mt-1">100% = Free delivery</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <label className="text-sm text-foreground">Active</label>
            </div>

            {/* Preview */}
            {(productDiscount > 0 || deliveryDiscount > 0) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium text-foreground">Preview (on €100 order):</p>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>Subtotal: €100.00</p>
                  {productDiscount > 0 && (
                    <p className="text-primary">Discount ({productDiscount}%): −€{(100 * productDiscount / 100).toFixed(2)}</p>
                  )}
                  {deliveryDiscount > 0 && (
                    <p className="text-primary">
                      Delivery: {deliveryDiscount === 100 ? "Free" : `${deliveryDiscount}% off`}
                    </p>
                  )}
                  <p className="font-medium text-foreground">
                    Total: €{(100 - 100 * productDiscount / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditTier(null); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editTier ? "Save Changes" : "Create Tier"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTier} onOpenChange={(v) => !v && setDeleteTier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTier?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the pricing tier. Clients assigned to this tier will no longer have a tier. Existing orders won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
