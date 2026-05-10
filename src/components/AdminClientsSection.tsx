// src/components/AdminClientsSection.tsx
import { AlertCircle, ChevronRight, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { Company } from "@/lib/companyTypes";
// Re-export for files that still import AppClient from here
export type { Company as AppClient };

interface AdminClientsSectionProps {
  clients: Company[];
  loading: boolean;
  error: string | null;
  onSelectClient: (client: Company) => void;
  onDeleteClient?: (client: Company) => void;
}

export function AdminClientsSection({ clients, loading, error, onSelectClient, onDeleteClient }: AdminClientsSectionProps) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-muted-foreground">Clients ({clients.length})</h2>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {error && (
          <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Client fetch failed</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading clients…</TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No clients found.</TableCell>
              </TableRow>
            ) : (
              clients.map((company) => (
                <TableRow key={company.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectClient(company)}>
                  <TableCell>
                    <p className="font-medium text-foreground">{company.name}</p>
                    {company.sellsy_client_id && (
                      <p className="text-xs text-muted-foreground font-mono">{company.sellsy_client_id}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{company.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{company.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{company.rate_category ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={company.onboarding_status === "completed" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {company.onboarding_status === "completed" ? "Active" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {company.client_data_mode === "custom" ? (
                      <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Override</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sellsy</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onDeleteClient && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDeleteClient(company); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="gap-2">
                        Open <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
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
