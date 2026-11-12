import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Columns3, Save, ScanSearch, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadEvidence } from "@/components/verify/UploadEvidence";
import { analyze, type Report } from "@/lib/verify/engine";
import { ReportView } from "@/components/verify/ReportView";
import { useSession } from "@/hooks/use-session";
import { addPending, saveOfferWithReport } from "@/lib/offers";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify an Offer — OfferProof" },
      { name: "description", content: "Paste an offer or upload a PDF or screenshot to see warning signs with evidence and next steps." },
      { property: "og:title", content: "Verify an Offer — OfferProof" },
      { property: "og:description", content: "Check a job or internship offer for warning signs in under a minute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyPage,
});

const SAMPLE = `Dear Candidate,

Congratulations! You have been selected for the position of Data Entry Executive (Work From Home) at GlobalTech Solutions Pvt Ltd.
Salary: ₹45,000 per month. No experience required.

To confirm your joining, kindly pay a refundable registration fee of Rs 2,999 within 24 hours, failing which the offer will be withdrawn.
Please also share your Aadhaar card and bank account details for salary processing.

Complete your onboarding form here: https://bit.ly/gt-onboard

Regards,
Rahul Verma
HR Manager
hr.globaltech.jobs@gmail.com`;

function VerifyPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [isSample, setIsSample] = useState(false);
  const session = useSession();
  const navigate = useNavigate();
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveCurrent() {
    if (!report || savedFor === text) return true;
    setSaving(true);
    try {
      await saveOfferWithReport(text, report);
      setSavedFor(text);
      toast.success("Saved to your history.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function keepForLater(redirect: "/compare" | "/history") {
    addPending(text);
    navigate({ to: "/login", search: { redirect } });
  }

  function addAndCheckAnother() {
    if (session) void saveCurrent().then((ok) => ok && (setReport(null), setText("")));
    else { const n = addPending(text); toast.success(`Kept for comparison (${n}). Sign in when you're ready to compare.`); setReport(null); setText(""); }
  }

  function run() {
    if (busy || pendingFiles) return;
    if (text.trim().length < 30) {
      toast.error("Please provide at least a few sentences of the offer.");
      return;
    }
    setReport(analyze(text));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (report)
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {isSample && <p className="mb-4 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Sample report · fictional offer</p>}
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 print:hidden">
          <span className="mr-auto px-2 text-sm text-muted-foreground">{session ? "Keep this result in your account." : "Sign in to save results and compare offers."}</span>
          <Button variant="outline" size="sm" disabled={saving || savedFor === text} onClick={() => (session ? saveCurrent() : keepForLater("/history"))}>
            <Save className="size-4" /> {savedFor === text ? "Saved" : "Save report"}
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={addAndCheckAnother}>Add & check another</Button>
          <Button size="sm" disabled={saving} onClick={async () => { if (!session) return keepForLater("/compare"); if (await saveCurrent()) navigate({ to: "/compare" }); }}>
            <Columns3 className="size-4" /> Compare Offers
          </Button>
        </div>
        <ReportView report={report} text={text} onReset={() => { setReport(null); setPendingFiles(false); }} />
      </div>
    );

  return (
    <div className="bg-grid min-h-[80vh]">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="eyebrow">Verify an offer</p>
        <h1 className="mt-3 text-4xl font-bold">What did they send you?</h1>
        <p className="mt-3 text-muted-foreground">Text is read and checked in your browser. Nothing is uploaded.</p>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-card">
          <Tabs defaultValue="paste">
            <TabsList>
              <TabsTrigger value="paste">Paste text</TabsTrigger>
              <TabsTrigger value="file">Upload PDF / image</TabsTrigger>
            </TabsList>
            <TabsContent value="file" forceMount className="mt-5 data-[state=inactive]:hidden">
              <UploadEvidence onText={(value) => { setText(value); setIsSample(false); }} onBusy={setBusy} onPending={setPendingFiles} />
            </TabsContent>
            <TabsContent value="paste" className="mt-5" />
          </Tabs>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="offer" className="text-sm font-medium">Offer text {text && <span className="text-muted-foreground">(review and edit before checking)</span>}</label>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setText(SAMPLE); setIsSample(true); }}>
                <Sparkles className="mr-1 inline size-3" />Try a fictional sample
              </button>
            </div>
            <Textarea id="offer" value={text} onChange={(e) => { setText(e.target.value); setIsSample(false); }} rows={12} placeholder="Paste the email, message or offer letter here…" maxLength={50000} />
          </div>
          <Button size="lg" className="mt-5 w-full" onClick={run} disabled={busy || pendingFiles}>
            <ScanSearch className="size-4" /> Check this offer
          </Button>
        </div>
      </div>
    </div>
  );
}
