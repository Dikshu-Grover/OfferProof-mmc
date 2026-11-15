import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, MailCheck, UserRound } from "lucide-react";
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
      { title: "Login & Signup — OfferProof" },
      {
        name: "description",
        content: "Sign in to save reports, compare offers and see your verification history.",
      },
      { property: "og:title", content: "Login & Signup — OfferProof" },
      { property: "og:description", content: "Sign in or create your OfferProof account." },
    ],
  }),
  component: Login,
});

export function maskEmail(raw: string): string {
  const trimmed = raw.trim();
  const parts = trimmed.split("@");
  if (parts.length !== 2) return trimmed;
  const [local, domain] = parts;
  if (!local || !domain) return trimmed;
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

export type AuthStage = "form" | "verification" | "success";

export function Login() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const target = safeRedirect(redirect);

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [stage, setStage] = useState<AuthStage>("form");

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(0);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Check initial pending offers & existing session
  useEffect(() => {
    setPending(getPending().length);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  // Handle URL errors (e.g. expired magic link)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, "?"));

    const errorDesc =
      urlParams.get("error_description") ||
      hashParams.get("error_description") ||
      urlParams.get("error") ||
      hashParams.get("error");
    const errorCode = urlParams.get("error_code") || hashParams.get("error_code");

    if (errorDesc || errorCode) {
      const isExpired = errorCode === "otp_expired" || /expired/i.test(errorDesc || "");
      if (isExpired) {
        setErrorNotice(
          "Your confirmation link has expired or has already been used. Please sign in or request a new link below.",
        );
        toast.error("Confirmation link expired. Request a new link below.");
      } else {
        setErrorNotice(errorDesc || "An authentication error occurred.");
        toast.error(errorDesc || "Authentication error occurred.");
      }
    }
  }, []);

  // Cooldown countdown timer for Resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // STAGE 3 SUCCESS: Trigger transition, celebrate, and navigate
  const handleVerificationSuccess = useCallback(() => {
    setStage("success");
    toast.success("Email verified successfully! Welcome to OfferProof.");
    setTimeout(() => {
      navigate({ to: target, replace: true });
    }, 1800);
  }, [navigate, target]);

  // Cross-tab session synchronization & auth state change listener
  useEffect(() => {
    // 1. Supabase auth listener (same tab)
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
        // Broadcast to other tabs so any open signup tab detects it immediately
        try {
          const channel = new BroadcastChannel("offerproof_auth_channel");
          channel.postMessage({
            type: "AUTH_VERIFIED",
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            },
          });
          channel.close();
        } catch {
          // ignore channel broadcast errors
        }

        try {
          localStorage.setItem(
            "offerproof_auth_sync",
            JSON.stringify({
              type: "AUTH_VERIFIED",
              time: Date.now(),
              session: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              },
            }),
          );
        } catch {
          // ignore storage write errors
        }

        handleVerificationSuccess();
      }
    });

    // 2. BroadcastChannel for cross-tab sync
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("offerproof_auth_channel");
      channel.onmessage = async (e) => {
        if (e.data?.type === "AUTH_VERIFIED" && e.data?.session) {
          try {
            await supabase.auth.setSession(e.data.session);
          } catch {
            // ignore setSession errors
          }
          handleVerificationSuccess();
        }
      };
    } catch {
      // ignore channel init errors
    }

    // 3. Storage event fallback for cross-tab sync
    const handleStorage = async (e: StorageEvent) => {
      if (e.key === "offerproof_auth_sync" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.type === "AUTH_VERIFIED" && parsed?.session) {
            try {
              await supabase.auth.setSession(parsed.session);
            } catch {
              // ignore setSession errors
            }
            handleVerificationSuccess();
          }
        } catch {
          // ignore json parse errors
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    // 4. Focus / visibility change check (when user switches back from email client)
    const handleFocusCheck = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          handleVerificationSuccess();
        }
      }
    };
    window.addEventListener("focus", handleFocusCheck);
    document.addEventListener("visibilitychange", handleFocusCheck);

    return () => {
      authSubscription.subscription.unsubscribe();
      if (channel) {
        channel.close();
      }
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocusCheck);
      document.removeEventListener("visibilitychange", handleFocusCheck);
    };
  }, [handleVerificationSuccess]);

  // Handle Sign In submission
  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      toast.error("Enter your password (at least 8 characters).");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      navigate({ to: target, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  // Handle Stage 1 Sign Up submission
  async function handleSignUp(e: FormEvent) {
    e.preventDefault();

    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    setErrorNotice(null);

    try {
      // Use standard Supabase magic sign-in / confirmation link
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/login?redirect=${encodeURIComponent(target)}`,
        },
      });

      if (error) throw error;

      if (data.session) {
        // Immediately authenticated
        handleVerificationSuccess();
        return;
      }

      // Transition to Stage 2: EMAIL VERIFICATION
      setStage("verification");
      setCooldown(60);
      toast.success("Confirmation link sent! Please check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setBusy(false);
    }
  }

  // Handle Resend Email in Stage 2
  async function handleResendEmail() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login?redirect=${encodeURIComponent(target)}`,
        },
      });
      if (error) throw error;
      setCooldown(60);
      toast.success("A fresh confirmation link has been sent to your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend confirmation link.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="bg-grid flex min-h-[75vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 sm:p-8 shadow-card">
        {/* Error notification if link expired or failed */}
        {errorNotice && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorNotice}</div>
          </div>
        )}

        {/* =========================================================================
            STAGE 3: SUCCESS (Email verified state before redirect)
            ========================================================================= */}
        {stage === "success" && (
          <div className="py-4 text-center space-y-4">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 animate-in zoom-in-90 duration-300">
              <CheckCircle2 className="size-9" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold text-foreground">Email verified!</h2>
              <p className="text-sm text-muted-foreground">
                Your account is confirmed and ready. Welcome to OfferProof!
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>Redirecting to your dashboard...</span>
            </div>
            <Button className="w-full mt-4" onClick={() => navigate({ to: target, replace: true })}>
              Continue to OfferProof
            </Button>
          </div>
        )}

        {/* =========================================================================
            STAGE 2: EMAIL VERIFICATION ("Check your inbox" screen)
            ========================================================================= */}
        {stage === "verification" && (
          <div className="space-y-5">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
              <MailCheck className="size-7" />
            </div>

            <div className="text-center space-y-1.5">
              <p className="eyebrow !text-primary">Stage 2 of 3</p>
              <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We sent a Supabase magic confirmation link to activate your account.
              </p>
            </div>

            {/* Masked email badge */}
            <div className="rounded-xl border bg-muted/40 p-4 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Confirmation link sent to</p>
              <p className="font-mono text-sm font-semibold text-foreground tracking-wide break-all">
                {maskEmail(email)}
              </p>
            </div>

            {/* Instructions */}
            <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2 text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">1.</span>
                <span>Open the email and click the confirmation link.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">2.</span>
                <span>
                  <b>Return to this OfferProof tab</b> — your verification will be detected
                  automatically across tabs.
                </span>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-center gap-1.5 text-[11px] text-primary">
                <Loader2 className="size-3 animate-spin" />
                <span>Listening for verification...</span>
              </div>
            </div>

            {/* Actions: Resend and Change Email */}
            <div className="space-y-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={cooldown > 0 || resending}
                onClick={handleResendEmail}
              >
                {resending && <Loader2 className="size-4 animate-spin mr-2" />}
                {cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
              </Button>

              <div className="flex items-center justify-center text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStage("form");
                    setErrorNotice(null);
                  }}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  Entered wrong email? Change it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            STAGE 1: SIGNUP & SIGNIN FORMS
            ========================================================================= */}
        {stage === "form" && (
          <div>
            <div className="text-center">
              <UserRound className="mx-auto size-10 text-primary" />
              <h1 className="mt-3 text-2xl font-bold">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to access your saved reports and offer comparisons."
                  : "Stage 1 of 3: Enter your details to register."}
              </p>
            </div>

            {pending > 0 && (
              <p className="mt-4 rounded-lg bg-accent px-3 py-2 text-center text-xs text-accent-foreground">
                {pending} offer(s) from this visit will be added to your account after sign in.
              </p>
            )}

            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "signin" | "signup");
                setErrorNotice(null);
              }}
              className="mt-6"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signup">Sign up</TabsTrigger>
                <TabsTrigger value="signin">Sign in</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "signup" ? (
              /* Registration Form */
              <form onSubmit={handleSignUp} className="mt-5 space-y-3.5">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    autoComplete="name"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    aria-label="Full Name"
                    maxLength={100}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Email address
                  </label>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email address"
                    maxLength={255}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Password</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Password (8+ characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Password"
                    maxLength={72}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Confirm Password
                  </label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-label="Confirm Password"
                    maxLength={72}
                    required
                  />
                </div>

                <Button type="submit" className="w-full mt-2" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                  Create Account
                </Button>

                <p className="mt-4 text-center text-xs text-muted-foreground pt-1">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setErrorNotice(null);
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            ) : (
              /* Sign In Form */
              <form onSubmit={handleSignIn} className="mt-5 space-y-3.5">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">
                    Email address
                  </label>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email address"
                    maxLength={255}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Password</label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Password"
                    maxLength={72}
                    required
                  />
                </div>

                <Button type="submit" className="w-full mt-2" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                  Sign in
                </Button>

                <p className="mt-4 text-center text-xs text-muted-foreground pt-1">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setErrorNotice(null);
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
