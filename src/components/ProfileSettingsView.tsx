import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Lock, Save, Loader2, CheckCircle2, Check } from "lucide-react";

const PROFILE_DRAFT_KEY = "profile_settings_draft";

type ProfileDraft = { fullName: string; email: string; savedAt: number };

function saveDraft(d: ProfileDraft) {
  try { localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(d)); } catch {}
}
function loadDraft(): ProfileDraft | null {
  try {
    const raw = localStorage.getItem(PROFILE_DRAFT_KEY);
    return raw ? JSON.parse(raw) as ProfileDraft : null;
  } catch { return null; }
}
function clearDraft() { localStorage.removeItem(PROFILE_DRAFT_KEY); }

export function ProfileSettingsView() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const dbEmail = user.email ?? "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const dbName = profile?.full_name ?? "";

      setOriginalEmail(dbEmail);
      setOriginalName(dbName);

      // Restore draft if it has unsaved edits
      const draft = loadDraft();
      if (draft && (draft.fullName !== dbName || draft.email !== dbEmail)) {
        setFullName(draft.fullName);
        setEmail(draft.email);
        setLastSavedAt(draft.savedAt);
      } else {
        setFullName(dbName);
        setEmail(dbEmail);
        clearDraft();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  // Auto-save draft on changes
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (loading) return;
    const dirty = fullName !== originalName || email !== originalEmail;
    if (!dirty) { clearDraft(); setLastSavedAt(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const now = Date.now();
      saveDraft({ fullName, email, savedAt: now });
      setLastSavedAt(now);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fullName, email, originalName, originalEmail, loading]);

  const profileDirty = fullName !== originalName || email !== originalEmail;

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update name in profiles table
      if (fullName !== originalName) {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", user.id);
        if (error) throw error;
        setOriginalName(fullName);
      }

      if (email !== originalEmail) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        setOriginalEmail(email);
        toast({ title: "Confirmation email sent", description: "Check your inbox to confirm the new email address." });
      } else {
        toast({ title: "Profile updated" });
      }
      clearDraft();
      setLastSavedAt(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Failed to save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Failed to update password", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Profile Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage your account information</p>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            Personal Information
          </CardTitle>
          <CardDescription>Update your name and email address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={!profileDirty || saving}
            className="w-full sm:w-auto"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            Change Password
          </CardTitle>
          <CardDescription>Set a new password for your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">Passwords don't match</p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={!newPassword || newPassword !== confirmPassword || savingPassword}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            Update Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
