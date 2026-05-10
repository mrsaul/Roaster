import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { House, ShoppingBag, UserCircle2, LogOut, Package, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Order } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountPageProps {
  orders: Order[];
  onGoHome: () => void;
  onGoShop: () => void;
  onGoAccount: () => void;
  onLogout: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountPage({
  orders,
  onGoHome,
  onGoShop,
  onGoAccount,
  onLogout,
}: AccountPageProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [{ data: userData }, { data: onboarding }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("contacts")
          .select("companies(name)")
          .eq("user_id", userData.user?.id ?? "")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setUserEmail(userData.user?.email ?? null);
      setCompanyName((onboarding as any)?.companies?.name ?? null);
      setLoadingProfile(false);
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 pt-[max(20px,calc(env(safe-area-inset-top)+16px))] pb-3">
        <div className="max-w-lg mx-auto">
          <h1 className="text-base font-semibold text-foreground">Account</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Profile & order history</p>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-lg mx-auto px-4 pt-5 pb-36 space-y-6">

        {/* Profile card */}
        <section>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                {loadingProfile ? (
                  <>
                    <div className="h-3.5 w-32 rounded bg-muted animate-pulse mb-1.5" />
                    <div className="h-3 w-44 rounded bg-muted animate-pulse" />
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {companyName ?? "Your company"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {userEmail ?? "—"}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Order history */}
        <section className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Order history
          </p>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
              <Package className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No orders yet.</p>
              <button
                type="button"
                onClick={onGoShop}
                className="mt-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 hover:bg-primary/90 transition-colors"
              >
                Start an order
              </button>
            </div>
          ) : (
            <motion.div
              className="space-y-2"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
            >
              {orders.map((order) => (
                <motion.div
                  key={order.id}
                  variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                  className="rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(order.createdAt), "d MMM yyyy")}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {order.items.length}{" "}
                        {order.items.length === 1 ? "product" : "products"} · €{order.totalPrice.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {order.items.map((i) => i.product.name).join(", ")}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      <StatusBadge status={order.status} sellsyId={order.sellsyId} />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center text-[11px] text-muted-foreground gap-1">
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <span>Delivery: {format(new Date(order.deliveryDate), "EEE d MMM")}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Sign out */}
        <section>
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/20 hover:text-destructive hover:bg-destructive/5"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </section>
      </main>

      {/* ── Bottom Navigation ── */}
      <div className="fixed inset-x-0 bottom-4 z-50 px-4 pointer-events-none">
        <div className="max-w-lg mx-auto flex items-center justify-between rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-lg supports-[backdrop-filter]:bg-card/85 pointer-events-auto">
          {(
            [
              { label: "Home",    icon: House,       onClick: onGoHome,    active: false },
              { label: "Shop",    icon: ShoppingBag, onClick: onGoShop,    active: false },
              { label: "Account", icon: UserCircle2, onClick: onGoAccount, active: true  },
            ] as const
          ).map(({ label, icon: Icon, onClick, active }) => (
            <button
              key={label}
              onClick={onClick}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
