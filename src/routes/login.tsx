import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MailCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getPending, safeRedirect } from "@/lib/offers";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Login — OfferProof" },
      {
        name: "description",
        content: "Sign in to save reports, compare offers and see your verification history.",
      },
      { property: "og:title", content: "Login — OfferProof" },
      { property: "og:description", content: "Sign in to OfferProof." },
    ],
  }),
  component: Login,
});

export function Login() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const target = safeRedirect(redirect);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setPending(getPending().length);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (mode === "signin" && password.length < 8) {
      toast.error("Enter your password (at least 8 characters).");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        // Use Supabase Email OTP so users can verify directly on this page without opening another tab
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            shouldCreateUser: true,
          },
        });
        if (error) throw error;
        setSent(true);
        toast.success("Verification code sent to your email!");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate({ to: target, replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    const token = otp.trim();
    if (token.length < 4) {
      toast.error("Please enter the verification code sent to your email.");
      return;
    }
    setBusy(true);
    try {
      let { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });

      if (error && (error.message.includes("type") || error.message.includes("invalid"))) {
        const fallback = await supabase.auth.verifyOtp({
          email: email.trim(),
          token,
          type: "signup",
        });
        if (!fallback.error) {
          error = null;
        }
      }

      if (error) throw error;

      // If user supplied a password during signup, persist it so they can use password login in the future
      if (password && password.length >= 8) {
        await supabase.auth.updateUser({ password }).catch(() => {});
      }

      toast.success("Email verified! Welcome to OfferProof.");
      navigate({ to: target, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      toast.success("A new verification code has been sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-grid flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-card">
        <UserRound className="mx-auto size-10 text-primary" />
        <h1 className="mt-4 text-center text-2xl font-bold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Save reports, compare offers and reopen your history. Checking an offer never needs an
          account.
        </p>
        {pending > 0 && (
          <p className="mt-4 rounded-lg bg-accent px-3 py-2 text-center text-xs text-accent-foreground">
            {pending} offer(s) from this visit will be added to your account after you sign in.
          </p>
        )}
        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 text-center">
              <MailCheck className="mx-auto size-7 text-primary mb-1.5" />
              <p className="text-sm font-semibold text-foreground">Verify your email</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Enter the verification code sent to <b>{email}</b> to complete your signup directly
                here. No need to open another tab.
              </p>
            </div>
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter verification code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                aria-label="Verification code"
                maxLength={10}
                className="text-center font-mono text-base tracking-widest"
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={busy || otp.trim().length < 4}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Verify & Continue
              </Button>
            </form>
            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={resendOtp}
                disabled={busy}
                className="text-primary hover:underline disabled:text-muted-foreground"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setOtp("");
                }}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Change email
              </button>
            </div>
          </div>
        ) : (
          <>
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "signin" | "signup");
                setSent(false);
                setOtp("");
              }}
              className="mt-6"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
            </Tabs>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                maxLength={255}
              />
              <Input
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={
                  mode === "signup"
                    ? "Password (optional or 8+ characters)"
                    : "Password (8+ characters)"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
                maxLength={72}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Send verification code"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
