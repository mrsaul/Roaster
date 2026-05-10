import { useState, useEffect } from "react";
import { Link2, Unlink2, AlertTriangle, Loader2, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from "date-fns";
import type { Company } from "@/lib/companyTypes";

// Re-export Company as AppClient for backward compatibility with files that still import AppClient
export type { Company as AppClient };

type PricingTierOption = {
  id: string;
  name: string;
  product_discount_percent: number;
  delivery_discount_percent: number;
};

interface Props {
  client: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

type ClientEditFormData = {
  dataMode: "sellsy" | "custom";
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  pricingTier: string;
  pricingTierId: string | null;
};

function clientToFormData(c: Company): ClientEditFormData {
  return {
    dataMode: (c.client_data_mode as "sellsy" | "custom") ?? "custom",
    companyName: c.name ?? "",
    contactName: "",           // contacts are now a separate table; edit inline later
    email: c.email ?? "",
    phone: c.phone ?? "",
    deliveryAddress: "",       // addresses are in company_addresses; shown separately
    pricingTier: c.rate_category ?? "standard",
    pricingTierId: c.pricing_tier_id ?? null,
  };
}

export function AdminClientDetail({ client, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<"sellsy" | "custom" | null>(null);
  const [tierOptions, setTierOptions] = useState<PricingTierOption[]>([]);

  const defaultFormData = client ? clientToFormData(client) : {
    dataMode: "custom" as const, companyName: "", contactName: "", email: "",
    phone: "", deliveryAddress: "", pricingTier: "standard", pricingTierId: null,
  };

  const {
    value: form,
    setValue: setForm,
    clearDraft,
    discardDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<ClientEditFormData>(
    `admin-client-edit:${client?.id ?? "none"}`,
    defaultFormData,
  );

  const { dataMode, companyName, email, phone, pricingTier, pricingTierId } = form;

  const setCompanyName = (v: string) => setForm(p => ({ ...p, companyName: v }));
  const setEmail = (v: string) => setForm(p => ({ ...p, email: v }));
  const setPhone = (v: string) => setForm(p => ({ ...p, phone: v }));
  const setPricingTier = (v: string) => setForm(p => ({ ...p, pricingTier: v }));
  const setPricingTierId = (v: string | null) => setForm(p => ({ ...p, pricingTierId: v }));

  useEffect(() => {
    if (!open) return;
    supabase
      .from("pricing_tiers")
      .select("id, name, product_discount_percent, delivery_discount_percent")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setTierOptions((data ?? []) as PricingTierOption[]));
  }, [open]);

  const handleModeSwitch = (newMode: "sellsy" | "custom") => {
    if (newMode === dataMode) return;
    setPendingModeSwitch(newMode);
  };

  const confirmModeSwitch = () => {
    if (!pendingModeSwitch || !client) return;
    if (pendingModeSwitch === "custom") {
      setForm(p => ({
        ...p, dataMode: "custom",
        companyName: client.name ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        pricingTier: client.rate_category ?? "standard",
      }));
    } else {
      setForm(p => ({
        ...p, dataMode: "sellsy",
        companyName: "", email: "", phone: "", pricingTier: "",
      }));
    }
    setPendingModeSwitch(null);
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          client_data_mode: dataMode,
          name: companyName || client.name,
          email: email || null,
          phone: phone || null,
          rate_category: pricingTier || null,
          pricing_tier_id: pricingTierId,
        })
        .eq("id", client.id);
      if (error) throw error;
      clearDraft();
      toast({ title: "Client saved" });
      onSaved();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSellsySync = async () => {
    if (!client?.sellsy_client_id) {
      toast({ title: "No Sellsy ID", description: "Add a Sellsy Client ID first.", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
        body: { mode: "sync-client", sellsy_client_id: client.sellsy_client_id, client_id: client.id },
      });
      if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? "Sync failed");
      toast({ title: "Synced from Sellsy" });
      onSaved();
    } catch (err) {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const isSellsyMode = dataMode === "sellsy";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{client?.name ?? "Client"}</DialogTitle>
            <DialogDescription>
              {client?.sellsy_client_id
                ? `Sellsy ID: ${client.sellsy_client_id}`
                : "App-only client — not linked to Sellsy"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {showDraftBanner && draftSavedAt && (
              <DraftBanner savedAt={draftSavedAt} onDiscard={() => { discardDraft(); }} />
            )}

            {/* Mode toggle */}
            <div className="rounded-xl border-2 border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Data Source</p>
              <div className="grid grid-cols-2 gap-2">
                {(["custom", "sellsy"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleModeSwitch(mode)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                      dataMode === mode
                        ? mode === "sellsy" ? "border-primary bg-primary/5" : "border-accent-foreground bg-accent/50"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    {mode === "custom"
                      ? <Unlink2 className={cn("h-4 w-4 shrink-0", dataMode === "custom" ? "text-accent-foreground" : "text-muted-foreground")} />
                      : <Link2 className={cn("h-4 w-4 shrink-0", dataMode === "sellsy" ? "text-primary" : "text-muted-foreground")} />
                    }
                    <div>
                      <p className="text-sm font-medium">{mode === "custom" ? "App Only" : "Sync with Sellsy"}</p>
                      <p className="text-[11px] text-muted-foreground">{mode === "custom" ? "Editable in app" : "Read-only data"}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Sellsy sync button */}
              {isSellsyMode && client?.sellsy_client_id && (
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={handleSellsySync} disabled={syncing} className="gap-2">
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync from Sellsy
                  </Button>
                  {client.last_synced_at && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(parseISO(client.last_synced_at), "d MMM HH:mm")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Editable fields */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Company Information</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Company Name</p>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={isSellsyMode} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSellsyMode} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSellsyMode} />
                </div>
              </div>
            </div>

            {/* Pricing tier */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Pricing</p>
              <div className="flex flex-wrap gap-1.5">
                {tierOptions.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => { setPricingTier(tier.name); setPricingTierId(tier.id); }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      pricingTierId === tier.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {tier.name}
                  </button>
                ))}
                {tierOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active pricing tiers</p>
                )}
              </div>
            </div>

            {/* Sellsy fields — read-only metadata */}
            {client?.siret && (
              <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-xs text-muted-foreground">
                {client.siret && <p>SIRET: <span className="font-mono text-foreground">{client.siret}</span></p>}
                {client.vat_number && <p>TVA: <span className="font-mono text-foreground">{client.vat_number}</span></p>}
                {client.legal_company_name && <p>Raison sociale: <span className="text-foreground">{client.legal_company_name}</span></p>}
              </div>
            )}

            {/* Warning: Sellsy mode but no ID */}
            {isSellsyMode && !client?.sellsy_client_id && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/20 p-3">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Sellsy mode is active but no Sellsy Client ID is set. Data cannot be synced.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mode switch confirmation */}
      <AlertDialog open={pendingModeSwitch !== null} onOpenChange={(v) => { if (!v) setPendingModeSwitch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pendingModeSwitch === "custom" ? "App Only" : "Sellsy"} mode?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingModeSwitch === "custom"
                ? "Data will be editable in the app. Sellsy fields will be copied as a starting point."
                : "Data will be read from Sellsy. App edits will be overwritten on next sync."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeSwitch}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
