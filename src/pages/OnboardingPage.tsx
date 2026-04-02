import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Building2,
  Truck,
  Coffee,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";

const TOTAL_STEPS = 5;

const DELIVERY_DAYS = [
  { value: "tuesday", label: "Tuesday" },
  { value: "friday", label: "Friday" },
];

const TIME_WINDOWS = [
  "8am – 12pm",
  "10am – 2pm",
  "2pm – 6pm",
];

const COFFEE_TYPES = [
  { value: "espresso", label: "Espresso" },
  { value: "filter", label: "Filter" },
  { value: "both", label: "Both" },
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
  { icon: Building2, title: "Business Information", desc: "Tell us about your company" },
  { icon: Truck, title: "Delivery Details", desc: "Where and when should we deliver?" },
  { icon: Coffee, title: "Ordering Preferences", desc: "Help us understand your needs" },
  { icon: CreditCard, title: "Pricing & Terms", desc: "Your assigned pricing" },
  { icon: CheckCircle2, title: "Confirmation", desc: "Review and activate your account" },
];

interface OnboardingPageProps {
  onComplete: () => void;
  existingData?: Partial<OnboardingData> & { current_step?: number };
}

const OnboardingPage = ({ onComplete, existingData }: OnboardingPageProps) => {
  const [step, setStep] = useState(existingData?.current_step ?? 1);
  const [data, setData] = useState<OnboardingData>(() => ({
    ...INITIAL_DATA,
    ...existingData,
    preferred_delivery_days: existingData?.preferred_delivery_days ?? [],
    estimated_weekly_volume: String(existingData?.estimated_weekly_volume ?? ""),
  }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

      // Check if a row already exists for this user
      const { data: existing } = await supabase
        .from("client_onboarding")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Use the secure RPC function to update safe fields only
        const { error } = await supabase.rpc("user_update_own_onboarding", {
          _id: existing.id,
          _company_name: data.company_name || null,
          _legal_company_name: data.legal_company_name || null,
          _vat_number: data.vat_number || null,
          _siret: data.siret || null,
          _contact_name: data.contact_name || null,
          _email: data.email || user.email || null,
          _phone: data.phone || null,
          _delivery_address: data.delivery_address || null,
          _delivery_instructions: data.delivery_instructions || null,
          _preferred_delivery_days: data.preferred_delivery_days,
          _delivery_time_window: data.delivery_time_window || null,
          _coffee_type: data.coffee_type || null,
          _estimated_weekly_volume: data.estimated_weekly_volume ? Number(data.estimated_weekly_volume) : 0,
          _grinder_type: data.grinder_type || null,
          _notes: data.notes || null,
          _current_step: nextStep,
          ...(status === "completed" ? { _onboarding_status: "completed" } : {}),
        });
        if (error) throw error;
      } else {
        // First time: insert with onboarding_status
        const { error } = await supabase.from("client_onboarding").insert({
          user_id: user.id,
          company_name: data.company_name || null,
          legal_company_name: data.legal_company_name || null,
          vat_number: data.vat_number || null,
          siret: data.siret || null,
          contact_name: data.contact_name || null,
          email: data.email || user.email || null,
          phone: data.phone || null,
          delivery_address: data.delivery_address || null,
          delivery_instructions: data.delivery_instructions || null,
          preferred_delivery_days: data.preferred_delivery_days,
          delivery_time_window: data.delivery_time_window || null,
          coffee_type: data.coffee_type || null,
          estimated_weekly_volume: data.estimated_weekly_volume ? Number(data.estimated_weekly_volume) : 0,
          grinder_type: data.grinder_type || null,
          notes: data.notes || null,
          current_step: nextStep,
          onboarding_status: status,
        });
        if (error) throw error;
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
    toast({ title: "Account activated!", description: "Welcome to Plural Café — you can now start ordering." });
    onComplete();
  }, [saveProgress, onComplete]);

  // Pre-fill email from auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email && !data.email) {
        setData((prev) => ({ ...prev, email: user.email ?? "" }));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progressPercent = (step / TOTAL_STEPS) * 100;
  const StepIcon = STEP_META[step - 1].icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-semibold text-foreground">Complete your profile</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Step {step} of {TOTAL_STEPS} — {STEP_META[step - 1].desc}
          </p>
          <Progress value={progressPercent} className="mt-3 h-1.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Step icon */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <StepIcon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">{STEP_META[step - 1].title}</h2>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <Field label="Company Name *" error={errors.company_name}>
                <Input value={data.company_name} onChange={(e) => updateField("company_name", e.target.value)} placeholder="e.g. Café du Coin" />
              </Field>
              <Field label="Legal Company Name" hint="For invoicing purposes">
                <Input value={data.legal_company_name} onChange={(e) => updateField("legal_company_name", e.target.value)} placeholder="e.g. SAS Café du Coin" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="VAT Number">
                  <Input value={data.vat_number} onChange={(e) => updateField("vat_number", e.target.value)} placeholder="FR12345678901" />
                </Field>
                <Field label="SIRET">
                  <Input value={data.siret} onChange={(e) => updateField("siret", e.target.value)} placeholder="123 456 789 00012" />
                </Field>
              </div>
              <Field label="Contact Name *" error={errors.contact_name}>
                <Input value={data.contact_name} onChange={(e) => updateField("contact_name", e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Email">
                <Input value={data.email} disabled className="opacity-60" />
              </Field>
              <Field label="Phone Number *" error={errors.phone}>
                <Input value={data.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+33 6 12 34 56 78" type="tel" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label="Delivery Address *" error={errors.delivery_address}>
                <Textarea value={data.delivery_address} onChange={(e) => updateField("delivery_address", e.target.value)} placeholder="Street, city, postal code" rows={3} />
              </Field>
              <Field label="Additional Instructions">
                <Textarea value={data.delivery_instructions} onChange={(e) => updateField("delivery_instructions", e.target.value)} placeholder="Door code, floor, contact on site…" rows={2} />
              </Field>
              <Field label="Preferred Delivery Day(s)">
                <div className="flex gap-3">
                  {DELIVERY_DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDeliveryDay(d.value)}
                      className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                        data.preferred_delivery_days.includes(d.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Delivery Time Window">
                <div className="flex flex-wrap gap-2">
                  {TIME_WINDOWS.map((tw) => (
                    <button
                      key={tw}
                      type="button"
                      onClick={() => updateField("delivery_time_window", tw)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        data.delivery_time_window === tw
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {tw}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Field label="Usual Coffee Type">
                <div className="flex gap-3">
                  {COFFEE_TYPES.map((ct) => (
                    <button
                      key={ct.value}
                      type="button"
                      onClick={() => updateField("coffee_type", ct.value)}
                      className={`flex-1 px-3 py-2.5 rounded-md text-sm font-medium border transition-colors ${
                        data.coffee_type === ct.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Estimated Weekly Volume (kg)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={data.estimated_weekly_volume}
                  onChange={(e) => updateField("estimated_weekly_volume", e.target.value)}
                  placeholder="e.g. 15"
                />
              </Field>
              <Field label="Grinder Type" hint="Helps us recommend grind size">
                <Input value={data.grinder_type} onChange={(e) => updateField("grinder_type", e.target.value)} placeholder="e.g. Mahlkönig EK43" />
              </Field>
              <Field label="Additional Notes">
                <Textarea value={data.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Anything else we should know?" rows={3} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <InfoRow label="Pricing Tier" value="Standard" />
                  <InfoRow label="Payment Terms" value="30 days" />
                  <InfoRow label="Minimum Order" value="3 kg" />
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                Your pricing tier may be adjusted by the manager based on your order volume. Contact us for any specific arrangement.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Business</h3>
                  <InfoRow label="Company" value={data.company_name || "—"} />
                  <InfoRow label="Contact" value={data.contact_name || "—"} />
                  <InfoRow label="Phone" value={data.phone || "—"} />
                  {data.vat_number && <InfoRow label="VAT" value={data.vat_number} />}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Delivery</h3>
                  <InfoRow label="Address" value={data.delivery_address || "—"} />
                  {data.preferred_delivery_days.length > 0 && (
                    <InfoRow label="Days" value={data.preferred_delivery_days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")} />
                  )}
                  {data.delivery_time_window && <InfoRow label="Time" value={data.delivery_time_window} />}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Preferences</h3>
                  {data.coffee_type && <InfoRow label="Coffee" value={data.coffee_type.charAt(0).toUpperCase() + data.coffee_type.slice(1)} />}
                  {data.estimated_weekly_volume && <InfoRow label="Weekly volume" value={`${data.estimated_weekly_volume} kg`} />}
                  {data.grinder_type && <InfoRow label="Grinder" value={data.grinder_type} />}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-card px-4 py-4">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button onClick={handleNext} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Next <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm & Activate <CheckCircle2 className="h-4 w-4 ml-1" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium text-foreground">{label}</Label>
    {hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground text-right max-w-[60%]">{value}</span>
  </div>
);

export default OnboardingPage;
