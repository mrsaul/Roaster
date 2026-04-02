import { AlertCircle, ChevronRight, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { AppClient } from "./AdminClientDetail";

interface AdminClientsSectionProps {
  clients: AppClient[];
  loading: boolean;
  error: string | null;
  onSelectClient: (client: AppClient) => void;
  onDeleteClient?: (client: AppClient) => void;
}

function resolveField(client: AppClient, field: "company_name" | "contact_name" | "email" | "phone" | "delivery_address" | "pricing_tier") {
  if (client.client_data_mode === "custom") {
    const customKey = `custom_${field}` as keyof AppClient;
    const custom = client[customKey];
    if (custom) return String(custom);
  }
  return client[field] ?? "—";
}

export function AdminClientsSection({ clients, loading, error, onSelectClient, onDeleteClient }: AdminClientsSectionProps) {
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
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Delivery Address</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Source</TableHead>
              <TableHead className="text-right">Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Loading clients…
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No clients found.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => {
                const isCustom = client.client_data_mode === "custom";
                return (
                  <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectClient(client)}>
                    <TableCell>
                      <p className="font-medium text-foreground">{resolveField(client, "company_name")}</p>
                      {client.sellsy_client_id && (
                        <p className="text-xs text-muted-foreground font-mono">{client.sellsy_client_id}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-foreground">{resolveField(client, "contact_name")}</p>
                        <p className="text-xs text-muted-foreground">{resolveField(client, "email")}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {resolveField(client, "delivery_address")}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {resolveField(client, "pricing_tier")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={client.onboarding_status === "completed" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {client.onboarding_status === "completed" ? "Active" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isCustom ? (
                        <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Override</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sellsy</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onDeleteClient && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDeleteClient(client); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="gap-2">
                          Open
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
