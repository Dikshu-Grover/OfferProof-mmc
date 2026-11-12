import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Printer } from "lucide-react";
import { Fragment, useMemo } from "react";
import { ASSESSMENT_META, type Report, type Severity } from "@/lib/verify/engine";
import { Button } from "@/components/ui/button";
import { Checklist } from "./Checklist";

const SEV: Record<Severity, { label: string; cls: string; bar: string }> = {
  high: { label: "High", cls: "bg-high-soft text-high", bar: "border-high" },
  medium: { label: "Medium", cls: "bg-warn-soft text-foreground", bar: "border-warn" },
  low: { label: "Low", cls: "bg-muted text-muted-foreground", bar: "border-border" },
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, phrases }: { text: string; phrases: string[] }) {
  const parts = useMemo(() => {
    if (!phrases.length) return [text];
    const re = new RegExp(`(${[...phrases].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})`, "gi");
    return text.split(re);
  }, [text, phrases]);
  const lower = phrases.map((p) => p.toLowerCase());
  return (
    <p className="whitespace-pre-wrap text-sm leading-7">
      {parts.map((p, i) => (lower.includes(p.toLowerCase()) ? <mark key={i} className="mark-high">{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
    </p>
  );
}

export function ReportView({ report, text, onReset }: { report: Report; text: string; onReset: () => void }) {
  const meta = ASSESSMENT_META[report.assessment];
  const tone =
    report.assessment === "high_concern"
      ? { Icon: AlertOctagon, cls: "border-high bg-high-soft", ic: "text-high" }
      : report.assessment === "needs_review"
        ? { Icon: AlertTriangle, cls: "border-warn bg-warn-soft", ic: "text-warn" }
        : { Icon: CheckCircle2, cls: "border-low bg-low-soft", ic: "text-low" };
  const x = report.extracted;
  const sources = x.sources ?? [{ id: "source-1", name: "Offer document", kind: "document" as const, text }];
  const recommendations = [...new Set(report.findings.map((finding) => finding.action))].slice(0, 3);
  if (!recommendations.length) recommendations.push("Confirm the offer and recruiter directly with HR using independently located company contact details.");
  const details: [string, string | null][] = [
    ["Company", x.company],
    ["Recruiter", x.recruiter],
    ["Recruiter designation", x.recruiterDesignation ?? null],
    ["Job title", x.jobTitle],
    ["Salary / stipend", x.salary],
    ["Currency", x.currency ?? null],
    ["Joining date", x.joiningDate],
    ["Location", x.location],
    ["Emails", x.emails.join(", ") || null],
    ["Phone numbers", x.phones.join(", ") || null],
  ];

  return (
    <div className="space-y-8" id="report">
      <div className={`rounded-2xl border-l-4 p-6 sm:p-8 ${tone.cls}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <tone.Icon className={`mt-1 size-8 shrink-0 ${tone.ic}`} />
            <div>
              <p className="eyebrow">Overall assessment</p>
              <h2 className="mt-1 text-3xl font-bold">{meta.label}</h2>
              <p className="mt-2 max-w-2xl text-sm">{meta.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">{report.findings.length} warning sign(s) · {report.points} weighted points, not a percentage or fraud probability</p>
              <p className="mt-1 text-xs text-muted-foreground">Low = 1 · Medium = 3 · High = 6. High Concern requires a serious signal or at least three medium signals totalling 9+ points. Needs Review starts at 3 points.</p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Download PDF</Button>
            <Button variant="ghost" onClick={onReset}>Check another</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h3 className="text-xl font-semibold">Warning indicators</h3>
          {report.findings.length === 0 && (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No common warning signs were detected. Absence of warnings is not proof the offer is genuine — use the checklist below.</div>
          )}
          {report.findings.map((f) => (
            <article key={f.id} className={`rounded-xl border border-l-4 bg-card p-5 shadow-card ${SEV[f.severity].bar}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">{f.name}</h4>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEV[f.severity].cls}`}>{SEV[f.severity].label} severity</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(f.citations ?? f.evidence.map((passage) => ({ sourceId: "legacy", source: "Saved evidence (original source unavailable)", passage }))).map((citation, index) => (
                  <blockquote key={`${citation.sourceId}-${index}`} className="w-full rounded bg-muted px-3 py-2 text-sm break-words"><p>“{citation.passage}”</p><cite className="mt-1 block text-xs not-italic text-muted-foreground">{citation.source}</cite></blockquote>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{f.explanation}</p>
              <p className="mt-3 flex gap-2 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>What to do:</b> {f.action}</span></p>
            </article>
          ))}
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">Extracted details</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {details.map(([k, v], index) => {
                const key = ["company", "recruiter", "recruiterDesignation", "jobTitle", "salary", "currency", "joiningDate", "location", "emails", "phones"][index];
                const field = key ? (x.fields as Record<string, import("@/lib/verify/engine").FieldInfo> | undefined)?.[key] : undefined;
                return (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className={v ? "break-words" : "italic text-muted-foreground"}>{v ?? (field?.status === "Ambiguous" ? field.candidates.join(" / ") : "Not found")}</dd>
                  <dd className="mt-1 text-xs text-muted-foreground">{field?.status ?? (v ? "Extracted" : "Not checked")}{field?.confidence !== undefined && ` · OCR confidence ${Math.round(field.confidence)}% (not field accuracy)`}</dd>
                  {field?.citations.map((ref, i) => <dd key={i} className="mt-1 text-xs text-muted-foreground break-words">{ref.source}: “{ref.passage}”</dd>)}
                </div>
              ); })}
            </dl>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">Domains & links</h3>
            {x.domains.length === 0 && x.urls.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None found.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {x.domains.map((d) => <li key={d} className="break-all"><span className="text-muted-foreground">Domain:</span> {d}</li>)}
                {x.urls.map((u) => <li key={u} className="break-all"><span className="text-muted-foreground">Link:</span> {u}<span className="block text-xs text-muted-foreground">{report.findings.some((finding) => ["suspicious_links", "unencrypted_link"].includes(finding.id) && finding.evidence.some((evidence) => evidence.includes(u))) ? "Suspicious text pattern · destination not checked" : "Not checked · destination not contacted"}</span></li>)}
              </ul>
            )}
          </div>
          {!!x.emailContacts?.length && <div className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Email roles</h3><ul className="mt-3 space-y-2 text-xs">{x.emailContacts.map((contact, index) => <li key={index} className="break-all">{contact.email}<span className="block text-muted-foreground">{contact.role} · {contact.source}</span></li>)}</ul></div>}
        </aside>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-xl font-semibold">Highlighted document</h3>
        {sources.map((source) => <section key={source.id} className="mt-4"><h4 className="mb-2 text-sm font-semibold break-words">{source.name}{source.kind === "commentary" ? " · excluded from employer checks" : ""}</h4>{source.method && <p className="mb-2 text-xs text-muted-foreground">{source.method}{source.confidence !== undefined && ` · OCR confidence ${Math.round(source.confidence)}%`}</p>}<div className="max-h-[420px] overflow-auto rounded-lg bg-muted/50 p-4 print:max-h-none print:overflow-visible"><Highlighted text={source.text} phrases={source.kind === "commentary" ? [] : report.phrases} /></div></section>)}
      </div>

      <section className="border-t pt-6"><h3 className="text-xl font-semibold">Independent verification status</h3><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">{["Company identity / registration", "Recruiter authority / domain ownership", "Document authenticity / manipulation"].map((label) => <div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 text-muted-foreground">Not checked</dd></div>)}</dl><p className="mt-3 text-xs text-muted-foreground">Text checks cannot confirm a company exists, a letter is authentic, or an image was manipulated. Extraction failures and missing fields are not risk points. Original source boundaries are unavailable after combined text is edited.</p></section>

      <section className="border-t pt-6"><h3 className="text-xl font-semibold">Recommendations for this offer</h3><ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">{recommendations.map((action) => <li key={action}>{action}</li>)}</ol></section>

      <div className="rounded-2xl bg-ink p-6 text-ink-foreground sm:p-8">
        <p className="eyebrow !text-electric">OfferProof Action Guide</p>
        <h3 className="mt-2 text-2xl font-bold">Before you accept</h3>
        <ol className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          {[
            "Find the company's official website yourself and compare its domain with the offer.",
            "Call or email HR using contact details from the official site, quoting the offer.",
            "Never pay a fee, deposit or purchase anything to secure a job.",
            "Never share OTPs, PINs, CVVs or passwords. Share ID only via official HR portals.",
            "Compare the salary with published ranges for the same role and city.",
            "If you already paid, contact your bank immediately and report to your cybercrime portal.",
          ].map((s, i) => (
            <li key={i} className="flex gap-3"><span className="font-display font-bold text-electric">0{i + 1}</span><span className="text-ink-muted">{s}</span></li>
          ))}
        </ol>
      </div>

      <Checklist />

      <p className="text-xs text-muted-foreground">
        Disclaimer: OfferProof uses rule-based heuristics to highlight common warning signs. It cannot confirm that an offer is genuine or
        fraudulent, and the assessment is not a validated fraud probability. Always verify directly with the employer.
      </p>
    </div>
  );
}
