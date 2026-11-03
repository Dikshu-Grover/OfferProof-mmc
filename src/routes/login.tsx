import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — OfferProof" },
      { name: "description", content: "Sign in to save reports, compare offers and see your verification history." },
      { property: "og:title", content: "Login — OfferProof" },
      { property: "og:description", content: "Sign in to OfferProof." },
    ],
  }),
  component: Login,
});

function Login() {
  return (
    <div className="bg-grid flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
        <UserRound className="mx-auto size-10 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">Accounts are coming soon</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign-in, saved reports, history and offer comparison arrive in the next phase. You can already check any offer without an account.
        </p>
        <Button asChild className="mt-6 w-full"><Link to="/verify">Verify an Offer</Link></Button>
      </div>
    </div>
  );
}
