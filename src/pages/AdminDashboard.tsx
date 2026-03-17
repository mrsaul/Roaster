import { useEffect, useMemo, useState } from "react";
import { LogOut, Users, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminClientsSection } from "@/components/AdminClientsSection";

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

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [clients, setClients] = useState<AdminClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadClients();
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

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card p-6">
        <h1 className="text-base font-medium text-foreground tracking-tight mb-1">PluralRoaster</h1>
        <p className="text-xs text-muted-foreground mb-8">Admin Portal</p>

        <nav className="space-y-1 flex-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground text-sm font-medium">
            <Package className="w-4 h-4" /> Orders
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium">
            <Users className="w-4 h-4" /> CLIENTS
          </div>
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
              <p className="text-xs text-muted-foreground">Clients</p>
            </div>
            <button onClick={onLogout} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

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

          <AdminClientsSection clients={clients} loading={loadingClients} error={clientError} />
        </div>
      </main>
    </div>
  );
}
