import { useState } from "react";
import { Loader2, Link2, Unlink2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

type ClientFormData = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  pricingTier: string;
  notes: string;
  sellsyClientId: string;
  dataMode: "custom" | "sellsy";
};

const CLIENT_FORM_DEFAULT: ClientFormData = {
  companyName: "", contactName: "", email: "", phone: "",
  deliveryAddress: "", pricingTier: "standard", notes: "",
  sellsyClientId: "", dataMode: "custom",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddClientDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const { value: form, setValue: setForm, clearDraft, discardDraft,
    savedAt: draftSavedAt, showBanner: showDraftBanner,
  } = useDraftPersistence<ClientFormData>("add-client", CLIENT_FORM_DEFAULT);

  const { companyName, contactName, email, phone, deliveryAddress,
    pricingTier, notes, sellsyClientId, dataMode } = form;

  const set = <K extends keyof ClientFormData>(k: K) =>
    (v: ClientFormData[K]) => setForm(p => ({ ...p, [k]: v }));

  const resetForm = () => { discardDraft(); setDuplicateWarning(false); };

  const checkDuplicate = async (emailValue: string) => {
    if (!emailValue.trim()) { setDuplicateWarning(false); return; }
    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("email", emailValue.trim())
      .limit(1);
    setDuplicateWarning((data ?? []).length > 0);
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" }); return;
    }
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" }); return;
    }
    if (dataMode === "sellsy" && !sellsyClientId.trim()) {
      toast({ title: "Sellsy Client ID is required for sync mode", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      // 1. Insert company
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          name: companyName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          sellsy_client_id: sellsyClientId.trim() || null,
          sellsy_id: sellsyClientId.trim() || null,
          client_data_mode: dataMode,
          rate_category: pricingTier,
          onboarding_status: "completed",
        })
        .select("id")
        .single();
      if (companyError || !company) throw companyError ?? new Error("Company insert failed");

      // 2. Insert address if provided
      if (deliveryAddress.trim()) {
        await supabase.from("company_addresses").insert({
          company_id: company.id,
          label: "Delivery",
          address_line1: deliveryAddress.trim(),
        });
      }

      // 3. Insert primary contact (no user_id yet — admin created, not self-registered)
      if (contactName.trim() || email.trim()) {
        await supabase.from("contacts").insert({
          company_id: company.id,
          last_name: contactName.trim() || companyName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          is_primary: true,
        });
      }

      toast({ title: "Client created" });
      clearDraft();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Failed to create client", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { /* keep draft */ } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>Create a new B2B client record.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {showDraftBanner && draftSavedAt && (
            <DraftBanner savedAt={draftSavedAt} onDiscard={resetForm} />
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Basic Information</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Company Name *</p>
                <Input value={companyName} onChange={(e) => set("companyName")(e.target.value)} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Contact Name</p>
                <Input value={contactName} onChange={(e) => set("contactName")(e.target.value)} placeholder="Contact name" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Email *</p>
                <Input
                  type="email" value={email}
                  onChange={(e) => set("email")(e.target.value)}
                  onBlur={() => void checkDuplicate(email)}
                  placeholder="email@company.com"
                />
                {duplicateWarning && (
                  <p className="text-xs text-primary font-medium">⚠️ Client may already exist with this email</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Phone</p>
                <Input value={phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+33 6 12 34 56 78" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Delivery Address</p>
            <Input value={deliveryAddress} onChange={(e) => set("deliveryAddress")(e.target.value)} placeholder="Full delivery address" />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Business Settings</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Pricing Tier</p>
                <div className="flex gap-1.5">
                  {["standard", "premium", "wholesale"].map((tier) => (
                    <button
                      key={tier} type="button"
                      onClick={() => set("pricingTier")(tier)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                        pricingTier === tier
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                      )}
                    >{tier}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <Textarea value={notes} onChange={(e) => set("notes")(e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-border p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Sellsy Integration</p>
            <div className="grid grid-cols-2 gap-2">
              {(["custom", "sellsy"] as const).map((mode) => (
                <button
                  key={mode} type="button"
                  onClick={() => set("dataMode")(mode)}
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
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Sellsy Client ID {dataMode === "sellsy" ? "*" : "(optional)"}
              </p>
              <Input
                value={sellsyClientId}
                onChange={(e) => set("sellsyClientId")(e.target.value)}
                placeholder="e.g. 12345678"
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
