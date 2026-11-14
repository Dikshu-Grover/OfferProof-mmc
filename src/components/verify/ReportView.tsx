import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Printer } from "lucide-react";
import { ASSESSMENT_META, classifyEmails, type Report, type Severity } from "@/lib/verify/engine";
import { Button } from "@/components/ui/button";
import { Checklist } from "./Checklist";
import { AiRecommendations } from "./AiRecommendations";
import { parseSalary } from "@/lib/compare/engine";

const SEV: Record<Severity, { label: string; cls: string; bar: string }> = {
  high: { label: "High", cls: "bg-high-soft text-high", bar: "border-high" },
  medium: { label: "Medium", cls: "bg-warn-soft text-foreground", bar: "border-warn" },
  low: { label: "Low", cls: "bg-muted text-muted-foreground", bar: "border-border" },
};

export function ReportView({
  report,
  text,
  onReset,
  sessionId,
}: {
  report: Report;
  text: string;
  onReset: () => void;
  sessionId?: string | undefined;
}) {
  const meta = ASSESSMENT_META[report.assessment];
  const tone =
    report.assessment === "high_concern"
      ? { Icon: AlertOctagon, cls: "border-high bg-high-soft", ic: "text-high" }
      : report.assessment === "needs_review"
        ? { Icon: AlertTriangle, cls: "border-warn bg-warn-soft", ic: "text-warn" }
        : { Icon: CheckCircle2, cls: "border-low bg-low-soft", ic: "text-low" };
  const x = report.extracted;
  const salary = parseSalary(x.salary);
  const salaryPeriods = { year: "annual", month: "monthly", week: "weekly", day: "daily", hour: "hourly" };
  const salaryDisplay = salary.amount !== null
    ? [salary.amount.toLocaleString(salary.currency === "INR" ? "en-IN" : "en-US"), salary.currency, salary.period ? salaryPeriods[salary.period] : null].filter(Boolean).join(" · ")
    : x.salary;
  const emailRoles = classifyEmails(text, x.emails);
  const details: [string, string | null][] = [
    ["Company", x.company],
    ["Recruiter", x.recruiter],
    ["Job title", x.jobTitle],
    ["Salary / stipend", salaryDisplay],
    ["Joining date", x.joiningDate],
    ["Location", x.location],
    ["Applicant emails", emailRoles.applicantEmails.join(", ") || null],
    ["Recruiter / contact emails", emailRoles.recruiterEmails.join(", ") || null],
    ["Emails (owner unclear)", emailRoles.unknownEmails.join(", ") || null],
    ["Phone numbers", x.phones.join(", ") || null],
  ];

  return (
    <div className="space-y-6 sm:space-y-8" id="report">
      {/* 1. Overall Assessment Banner */}
      <div className={`rounded-2xl border-l-4 p-5 sm:p-7 ${tone.cls}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3.5 sm:gap-4">
            <tone.Icon className={`mt-1 size-7 sm:size-8 shrink-0 ${tone.ic}`} />
            <div>
              <p className="eyebrow">Overall assessment</p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-bold">{meta.label}</h2>
              <p className="mt-2 max-w-2xl text-xs sm:text-sm">{meta.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {report.findings.length} concern signal(s) found · heuristic result, not a validated probability
              </p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Download PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset}>
              Check another
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Side-by-side: Concern Signals & AI Recommendations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
        {/* Concern Signals */}
        <section aria-label="Concern Signals" className="rounded-2xl border bg-card p-5 sm:p-6 shadow-card flex flex-col">
          <div className="flex items-center justify-between pb-3.5 border-b">
            <div>
              <h3 className="text-lg sm:text-xl font-bold">Concern Signals</h3>
              <p className="text-xs text-muted-foreground">Heuristic indicators detected in the offer.</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {report.findings.length} {report.findings.length === 1 ? "signal" : "signals"}
            </span>
          </div>

          <div className="mt-4 max-h-[420px] overflow-y-auto print:max-h-none print:overflow-visible pr-1 space-y-3">
            {report.findings.length === 0 && (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto size-8 text-low mb-2" />
                <p className="font-semibold text-foreground">No common warning signs detected</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Absence of warnings is not proof the offer is genuine. Use the AI recommendations and checklist below to verify.
                </p>
              </div>
            )}
            {report.findings.map((f) => (
              <article key={f.id} className={`rounded-xl border border-l-4 bg-card p-4 shadow-sm ${SEV[f.severity].bar}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold text-sm">{f.name}</h4>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV[f.severity].cls}`}>
                    {SEV[f.severity].label}
                  </span>
                </div>
                {f.evidence.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {f.evidence.map((e) => (
                      <code key={e} className="rounded bg-muted px-2 py-0.5 text-[11px] break-all">“{e}”</code>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.explanation}</p>
                <p className="mt-2 flex gap-1.5 text-xs">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span><b>What to do:</b> {f.action}</span>
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* AI Recommendations */}
        <AiRecommendations text={text} report={report} sessionId={sessionId} />
      </div>

      {/* 3. Extracted Details below in a compact two-column grid */}
      <section aria-label="Extracted Details" className="rounded-2xl border bg-card p-5 sm:p-6 shadow-card print:hidden">
        <div className="border-b pb-3.5">
          <h3 className="text-lg sm:text-xl font-bold">Extracted Details</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Details found in the offer; employer identity has not been independently verified.
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {details.map(([k, v]) => (
            <div key={k} className="flex flex-col border-b border-border/30 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
              <dd className={v ? "mt-0.5 font-medium text-foreground break-words text-xs sm:text-sm" : "mt-0.5 italic text-muted-foreground text-xs sm:text-sm"}>
                {v ?? "Not found"}
              </dd>
            </div>
          ))}
          <div className="flex flex-col border-b border-border/30 pb-2 sm:border-0 sm:pb-0">
            <dt className="text-xs font-medium text-muted-foreground">Domains</dt>
            <dd className="mt-0.5 text-xs sm:text-sm">
              {x.domains.length === 0 ? (
                <span className="italic text-muted-foreground">None found</span>
              ) : (
                <span className="font-medium text-foreground break-all">{x.domains.join(", ")}</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs font-medium text-muted-foreground">Web links</dt>
            <dd className="mt-0.5 text-xs sm:text-sm">
              {x.urls.length === 0 ? (
                <span className="italic text-muted-foreground">None found</span>
              ) : (
                <span className="font-medium text-foreground break-all">{x.urls.join(", ")}</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* 4. OfferProof Action Guide */}
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
            <li key={i} className="flex gap-3">
              <span className="font-display font-bold text-electric">0{i + 1}</span>
              <span className="text-ink-muted leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 5. Checklist */}
      <div className="print:hidden">
        <Checklist />
      </div>

      {/* 6. Disclaimer */}
      <p className="text-xs text-muted-foreground">
        Disclaimer: OfferProof uses rule-based heuristics to highlight common warning signs. It cannot confirm that an offer is genuine or
        fraudulent, and the concern score is not a validated measure of fraud likelihood. Always verify directly with the employer.
      </p>
    </div>
  );
}
