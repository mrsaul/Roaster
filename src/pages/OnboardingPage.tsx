import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Building2,
  Truck,
  Coffee,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
} from "lucide-react";

const TOTAL_STEPS = 5;

const DELIVERY_DAYS = [
  { value: "tuesday", label: "Tue" },
  { value: "friday", label: "Fri" },
];

const TIME_WINDOWS = [
  "8am – 12pm",
  "10am – 2pm",
  "2pm – 6pm",
];

const COFFEE_TYPES = [
  { value: "espresso", label: "Espresso", icon: "☕" },
  { value: "filter", label: "Filter", icon: "🫗" },
  { value: "both", label: "Both", icon: "✨" },
];

type OnboardingData = {
  company_name: string;
  legal_company_name: string;
  vat_number: string;
  siret: string;
  contact_name: string;
  email: string;
  phone: string;
  delivery_address: string;
  delivery_instructions: string;
  preferred_delivery_days: string[];
  delivery_time_window: string;
  coffee_type: string;
  estimated_weekly_volume: string;
  grinder_type: string;
  notes: string;
};

const INITIAL_DATA: OnboardingData = {
  company_name: "",
  legal_company_name: "",
  vat_number: "",
  siret: "",
  contact_name: "",
  email: "",
  phone: "",
  delivery_address: "",
  delivery_instructions: "",
  preferred_delivery_days: [],
  delivery_time_window: "",
  coffee_type: "",
  estimated_weekly_volume: "",
  grinder_type: "",
  notes: "",
};

const STEP_META = [
  { icon: Building2, title: "Business", desc: "Tell us about your company" },
  { icon: Truck, title: "Delivery", desc: "Where and when should we deliver?" },
  { icon: Coffee, title: "Preferences", desc: "Help us understand your needs" },
  { icon: CreditCard, title: "Pricing", desc: "Your assigned pricing" },
  { icon: CheckCircle2, title: "Confirm", desc: "Review and activate your account" },
];

interface OnboardingPageProps {
  onComplete: () => void;
  existingData?: Partial<OnboardingData> & { current_step?: number };
}

const OnboardingPage = ({ onComplete, existingData }: OnboardingPageProps) => {
  const [step, setStep] = useState(existingData?.current_step ?? 1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Filter out null values from existingData so they don't override empty-string defaults
  const safeExisting: Partial<OnboardingData> = {};
  if (existingData) {
    for (const [key, val] of Object.entries(existingData)) {
      if (val !== null && val !== undefined) {
        (safeExisting as any)[key] = val;
      }
    }
  }

  const initialData: OnboardingData = {
    ...INITIAL_DATA,
    ...safeExisting,
    preferred_delivery_days: existingData?.preferred_delivery_days ?? [],
    estimated_weekly_volume: String(existingData?.estimated_weekly_volume ?? ""),
  };

  const {
    value: data,
    setValue: setData,
    clearDraft,
    discardDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<OnboardingData>("onboarding", initialData);

  const updateField = useCallback(<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const toggleDeliveryDay = useCallback((day: string) => {
    setData((prev) => {
      const days = prev.preferred_delivery_days.includes(day)
        ? prev.preferred_delivery_days.filter((d) => d !== day)
        : [...prev.preferred_delivery_days, day];
      return { ...prev, preferred_delivery_days: days };
    });
  }, []);

  const validateStep = useCallback((s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!data.company_name.trim()) e.company_name = "Company name is required";
      if (!data.contact_name.trim()) e.contact_name = "Contact name is required";
      if (!data.phone.trim()) e.phone = "Phone number is required";
    }
    if (s === 2) {
      if (!data.delivery_address.trim()) e.delivery_address = "Delivery address is required";
    }
    return e;
  }, [data]);

  const saveProgress = useCallback(async (nextStep: number, status = "pending") => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check for existing contact linked to this user
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id, company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const companyPayload = {
        name: data.company_name || user.email || "My Company",
        legal_company_name: data.legal_company_name || null,
        vat_number: data.vat_number || null,
        siret: data.siret || null,
        email: data.email || user.email || null,
        phone: data.phone || null,
        preferred_delivery_days: data.preferred_delivery_days,
        delivery_time_window: data.delivery_time_window || null,
        delivery_instructions: data.delivery_instructions || null,
        coffee_type: data.coffee_type || null,
        estimated_weekly_volume: data.estimated_weekly_volume
          ? Number(data.estimated_weekly_volume) : null,
        grinder_type: data.grinder_type || null,
        notes: data.notes || null,
        current_step: nextStep,
        ...(status !== "pending" ? { onboarding_status: status } : {}),
      };

      if (existingContact?.company_id) {
        // Update existing company
        const { error } = await supabase
          .from("companies")
          .update(companyPayload)
          .eq("id", existingContact.company_id);
        if (error) throw error;

        // Update address if provided
        if (data.delivery_address) {
          const { data: existingAddr } = await supabase
            .from("company_addresses")
            .select("id")
            .eq("company_id", existingContact.company_id)
            .eq("label", "Delivery")
            .maybeSingle();

          if (existingAddr) {
            await supabase.from("company_addresses")
              .update({ address_line1: data.delivery_address, address_line2: data.delivery_instructions || null })
              .eq("id", existingAddr.id);
          } else {
            await supabase.from("company_addresses").insert({
              company_id: existingContact.company_id,
              label: "Delivery",
              address_line1: data.delivery_address,
              address_line2: data.delivery_instructions || null,
            });
          }
        }
      } else {
        // Create new company
        const { data: newCompany, error: companyError } = await supabase
          .from("companies")
          .insert({ ...companyPayload, client_data_mode: "custom", onboarding_status: "pending" })
          .select("id")
          .single();
        if (companyError || !newCompany) throw companyError ?? new Error("Company create failed");

        // Create delivery address
        if (data.delivery_address) {
          await supabase.from("company_addresses").insert({
            company_id: newCompany.id,
            label: "Delivery",
            address_line1: data.delivery_address,
            address_line2: data.delivery_instructions || null,
          });
        }

        // Create primary contact linked to this auth user
        await supabase.from("contacts").insert({
          company_id: newCompany.id,
          user_id: user.id,
          last_name: data.contact_name || data.company_name || user.email || "Contact",
          email: data.email || user.email || null,
          phone: data.phone || null,
          is_primary: true,
        });
      }
    } finally {
      setSaving(false);
    }
  }, [data]);

  const handleNext = useCallback(async () => {
    const validationErrors = validateStep(step);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const nextStep = Math.min(step + 1, TOTAL_STEPS);
    await saveProgress(nextStep);
    setStep(nextStep);
  }, [step, validateStep, saveProgress]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const handleConfirm = useCallback(async () => {
    await saveProgress(TOTAL_STEPS, "completed");
    clearDraft();
    toast({ title: "Account activated!", description: "Welcome to Plural Café — you can now start ordering." });
    onComplete();
  }, [saveProgress, clearDraft, onComplete]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email && !data.email) {
        setData((prev) => ({ ...prev, email: user.email ?? "" }));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with step indicator */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-4">
          <p className="text-xs font-medium text-primary tracking-wider uppercase mb-1">
            Step {step} of {TOTAL_STEPS}
          </p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {STEP_META[step - 1].title}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {STEP_META[step - 1].desc}
          </p>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-4">
            {STEP_META.map((_, i) => {
              const stepNum = i + 1;
              const isCompleted = stepNum < step;
              const isCurrent = stepNum === step;
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    isCompleted
                      ? "bg-primary"
                      : isCurrent
                        ? "bg-primary/60"
                        : "bg-border"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6">
          {showDraftBanner && draftSavedAt && (
            <div className="mb-5">
              <DraftBanner savedAt={draftSavedAt} onDiscard={discardDraft} />
            </div>
          )}

          {step === 1 && <StepBusiness data={data} errors={errors} updateField={updateField} />}
          {step === 2 && (
            <StepDelivery
              data={data}
              errors={errors}
              updateField={updateField}
              toggleDeliveryDay={toggleDeliveryDay}
            />
          )}
          {step === 3 && <StepPreferences data={data} updateField={updateField} />}
          {step === 4 && <StepPricing />}
          {step === 5 && <StepConfirmation data={data} />}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card/80 backdrop-blur-sm sticky bottom-0">
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="flex-1 h-12 text-sm font-medium">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button onClick={handleNext} disabled={saving} className="flex-1 h-12 text-sm font-medium">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Next <ArrowRight className="h-4 w-4 ml-1.5" /></>
              )}
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={saving} className="flex-1 h-12 text-sm font-medium">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Confirm & Activate <CheckCircle2 className="h-4 w-4 ml-1.5" /></>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Step Components ─── */

type StepProps = {
  data: OnboardingData;
  errors?: Record<string, string>;
  updateField?: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  toggleDeliveryDay?: (day: string) => void;
};

const StepBusiness = ({ data, errors = {}, updateField }: StepProps) => (
  <div className="space-y-5">
    <FieldGroup title="Company">
      <Field label="Company Name" required error={errors.company_name}>
        <Input
          value={data.company_name}
          onChange={(e) => updateField?.("company_name", e.target.value)}
          placeholder="e.g. Café du Coin"
          className="h-11"
        />
      </Field>
      <Field label="Legal Name" hint="For invoicing">
        <Input
          value={data.legal_company_name}
          onChange={(e) => updateField?.("legal_company_name", e.target.value)}
          placeholder="e.g. SAS Café du Coin"
          className="h-11"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="VAT Number">
          <Input
            value={data.vat_number}
            onChange={(e) => updateField?.("vat_number", e.target.value)}
            placeholder="FR12345678901"
            className="h-11"
          />
        </Field>
        <Field label="SIRET">
          <Input
            value={data.siret}
            onChange={(e) => updateField?.("siret", e.target.value)}
            placeholder="123 456 789 00012"
            className="h-11"
          />
        </Field>
      </div>
    </FieldGroup>

    <FieldGroup title="Contact">
      <Field label="Contact Name" required error={errors.contact_name}>
        <Input
          value={data.contact_name}
          onChange={(e) => updateField?.("contact_name", e.target.value)}
          placeholder="Full name"
          className="h-11"
        />
      </Field>
      <Field label="Email">
        <Input value={data.email} disabled className="h-11 opacity-50 cursor-not-allowed" />
      </Field>
      <Field label="Phone" required error={errors.phone}>
        <Input
          value={data.phone}
          onChange={(e) => updateField?.("phone", e.target.value)}
          placeholder="+33 6 12 34 56 78"
          type="tel"
          className="h-11"
        />
      </Field>
    </FieldGroup>
  </div>
);

const StepDelivery = ({ data, errors = {}, updateField, toggleDeliveryDay }: StepProps) => (
  <div className="space-y-5">
    <FieldGroup title="Address">
      <Field label="Delivery Address" required error={errors?.delivery_address}>
        <Textarea
          value={data.delivery_address}
          onChange={(e) => updateField?.("delivery_address", e.target.value)}
          placeholder="Street, city, postal code"
          rows={3}
          className="resize-none"
        />
      </Field>
      <Field label="Instructions" hint="Door code, floor, contact on site…">
        <Textarea
          value={data.delivery_instructions}
          onChange={(e) => updateField?.("delivery_instructions", e.target.value)}
          placeholder="Any special instructions for our driver"
          rows={2}
          className="resize-none"
        />
      </Field>
    </FieldGroup>

    <FieldGroup title="Schedule">
      <Field label="Preferred Day(s)">
        <div className="flex gap-2">
          {DELIVERY_DAYS.map((d) => {
            const selected = data.preferred_delivery_days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDeliveryDay?.(d.value)}
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border-2 transition-all duration-200 ${
                  selected
                    ? "bg-primary/10 text-primary border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:bg-accent"
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                {d.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Time Window">
        <div className="flex flex-wrap gap-2">
          {TIME_WINDOWS.map((tw) => {
            const selected = data.delivery_time_window === tw;
            return (
              <button
                key={tw}
                type="button"
                onClick={() => updateField?.("delivery_time_window", tw)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all duration-200 ${
                  selected
                    ? "bg-primary/10 text-primary border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:bg-accent"
                }`}
              >
                {tw}
              </button>
            );
          })}
        </div>
      </Field>
    </FieldGroup>
  </div>
);

const StepPreferences = ({ data, updateField }: StepProps) => (
  <div className="space-y-5">
    <FieldGroup title="Coffee">
      <Field label="What type do you serve?">
        <div className="grid grid-cols-3 gap-2">
          {COFFEE_TYPES.map((ct) => {
            const selected = data.coffee_type === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => updateField?.("coffee_type", ct.value)}
                className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border-2 transition-all duration-200 ${
                  selected
                    ? "bg-primary/10 border-primary shadow-sm"
                    : "bg-card border-border hover:border-primary/30 hover:bg-accent"
                }`}
              >
                <span className="text-xl">{ct.icon}</span>
                <span className={`text-sm font-medium ${selected ? "text-primary" : "text-foreground"}`}>
                  {ct.label}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Estimated Weekly Volume" hint="In kilograms">
        <div className="relative">
          <Input
            type="number"
            min={0}
            step={1}
            value={data.estimated_weekly_volume}
            onChange={(e) => updateField?.("estimated_weekly_volume", e.target.value)}
            placeholder="e.g. 15"
            className="h-11 pr-10"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            kg
          </span>
        </div>
      </Field>
    </FieldGroup>

    <FieldGroup title="Equipment">
      <Field label="Grinder Type" hint="Helps us recommend grind size">
        <Input
          value={data.grinder_type}
          onChange={(e) => updateField?.("grinder_type", e.target.value)}
          placeholder="e.g. Mahlkönig EK43"
          className="h-11"
        />
      </Field>
      <Field label="Notes">
        <Textarea
          value={data.notes}
          onChange={(e) => updateField?.("notes", e.target.value)}
          placeholder="Anything else we should know?"
          rows={3}
          className="resize-none"
        />
      </Field>
    </FieldGroup>
  </div>
);

const StepPricing = () => (
  <div className="space-y-5">
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Your Plan</h3>
        </div>
        <div className="space-y-3">
          <SummaryRow label="Pricing Tier" value="Standard" />
          <SummaryRow label="Payment Terms" value="30 days" />
          <SummaryRow label="Minimum Order" value="3 kg" highlight />
        </div>
      </CardContent>
    </Card>
    <p className="text-xs text-muted-foreground leading-relaxed px-1">
      Your pricing tier may be adjusted based on order volume. Contact us for specific arrangements.
    </p>
  </div>
);

const StepConfirmation = ({ data }: { data: OnboardingData }) => (
  <div className="space-y-4">
    <ConfirmSection
      icon={<Building2 className="h-4 w-4" />}
      title="Business"
      rows={[
        { label: "Company", value: data.company_name },
        { label: "Contact", value: data.contact_name },
        { label: "Phone", value: data.phone },
        ...(data.vat_number ? [{ label: "VAT", value: data.vat_number }] : []),
      ]}
    />
    <ConfirmSection
      icon={<Truck className="h-4 w-4" />}
      title="Delivery"
      rows={[
        { label: "Address", value: data.delivery_address },
        ...(data.preferred_delivery_days.length > 0
          ? [{ label: "Days", value: data.preferred_delivery_days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ") }]
          : []),
        ...(data.delivery_time_window ? [{ label: "Time", value: data.delivery_time_window }] : []),
      ]}
    />
    <ConfirmSection
      icon={<Coffee className="h-4 w-4" />}
      title="Preferences"
      rows={[
        ...(data.coffee_type ? [{ label: "Coffee", value: data.coffee_type.charAt(0).toUpperCase() + data.coffee_type.slice(1) }] : []),
        ...(data.estimated_weekly_volume ? [{ label: "Weekly volume", value: `${data.estimated_weekly_volume} kg` }] : []),
        ...(data.grinder_type ? [{ label: "Grinder", value: data.grinder_type }] : []),
      ]}
    />
  </div>
);

/* ─── Shared UI Primitives ─── */

const FieldGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-0.5">
      {title}
    </h3>
    <div className="space-y-3.5">{children}</div>
  </div>
);

const Field = ({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium text-foreground flex items-center gap-1">
      {label}
      {required && <span className="text-destructive">*</span>}
    </Label>
    {hint && <p className="text-xs text-muted-foreground -mt-0.5">{hint}</p>}
    {children}
    {error && (
      <p className="text-xs text-destructive flex items-center gap-1">
        <span className="inline-block h-1 w-1 rounded-full bg-destructive" />
        {error}
      </p>
    )}
  </div>
);

const SummaryRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className={`text-sm font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>
      {value}
    </span>
  </div>
);

const ConfirmSection = ({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: { label: string; value: string }[];
}) => (
  <Card className="overflow-hidden">
    <CardContent className="p-0">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-between text-sm gap-4">
            <span className="text-muted-foreground shrink-0">{row.label}</span>
            <span className="font-medium text-foreground text-right">{row.value || "—"}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No information provided</p>
        )}
      </div>
    </CardContent>
  </Card>
);

export default OnboardingPage;
