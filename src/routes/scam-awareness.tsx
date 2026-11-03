import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PageHero } from "@/components/site/SiteShell";
import { ARTICLES } from "@/lib/content";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/scam-awareness")({
  head: () => ({
    meta: [
      { title: "Scam Awareness Centre — OfferProof" },
      { name: "description", content: "Learn the signs of fake recruiters, payment scams, suspicious domains and fraudulent internships." },
      { property: "og:title", content: "Scam Awareness Centre — OfferProof" },
      { property: "og:description", content: "Spot job scams before they cost you." },
    ],
  }),
  component: Awareness,
});

function Awareness() {
  return (
    <>
      <PageHero eyebrow="Scam Awareness Centre" title="Know the patterns.">Most job scams follow a few predictable scripts. Here's how to recognise them. All examples are fictional.</PageHero>
      <section className="mx-auto max-w-5xl space-y-10 px-4 py-16 sm:px-6">
        <nav className="flex flex-wrap gap-2">
          {ARTICLES.map((a) => (
            <a key={a.slug} href={`#${a.slug}`} className="rounded-full border px-4 py-1.5 text-sm hover:border-primary">{a.category}</a>
          ))}
        </nav>
        {ARTICLES.map((a) => (
          <article key={a.slug} id={a.slug} className="scroll-mt-24 rounded-2xl border bg-card p-6 shadow-card sm:p-8">
            <p className="eyebrow">{a.category}</p>
            <h2 className="mt-2 text-2xl font-bold">{a.title}</h2>
            <p className="mt-3 text-muted-foreground">{a.summary}</p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-semibold">Warning signs</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {a.signs.map((s) => <li key={s} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />{s}</li>)}
                </ul>
              </div>
              <blockquote className="rounded-lg border-l-4 border-high bg-high-soft/40 p-4 text-sm italic">{a.example}</blockquote>
            </div>
          </article>
        ))}
        <div className="rounded-2xl bg-ink p-8 text-ink-foreground">
          <h2 className="text-2xl font-bold">Already paid or shared details?</h2>
          <p className="mt-2 text-ink-muted">Contact your bank right away, keep all screenshots, stop replying, and report the incident to your national cybercrime portal (India: cybercrime.gov.in or call 1930).</p>
          <Button asChild variant="secondary" className="mt-6"><Link to="/verify">Check another offer</Link></Button>
        </div>
      </section>
    </>
  );
}
