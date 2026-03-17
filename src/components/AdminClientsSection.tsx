import { AlertCircle, ChevronRight, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

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

interface AdminClientsSectionProps {
  clients: AdminClientRow[];
  loading: boolean;
  error: string | null;
  onSelectClient: (client: AdminClientRow) => void;
}

function formatLocation(client: AdminClientRow) {
  const parts = [client.address, client.city, client.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function formatLastOrder(value: string | null) {
  if (!value) return "—";

  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export function AdminClientsSection({ clients, loading, error, onSelectClient }: AdminClientsSectionProps) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-muted-foreground">Clients ({clients.length})</h2>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {error ? (
          <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Client fetch failed</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Last order</TableHead>
              <TableHead className="text-right">Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Loading clients…
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  No clients found.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium text-foreground">{client.name}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-foreground">{client.email ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{client.phone ?? "—"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatLocation(client)}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{client.client_type ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">{client.total_orders ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {typeof client.total_spend === "number" ? `€${client.total_spend.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatLastOrder(client.last_order_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => onSelectClient(client)}>
                      Open
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
