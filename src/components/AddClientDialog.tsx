import { useState } from "react";
import { Loader2, Link2, Unlink2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddClientDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Basic info
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Delivery
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Business
  const [pricingTier, setPricingTier] = useState("standard");
  const [notes, setNotes] = useState("");

  // Sellsy
  const [sellsyClientId, setSellsyClientId] = useState("");
  const [dataMode, setDataMode] = useState<"custom" | "sellsy">("custom");

  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const resetForm = () => {
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setDeliveryAddress("");
    setPricingTier("standard");
    setNotes("");
    setSellsyClientId("");
    setDataMode("custom");
    setDuplicateWarning(false);
  };

  const checkDuplicate = async (emailValue: string) => {
    if (!emailValue.trim()) { setDuplicateWarning(false); return; }
    const { data } = await supabase
      .from("client_onboarding")
      .select("id")
      .eq("email", emailValue.trim())
      .limit(1);
    setDuplicateWarning((data ?? []).length > 0);
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    if (!deliveryAddress.trim()) {
      toast({ title: "Delivery address is required", variant: "destructive" });
      return;
    }
    if (dataMode === "sellsy" && !sellsyClientId.trim()) {
      toast({ title: "Sellsy Client ID is required for sync mode", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate a deterministic placeholder user_id for admin-created clients
      // We use the admin's own id as user_id — the client can later claim it
      const { error } = await supabase.from("client_onboarding").insert({
        user_id: crypto.randomUUID(),
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        delivery_address: deliveryAddress.trim(),
        pricing_tier: pricingTier,
        notes: notes.trim() || null,
        sellsy_client_id: sellsyClientId.trim() || null,
        client_data_mode: dataMode,
        custom_company_name: dataMode === "custom" ? companyName.trim() : null,
        custom_contact_name: dataMode === "custom" ? (contactName.trim() || null) : null,
        custom_email: dataMode === "custom" ? email.trim() : null,
        custom_phone: dataMode === "custom" ? (phone.trim() || null) : null,
        custom_delivery_address: dataMode === "custom" ? deliveryAddress.trim() : null,
        custom_pricing_tier: dataMode === "custom" ? pricingTier : null,
        onboarding_status: "completed",
        current_step: 5,
      });

      if (error) throw error;

      toast({ title: "Client created" });
      resetForm();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Failed to create client", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>Create a new B2B client record.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Basic Information</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Company Name *</p>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Contact Name</p>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Email *</p>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => void checkDuplicate(email)}
                  placeholder="email@company.com"
                />
                {duplicateWarning && (
                  <p className="text-xs text-primary font-medium">⚠️ Client may already exist with this email</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Phone</p>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" />
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Delivery Information</p>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Delivery Address *</p>
              <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Full delivery address" />
            </div>
          </div>

          {/* Business Settings */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Business Settings</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Pricing Tier</p>
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
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
              </div>
            </div>
          </div>

          {/* Sellsy Integration */}
          <div className="rounded-xl border-2 border-border p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Sellsy Integration</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDataMode("custom")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                  dataMode === "custom"
                    ? "border-accent-foreground bg-accent/50"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Unlink2 className={cn("h-4 w-4 shrink-0", dataMode === "custom" ? "text-accent-foreground" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", dataMode === "custom" ? "text-accent-foreground" : "text-foreground")}>App Only</p>
                  <p className="text-[11px] text-muted-foreground">Editable in app</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDataMode("sellsy")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                  dataMode === "sellsy"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Link2 className={cn("h-4 w-4 shrink-0", dataMode === "sellsy" ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", dataMode === "sellsy" ? "text-primary" : "text-foreground")}>Sync with Sellsy</p>
                  <p className="text-[11px] text-muted-foreground">Read-only data</p>
                </div>
              </button>
            </div>

            {dataMode === "sellsy" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Sellsy Client ID *</p>
                <Input value={sellsyClientId} onChange={(e) => setSellsyClientId(e.target.value)} placeholder="e.g. 12345678" className="font-mono" />
              </div>
            )}

            {dataMode === "custom" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Sellsy Client ID (optional)</p>
                <Input value={sellsyClientId} onChange={(e) => setSellsyClientId(e.target.value)} placeholder="Link to Sellsy later" className="font-mono" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Client
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
