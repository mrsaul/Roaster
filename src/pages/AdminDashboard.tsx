import { useEffect, useMemo, useState } from "react";
import { LogOut, Users, Package, Calendar, Coffee, BarChart3, BadgeEuro, Truck, Receipt, ExternalLink, Download, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AdminClientsSection } from "@/components/AdminClientsSection";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_ORDERS, type Order } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AdminClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  client_type: string | null;
  total_orders: number | null;
  total_spend: number | null;
  last_order_at: string | null;
};

type AdminProductRow = {
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
};

type InvoiceStatus = "not-sent" | "sent" | "error" | "paid";

type AdminInvoiceRow = {
  id: string;
  client: string;
  sellsyId: string;
  total: number;
  status: InvoiceStatus;
  issuedAt: string;
};

interface AdminDashboardProps {
  orders: Order[];
  onLogout: () => void;
}

const MOCK_INVOICES: AdminInvoiceRow[] = [
  { id: "INV-203", client: "Café XYZ", sellsyId: "48392", total: 624.5, status: "not-sent", issuedAt: "2026-03-15" },
  { id: "INV-202", client: "Atelier Nord", sellsyId: "48111", total: 488, status: "sent", issuedAt: "2026-03-14" },
  { id: "INV-201", client: "Maison Aube", sellsyId: "47988", total: 712.2, status: "error", issuedAt: "2026-03-12" },
  { id: "INV-200", client: "Café Lumière", sellsyId: "47803", total: 930.4, status: "paid", issuedAt: "2026-03-10" },
];

function formatDate(value: string | null) {
  if (!value) return "—";

  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function buildClientInsights(client: AdminClientRow | null) {
  if (!client) {
    return {
      usualOrder: "—",
      preferredDelivery: "—",
      priceTier: "—",
      averageWeeklyVolume: "—",
      favoriteCoffees: "Awaiting order-line sync",
    };
  }

  const weeklyVolumeKg = client.total_orders && client.total_orders > 0 ? Math.max(1, Math.round((client.total_orders * 12) / 4)) : 12;

  return {
    usualOrder: `${weeklyVolumeKg} kg/week`,
    preferredDelivery: "Tuesday",
    priceTier: client.client_type === "client" ? "Wholesale A" : client.client_type === "prospect" ? "Prospect" : "Partner",
    averageWeeklyVolume: `${weeklyVolumeKg} kg/week`,
    favoriteCoffees: client.client_type === "client" ? "Espresso Blend, House Filter, Decaf" : "Awaiting order-line sync",
  };
}

function getInvoiceStatusLabel(status: InvoiceStatus) {
  switch (status) {
    case "not-sent":
      return "Not sent";
    case "sent":
      return "Sent";
    case "error":
      return "Error";
    case "paid":
      return "Paid (synced back)";
  }
}

function getInvoiceStatusClassName(status: InvoiceStatus) {
  switch (status) {
    case "not-sent":
      return "bg-muted text-muted-foreground";
    case "sent":
      return "bg-primary/10 text-primary";
    case "error":
      return "bg-destructive/10 text-destructive";
    case "paid":
      return "bg-accent text-accent-foreground";
  }
}

export default function AdminDashboard({ orders, onLogout }: AdminDashboardProps) {
  const [activeSection, setActiveSection] = useState<"orders" | "clients" | "products" | "invoicing">("clients");
  const [clients, setClients] = useState<AdminClientRow[]>([]);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<AdminClientRow | null>(null);

  const allOrders = useMemo(() => [...orders, ...MOCK_ORDERS], [orders]);

  const loadClients = async () => {
    setLoadingClients(true);
    setClientError(null);

    try {
      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
        body: { mode: "list-clients" },
      });

      if (error) {
        throw new Error(error.message || "Sellsy client fetch failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to load clients from Sellsy");
      }

      setClients(Array.isArray(data.clients) ? (data.clients as AdminClientRow[]) : []);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Unknown Sellsy client error");
    } finally {
      setLoadingClients(false);
    }
  };

  const loadProducts = async () => {
    setLoadingProducts(true);
    setProductError(null);

    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, sellsy_id, sku, name, description, origin, roast_level, price_per_kg, is_active, synced_at")
        .order("name", { ascending: true });

      if (error) {
        throw new Error(error.message || "Sellsy product fetch failed");
      }

      setProducts((data as AdminProductRow[]) ?? []);
    } catch (error) {
      setProductError(error instanceof Error ? error.message : "Unknown Sellsy product error");
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadClients(), loadProducts()]);
  }, []);

  const clientSummary = useMemo(() => {
    const activeClients = clients.filter((client) => (client.total_orders ?? 0) > 0).length;
    const totalSpend = clients.reduce((sum, client) => sum + (client.total_spend ?? 0), 0);

    return {
      totalClients: clients.length,
      activeClients,
      totalSpend,
    };
  }, [clients]);

  const productSummary = useMemo(() => {
    const activeProducts = products.filter((product) => product.is_active).length;
    const averagePrice = products.length > 0
      ? products.reduce((sum, product) => sum + product.price_per_kg, 0) / products.length
      : 0;

    return {
      totalProducts: products.length,
      activeProducts,
      averagePrice,
    };
  }, [products]);

  const invoiceSummary = useMemo(() => {
    return {
      notSent: MOCK_INVOICES.filter((invoice) => invoice.status === "not-sent").length,
      sent: MOCK_INVOICES.filter((invoice) => invoice.status === "sent").length,
      error: MOCK_INVOICES.filter((invoice) => invoice.status === "error").length,
      paid: MOCK_INVOICES.filter((invoice) => invoice.status === "paid").length,
    };
  }, []);

  const insights = useMemo(() => buildClientInsights(selectedClient), [selectedClient]);

  const sectionLabel =
    activeSection === "orders"
      ? "Orders"
      : activeSection === "products"
        ? "Products"
        : activeSection === "invoicing"
          ? "Invoicing"
          : "Clients";

  return (
    <>
      <div className="min-h-screen bg-background flex">
        <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card p-6">
          <h1 className="text-base font-medium text-foreground tracking-tight mb-1">PluralRoaster</h1>
          <p className="text-xs text-muted-foreground mb-8">Admin Portal</p>

          <nav className="space-y-1 flex-1">
            <button
              type="button"
              onClick={() => setActiveSection("orders")}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === "orders" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Package className="w-4 h-4" /> Orders
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("clients")}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === "clients" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Users className="w-4 h-4" /> Clients
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("products")}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === "products" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Coffee className="w-4 h-4" /> Products
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("invoicing")}
              className={cn(
                "ml-6 flex w-[calc(100%-1.5rem)] items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSection === "invoicing" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Receipt className="w-4 h-4" /> Invoicing
            </button>
          </nav>

          <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </aside>

        <main className="flex-1 p-4 lg:p-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex lg:hidden items-center justify-between mb-6">
              <div>
                <h1 className="text-base font-medium text-foreground">PluralRoaster</h1>
                <p className="text-xs text-muted-foreground">{sectionLabel}</p>
              </div>
              <button onClick={onLogout} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <LogOut className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {activeSection === "clients" ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Total clients</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{clientSummary.totalClients}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Clients with orders</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{clientSummary.activeClients}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Tracked spend</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">€{clientSummary.totalSpend.toFixed(2)}</p>
                  </div>
                </div>

                <AdminClientsSection
                  clients={clients}
                  loading={loadingClients}
                  error={clientError}
                  onSelectClient={setSelectedClient}
                />
              </>
            ) : activeSection === "products" ? (
              <section>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Sellsy products</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{productSummary.totalProducts}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Active products</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{productSummary.activeProducts}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Average €/kg</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">€{productSummary.averagePrice.toFixed(2)}</p>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  {productError ? (
                    <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">Product fetch failed</p>
                      <p className="mt-1 text-xs text-muted-foreground">{productError}</p>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origin</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Roast</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingProducts ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading Sellsy products…</td>
                          </tr>
                        ) : products.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No Sellsy products found.</td>
                          </tr>
                        ) : (
                          products.map((product) => (
                            <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="font-medium text-foreground">{product.name}</p>
                                  <p className="text-xs text-muted-foreground">{product.sellsy_id}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{product.origin ?? "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground capitalize">{product.roast_level ?? "—"}</td>
                              <td className="px-4 py-3 font-mono text-foreground">{product.sku ?? "—"}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">€{product.price_per_kg.toFixed(2)}/kg</td>
                              <td className="px-4 py-3 text-right text-muted-foreground">{product.is_active ? "Active" : "Archived"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : activeSection === "invoicing" ? (
              <section>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Not sent</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{invoiceSummary.notSent}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Sent</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{invoiceSummary.sent}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Error</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{invoiceSummary.error}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Paid (synced back)</p>
                    <p className="text-2xl font-medium tabular-nums text-foreground">{invoiceSummary.paid}</p>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issued</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MOCK_INVOICES.map((invoice) => (
                          <tr key={invoice.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-foreground">{invoice.id}</p>
                                <p className="text-xs text-muted-foreground">Sellsy {invoice.sellsyId}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-foreground">{invoice.client}</td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(invoice.issuedAt)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">€{invoice.total.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", getInvoiceStatusClassName(invoice.status))}>
                                {getInvoiceStatusLabel(invoice.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button variant="outline" size="sm" className="gap-2">
                                  <RefreshCw className="w-4 h-4" />
                                  resend invoice
                                </Button>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <ExternalLink className="w-4 h-4" />
                                  open invoice in Sellsy
                                </Button>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <Download className="w-4 h-4" />
                                  download PDF
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Orders</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Items</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Weight</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allOrders.map((order) => (
                          <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-mono text-foreground">{order.id}</td>
                            <td className="px-4 py-3 text-muted-foreground">{format(parseISO(order.createdAt), "MMM d")}</td>
                            <td className="px-4 py-3 text-muted-foreground">{order.items.length} items</td>
                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{order.totalKg.toFixed(1)} kg</td>
                            <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">€{order.totalPrice.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              <StatusBadge status={order.status} sellsyId={order.sellsyId} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      <Dialog open={Boolean(selectedClient)} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedClient?.name ?? "Client profile"}</DialogTitle>
            <DialogDescription>
              Sellsy client profile with delivery preferences and commercial insights.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">Client detail profile</h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedClient?.name ?? "—"}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Usual Order</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{insights.usualOrder}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Preferred Delivery</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{insights.preferredDelivery}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Price Tier</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{insights.priceTier}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Sellsy ID</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedClient?.id ?? "—"}</p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">Insights</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                  <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last order date</p>
                    <p className="text-sm font-medium text-foreground">{formatDate(selectedClient?.last_order_at ?? null)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                  <Truck className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Average weekly volume</p>
                    <p className="text-sm font-medium text-foreground">{insights.averageWeeklyVolume}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                  <Coffee className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Favorite coffees</p>
                    <p className="text-sm font-medium text-foreground">{insights.favoriteCoffees}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                  <BadgeEuro className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Tracked spend</p>
                    <p className="text-sm font-medium text-foreground">
                      {typeof selectedClient?.total_spend === "number" ? `€${selectedClient.total_spend.toFixed(2)}` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
