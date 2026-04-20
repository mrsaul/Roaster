import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CartItem } from "@/lib/store";
import { cn } from "@/lib/utils";

interface CheckoutPageProps {
  items: CartItem[];
  totalKg: number;
  totalPrice: number;
  onBack: () => void;
  onConfirm: (deliveryDate: string, notes?: string) => Promise<{ orderId: string }>;
}

type Step = "review" | "success" | "error";

const VAT = 0.20;

// ── Helper: compute line totals ───────────────────────────────────────────────

function lineHT(item: CartItem): number {
  if (item.unitPrice != null && item.quantity != null) return item.unitPrice * item.quantity;
  const qty = item.sizeKg ? item.sizeKg * item.quantity : item.quantity;
  return qty * item.product.pricePerKg;
}

function lineQtyKg(item: CartItem): number {
  return item.sizeKg ? item.sizeKg * item.quantity : item.quantity;
}

function linePricePerKg(item: CartItem): number {
  if (item.unitPrice != null && item.sizeKg) return item.unitPrice / item.sizeKg;
  return item.product.pricePerKg;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckoutPage({
  items,
  totalKg,
  totalPrice,
  onBack,
  onConfirm,
}: CheckoutPageProps) {
  const [step, setStep] = useState<Step>("review");
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Snapshot before cart clears — keeps success screen populated
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<CartItem[]>([]);
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  const vatAmount = totalPrice * VAT;
  const totalTTC = totalPrice + vatAmount;

  const handleConfirm = useCallback(async () => {
    if (!deliveryDate || submitting) return;
    // Snapshot now — parent will clear cart after onConfirm resolves
    const snap = [...items];
    const snapTotal = totalPrice;

    setSubmitting(true);
    setOrderError(null);
    try {
      const { orderId } = await onConfirm(deliveryDate, notes.trim() || undefined);
      setConfirmedItems(snap);
      setConfirmedTotal(snapTotal);
      setConfirmedOrderId(orderId);
      setStep("success");
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }, [deliveryDate, items, notes, onConfirm, submitting, totalPrice]);

  // ── Success screen ────────────────────────────────────────────────────────

  if (step === "success") {
    const snapHT = confirmedTotal;
    const snapVAT = snapHT * VAT;
    const snapTTC = snapHT + snapVAT;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Icon + message */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Your order has been confirmed!
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Our team has received your order and will process it shortly.
              </p>
            </div>
          </div>

          {/* Order reference */}
          {confirmedOrderId && (
            <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">Order reference</p>
              <p className="font-mono text-sm font-medium text-foreground mt-0.5">
                #{confirmedOrderId.slice(0, 8).toUpperCase()}
              </p>
            </div>
          )}

          {/* Order summary */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="divide-y divide-border">
              {confirmedItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between px-4 py-2.5 gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.sizeLabel
                        ? `${item.sizeLabel} × ${item.quantity}`
                        : `${lineQtyKg(item).toFixed(2)} kg`}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums text-foreground shrink-0">
                    €{lineHT(item).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
              <div className="flex justify-between px-4 py-2 text-muted-foreground">
                <span>Subtotal HT</span>
                <span className="tabular-nums">€{snapHT.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-muted-foreground">
                <span>VAT (20%)</span>
                <span className="tabular-nums">€{snapVAT.toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 font-semibold text-foreground">
                <span>Total TTC</span>
                <span className="tabular-nums">€{snapTTC.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={onBack}>
            Place a new order
          </Button>
        </motion.div>
      </div>
    );
  }

  // ── Error screen ──────────────────────────────────────────────────────────

  if (step === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md space-y-6 text-center"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Order failed</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {orderError ?? "Something went wrong. Your cart has been preserved."}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              onClick={() => { setStep("review"); setOrderError(null); }}
            >
              Try again
            </Button>
            <Button variant="outline" size="lg" onClick={onBack}>
              Back to cart
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={submitting}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-base font-medium text-foreground">Review Order</h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              {totalKg.toFixed(2)} kg · €{totalTTC.toFixed(2)} TTC
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-10">

        {/* ── Order items ── */}
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Order items</h2>
          </div>

          <div className="divide-y divide-border">
            {items.map((item, i) => {
              const qty = lineQtyKg(item);
              const ppu = linePricePerKg(item);
              const ht = lineHT(item);
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.product.name}
                    </p>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {item.product.sku && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {item.product.sku}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {item.sizeLabel
                          ? `${item.sizeLabel} × ${item.quantity}`
                          : `${qty.toFixed(2)} kg`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {qty.toFixed(2)} kg · €{ppu.toFixed(2)}/kg
                    </p>
                  </div>
                  <p className="text-sm font-medium text-foreground tabular-nums self-start pt-0.5">
                    €{ht.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="border-t border-border bg-muted/20 divide-y divide-border/50 text-sm">
            <div className="flex justify-between px-4 py-2">
              <span className="text-muted-foreground">Subtotal HT</span>
              <span className="tabular-nums text-foreground">€{totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-muted-foreground">VAT (20%)</span>
              <span className="tabular-nums text-foreground">€{vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-4 py-2 font-semibold">
              <span className="text-foreground">Total TTC</span>
              <span className="tabular-nums text-foreground">€{totalTTC.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {/* ── Delivery date ── */}
        <section className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">Delivery date</h2>
          <DeliveryDatePicker selected={deliveryDate} onSelect={setDeliveryDate} />
        </section>

        {/* ── Notes ── */}
        <section className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            Notes{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special instructions, delivery notes, or comments…"
            className="resize-none text-sm"
            rows={3}
          />
        </section>

        {/* ── Actions ── */}
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full min-h-[52px]"
            disabled={!deliveryDate || submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? "Sending your order…" : "Confirm Order"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full min-h-[52px]"
            disabled={submitting}
            onClick={onBack}
          >
            Edit Order
          </Button>
        </div>
      </main>
    </div>
  );
}
