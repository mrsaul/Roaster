import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const hasRecoveryToken = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("type") === "recovery";
};

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(hasRecoveryToken(window.location.hash));
  }, []);

  const passwordMismatch = useMemo(() => {
    return confirmPassword.length > 0 && password !== confirmPassword;
  }, [confirmPassword, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!ready) {
      setError("This password reset link is invalid or expired.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      setMessage("Password updated. You can now return to the app and sign in.");
      setPassword("");
      setConfirmPassword("");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8">
          <h1 className="text-xl font-medium tracking-tight text-foreground">Reset password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a new password for your PluralRoaster account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-foreground">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-sm text-foreground">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              className="h-11"
            />
          </div>

          {passwordMismatch ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Passwords do not match.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
              {message}
            </div>
          ) : null}

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={loading || passwordMismatch}
            className="w-full h-11 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-opacity duration-150 disabled:opacity-50"
          >
            {loading ? "Updating password…" : "Update Password"}
          </motion.button>

          <a href="/" className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
            Back to sign in
          </a>
        </form>
      </motion.div>
    </div>
  );
}
