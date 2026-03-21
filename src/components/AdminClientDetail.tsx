import { useState } from "react";
import { Link2, Unlink2, AlertTriangle, Loader2, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from "date-fns";

export type AppClient = {
  id: string;
  user_id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  delivery_address: string | null;
  pricing_tier: string | null;
  sellsy_client_id: string | null;
  onboarding_status: string | null;
  client_data_mode: "sellsy" | "custom";
  custom_company_name: string | null;
  custom_contact_name: string | null;
  custom_email: string | null;
  custom_phone: string | null;
  custom_delivery_address: string | null;
  custom_pricing_tier: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

interface Props {
  client: AppClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AdminClientDetail({ client, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();

  const [dataMode, setDataMode] = useState<"sellsy" | "custom">(client?.client_data_mode ?? "custom");
  const [companyName, setCompanyName] = useState(client?.custom_company_name ?? client?.company_name ?? "");
  const [contactName, setContactName] = useState(client?.custom_contact_name ?? client?.contact_name ?? "");
  const [email, setEmail] = useState(client?.custom_email ?? client?.email ?? "");
  const [phone, setPhone] = useState(client?.custom_phone ?? client?.phone ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(client?.custom_delivery_address ?? client?.delivery_address ?? "");
  const [pricingTier, setPricingTier] = useState(client?.custom_pricing_tier ?? client?.pricing_tier ?? "standard");
  const [saving, setSaving] = useState(false);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<"sellsy" | "custom" | null>(null);

  const [lastClientId, setLastClientId] = useState<string | null>(null);
  if (client && client.id !== lastClientId) {
    setLastClientId(client.id);
    setDataMode(client.client_data_mode ?? "custom");
    setCompanyName(client.custom_company_name ?? client.company_name ?? "");
    setContactName(client.custom_contact_name ?? client.contact_name ?? "");
    setEmail(client.custom_email ?? client.email ?? "");
    setPhone(client.custom_phone ?? client.phone ?? "");
    setDeliveryAddress(client.custom_delivery_address ?? client.delivery_address ?? "");
    setPricingTier(client.custom_pricing_tier ?? client.pricing_tier ?? "standard");
  }

  const isSellsyMode = dataMode === "sellsy";

  const handleModeSwitch = (newMode: "sellsy" | "custom") => {
    if (newMode === dataMode) return;
    setPendingModeSwitch(newMode);
  };

  const confirmModeSwitch = () => {
    if (!pendingModeSwitch || !client) return;
    if (pendingModeSwitch === "custom") {
      setCompanyName(client.company_name ?? "");
      setContactName(client.contact_name ?? "");
      setEmail(client.email ?? "");
      setPhone(client.phone ?? "");
      setDeliveryAddress(client.delivery_address ?? "");
      setPricingTier(client.pricing_tier ?? "standard");
    }
    if (pendingModeSwitch === "sellsy") {
      setCompanyName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setDeliveryAddress("");
      setPricingTier("");
    }
    setDataMode(pendingModeSwitch);
    setPendingModeSwitch(null);
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_onboarding")
        .update({
          client_data_mode: dataMode,
          custom_company_name: dataMode === "custom" ? (companyName || null) : null,
          custom_contact_name: dataMode === "custom" ? (contactName || null) : null,
          custom_email: dataMode === "custom" ? (email || null) : null,
          custom_phone: dataMode === "custom" ? (phone || null) : null,
          custom_delivery_address: dataMode === "custom" ? (deliveryAddress || null) : null,
          custom_pricing_tier: dataMode === "custom" ? (pricingTier || null) : null,
        })
        .eq("id", client.id);
      if (error) throw error;
      toast({ title: "Client updated" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  const resolvedCompany = isSellsyMode ? (client.company_name ?? "—") : (companyName || (client.company_name ?? "—"));
  const resolvedContact = isSellsyMode ? (client.contact_name ?? "—") : (contactName || (client.contact_name ?? "—"));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {resolvedCompany}
              <Badge
                variant={client.onboarding_status === "completed" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {client.onboarding_status === "completed" ? "Active" : "Pending"}
              </Badge>
            </DialogTitle>
            <DialogDescription>Manage client profile and data source.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Data Source Mode */}
            <div className="rounded-xl border-2 border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Client Data Source</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeSwitch("sellsy")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                    isSellsyMode
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Link2 className={cn("h-4 w-4 shrink-0", isSellsyMode ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <p className={cn("text-sm font-medium", isSellsyMode ? "text-primary" : "text-foreground")}>Sync with Sellsy</p>
                    <p className="text-[11px] text-muted-foreground">Read-only data</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch("custom")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                    !isSellsyMode
                      ? "border-accent-foreground bg-accent/50"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Unlink2 className={cn("h-4 w-4 shrink-0", !isSellsyMode ? "text-accent-foreground" : "text-muted-foreground")} />
                  <div>
                    <p className={cn("text-sm font-medium", !isSellsyMode ? "text-accent-foreground" : "text-foreground")}>Custom Override</p>
                    <p className="text-[11px] text-muted-foreground">Edit in app</p>
                  </div>
                </button>
              </div>

              {isSellsyMode ? (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-primary font-medium">Synced with Sellsy — contact & delivery fields are read-only</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-accent/30 border border-accent px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent-foreground" />
                  <p className="text-xs text-accent-foreground font-medium">Custom override — changes apply only inside the app</p>
                </div>
              )}
            </div>

            {/* Sellsy ID (always read-only) */}
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Sellsy Client ID (for invoicing)</p>
              <p className="mt-1 text-sm font-mono text-foreground">{client.sellsy_client_id ?? "Not linked"}</p>
            </div>

            {/* Editable / Read-only fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Company Name</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">{client.company_name ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Contact Name</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.contact_name ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Email</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.email ?? "—"}</p>
                  </div>
                ) : (
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Phone</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.phone ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" />
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Delivery Address</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground">{client.delivery_address ?? "—"}</p>
                  </div>
                ) : (
                  <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Full delivery address" />
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Pricing Tier</p>
                {isSellsyMode ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm text-foreground capitalize">{client.pricing_tier ?? "standard"}</p>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    {["standard", "premium", "wholesale"].map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setPricingTier(tier)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                          pricingTier === tier
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                        )}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Last synced timestamp */}
            {client.last_synced_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Last synced with Sellsy: {format(parseISO(client.last_synced_at), "MMM d, yyyy HH:mm")}
              </div>
            )}

            {/* Onboarding info */}
            <div className="rounded-lg bg-muted/30 border border-dashed border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                Registered: {format(parseISO(client.created_at), "MMM d, yyyy")} · Status: <span className="capitalize font-medium">{client.onboarding_status ?? "pending"}</span>
              </p>
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mode switch confirmation */}
      <AlertDialog open={!!pendingModeSwitch} onOpenChange={(open) => !open && setPendingModeSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {pendingModeSwitch === "custom" ? "Switch to Custom Override?" : "Switch to Sellsy Sync?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingModeSwitch === "custom"
                ? "You will override Sellsy data. Changes will apply only inside the app. Sellsy invoicing data remains unchanged."
                : "App overrides to contact info, delivery address, and pricing will be lost and replaced by Sellsy data."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeSwitch}>
              {pendingModeSwitch === "custom" ? "Use Custom Override" : "Restore Sellsy Sync"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
