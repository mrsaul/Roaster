import { useState, useMemo, useCallback } from "react";
import { Plus, Minus, Trash2, X, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export type SimpleClient = {
  user_id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  custom_company_name: string | null;
  client_data_mode: string;
  pricing_tier_id: string | null;
};

export type SimpleProduct = {
  id: string;
  name: string;
  custom_name: string | null;
  sku: string | null;
  price_per_kg: number;
  custom_price_per_kg: number | null;
  data_source_mode: string;
  is_active: boolean;
};

type LineItem = {
  product: SimpleProduct;
  quantity: number;
  price_per_kg: number;
};

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: SimpleClient[];
  products: SimpleProduct[];
  onCreated: () => void;
}

export function CreateOrderDialog({ open, onOpenChange, clients, products, onCreated }: CreateOrderDialogProps) {
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [clientTier, setClientTier] = useState<{ name: string; product_discount_percent: number; delivery_discount_percent: number } | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);

  const totalKg = useMemo(() => lineItems.reduce((s, i) => s + i.quantity, 0), [lineItems]);
  const subtotal = useMemo(() => lineItems.reduce((s, i) => s + i.quantity * i.price_per_kg, 0), [lineItems]);
  const discountAmount = clientTier ? subtotal * clientTier.product_discount_percent / 100 : 0;
  const totalPrice = subtotal - discountAmount;

  const addProduct = useCallback((product: SimpleProduct) => {
    if (lineItems.some((i) => i.product.id === product.id)) return;
    const price = product.data_source_mode === "custom" && product.custom_price_per_kg != null
      ? product.custom_price_per_kg : product.price_per_kg;
    setLineItems((prev) => [...prev, { product, quantity: 3, price_per_kg: price }]);
  }, [lineItems]);

  const updateQty = useCallback((productId: string, delta: number) => {
    setLineItems((prev) => prev.map((i) =>
      i.product.id === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
    ));
  }, []);

  const updatePrice = useCallback((productId: string, price: number) => {
    setLineItems((prev) => prev.map((i) =>
      i.product.id === productId ? { ...i, price_per_kg: price } : i
    ));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setLineItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const resetForm = useCallback(() => {
    setSelectedClientId("");
    setDeliveryDate(undefined);
    setNotes("");
    setLineItems([]);
    setClientTier(null);
  }, []);

  // Load tier when client changes
  const handleClientChange = useCallback(async (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.user_id === clientId);
    if (client?.pricing_tier_id) {
      const { data } = await supabase
        .from("pricing_tiers")
        .select("name, product_discount_percent, delivery_discount_percent")
        .eq("id", client.pricing_tier_id)
        .single();
      if (data) setClientTier(data as { name: string; product_discount_percent: number; delivery_discount_percent: number });
      else setClientTier(null);
    } else {
      setClientTier(null);
    }
  }, [clients]);

  const handleSave = useCallback(async () => {
    if (!selectedClientId) { toast({ title: "Select a client", variant: "destructive" }); return; }
    if (!deliveryDate) { toast({ title: "Select a delivery date", variant: "destructive" }); return; }
    if (lineItems.length === 0) { toast({ title: "Add at least one product", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        user_id: selectedClientId,
        delivery_date: format(deliveryDate, "yyyy-MM-dd"),
        total_kg: totalKg,
        total_price: totalPrice,
        status: "received",
        invoicing_status: "not_sent",
      }).select("id").single();

      if (orderErr || !order) throw orderErr || new Error("Failed to create order");

      const items = lineItems.map((i) => ({
        order_id: order.id,
        product_id: i.product.id,
        product_name: i.product.data_source_mode === "custom" && i.product.custom_name
          ? i.product.custom_name : i.product.name,
        product_sku: i.product.sku,
        quantity: i.quantity,
        price_per_kg: i.price_per_kg,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(items);
      if (itemsErr) throw itemsErr;

      // Log status history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("order_status_history").insert({
          order_id: order.id,
          status: "received",
          changed_by: user.id,
        });
      }

      toast({ title: "Order created successfully" });
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast({ title: "Failed to create order", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [selectedClientId, deliveryDate, lineItems, totalKg, totalPrice, toast, resetForm, onOpenChange, onCreated]);

  const getClientLabel = (c: SimpleClient) => {
    const name = c.client_data_mode === "custom" && c.custom_company_name
      ? c.custom_company_name : c.company_name;
    return name || c.email || c.user_id.slice(0, 8);
  };

  const getProductLabel = (p: SimpleProduct) =>
    p.data_source_mode === "custom" && p.custom_name ? p.custom_name : p.name;

  const availableProducts = activeProducts.filter((p) => !lineItems.some((i) => i.product.id === p.id));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>Create an order on behalf of a client.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Client</label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{getClientLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delivery date */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Delivery Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !deliveryDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deliveryDate ? format(deliveryDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deliveryDate}
                  onSelect={setDeliveryDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Line items */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Products</label>
            {lineItems.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden mb-3">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty (kg)</TableHead>
                      <TableHead className="text-right">€/kg</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item) => (
                      <TableRow key={item.product.id}>
                        <TableCell className="font-medium text-foreground">{getProductLabel(item.product)}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              className="w-6 h-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:bg-muted transition-colors"
                              onClick={() => updateQty(item.product.id, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val > 0) {
                                  setLineItems((prev) => prev.map((i) =>
                                    i.product.id === item.product.id ? { ...i, quantity: val } : i
                                  ));
                                }
                              }}
                              className="w-14 h-6 text-center text-sm tabular-nums px-1"
                            />
                            <button
                              className="w-6 h-6 rounded flex items-center justify-center border border-border text-muted-foreground hover:bg-muted transition-colors"
                              onClick={() => updateQty(item.product.id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={item.price_per_kg}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val)) updatePrice(item.product.id, val);
                            }}
                            className="w-20 h-6 text-right text-sm tabular-nums px-1"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground font-medium">
                          €{(item.quantity * item.price_per_kg).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <button
                            className="w-7 h-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => removeItem(item.product.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Add product dropdown */}
            {availableProducts.length > 0 && (
              <Select onValueChange={(id) => {
                const p = activeProducts.find((pr) => pr.id === id);
                if (p) addProduct(p);
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="+ Add a product…" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center justify-between gap-4 w-full">
                        <span>{getProductLabel(p)}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          €{(p.data_source_mode === "custom" && p.custom_price_per_kg != null ? p.custom_price_per_kg : p.price_per_kg).toFixed(2)}/kg
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Notes (optional)</label>
            <Textarea
              placeholder="Special instructions…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Totals */}
          {lineItems.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">{totalKg} kg total</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">€{totalPrice.toFixed(2)}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? "Creating…" : (
                <>
                  <Plus className="w-4 h-4" /> Create Order
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
