import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { DeliveryDatePicker } from "@/components/DeliveryDatePicker";
import type { CartItem } from "@/lib/store";

interface CheckoutPageProps {
  items: CartItem[];
  totalKg: number;
  totalPrice: number;
  onBack: () => void;
  onConfirm: (deliveryDate: string) => void;
}

export default function CheckoutPage({ items, totalKg, totalPrice, onBack, onConfirm }: CheckoutPageProps) {
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    if (!deliveryDate) return;
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      setConfirmed(true);
      setTimeout(() => onConfirm(deliveryDate), 1200);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={onBack} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-base font-medium text-foreground">Review Order</h1>
            <p className="text-xs text-muted-foreground tabular-nums">{totalKg.toFixed(1)} kg · €{totalPrice.toFixed(2)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Items</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.product.id} className="flex items-center justify-between py-2 px-3 bg-card border border-border rounded-lg">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums text-foreground">{item.quantity.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground tabular-nums">€{(item.quantity * item.product.pricePerKg).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Delivery Date</h2>
          <DeliveryDatePicker selected={deliveryDate} onSelect={setDeliveryDate} />
        </section>

        <section className="pt-4">
          <AnimatePresence mode="wait">
            {confirmed ? (
              <motion.div
                key="confirmed"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 h-12 bg-success text-success-foreground rounded-lg text-sm font-medium"
              >
                <Check className="w-4 h-4" />
                Order placed!
              </motion.div>
            ) : (
              <motion.button
                key="confirm"
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                disabled={!deliveryDate || confirming}
                className="w-full h-12 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-opacity duration-150 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending to Sellsy…
                  </>
                ) : (
                  "Confirm Order"
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
