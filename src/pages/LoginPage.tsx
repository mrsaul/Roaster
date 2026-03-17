import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "sign-in" | "sign-up";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "sign-up") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        setMessage("Account created. Check your email to confirm your address, then sign in.");
        setMode("sign-in");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      await supabase.rpc("ensure_current_user_role");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
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
          <h1 className="text-xl font-medium tracking-tight text-foreground">PluralRoaster</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "sign-in" ? "Sign in to manage orders." : "Create your account to access the catalog."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="barista@pluralcafe.fr"
              required
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-foreground">Password</Label>
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
            disabled={loading}
            className="w-full h-11 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-opacity duration-150 disabled:opacity-50"
          >
            {loading ? (mode === "sign-in" ? "Signing in…" : "Creating account…") : mode === "sign-in" ? "Sign In" : "Create Account"}
          </motion.button>

          <button
            type="button"
            onClick={() => {
              setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
              setError(null);
              setMessage(null);
            }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>

          <p className="text-xs text-muted-foreground text-center mt-4">
            The account for contact@pluralcafe.fr is promoted to admin automatically after sign-in.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
