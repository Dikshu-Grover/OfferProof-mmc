import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Report } from "@/lib/verify/engine";

interface AiRecommendationsProps {
  text: string;
  report: Report;
}

export function AiRecommendations({ text, report }: AiRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef(false);
  const lastFetchedKeyRef = useRef<string | null>(null);

  const fetchRecommendations = useCallback(
    async (force = false) => {
      const trimmedText = text?.trim() ?? "";
      if (!trimmedText) return;

      const cacheKey = `${trimmedText}::${report.assessment}::${report.findings.length}`;
      if (!force && (fetchingRef.current || lastFetchedKeyRef.current === cacheKey)) {
        return;
      }

      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke("offerproof-ai-recommendations", {
          body: {
            offerText: trimmedText,
            context: {
              assessment: report.assessment,
              findings: report.findings,
              company: report.extracted.company,
              jobTitle: report.extracted.jobTitle,
              salary: report.extracted.salary,
            },
          },
        });

        if (fnError) {
          throw new Error(fnError.message || "Failed to load AI recommendations.");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        if (typeof data?.recommendations === "string" && data.recommendations.trim()) {
          setRecommendations(data.recommendations.trim());
          lastFetchedKeyRef.current = cacheKey;
        } else {
          throw new Error("No recommendations returned.");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to generate recommendations right now.";
        setError(message);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [text, report]
  );

  useEffect(() => {
    void fetchRecommendations();
  }, [fetchRecommendations]);

  return (
    <section aria-label="OfferProof AI Recommendations" className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">OfferProof AI Recommendations</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                <Sparkles className="size-3 text-primary" /> NVIDIA AI
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Actionable next steps and recruiter inquiry suggestions tailored to your offer.
            </p>
          </div>
        </div>
        {!loading && error && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchRecommendations(true)}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="size-3.5" /> Retry
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" role="status">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Analyzing offer details and generating tailored advice…
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-muted/40 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-foreground">AI recommendations unavailable</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchRecommendations(true)}
            className="shrink-0 text-xs"
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && recommendations && (
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-foreground">
          <div className="whitespace-pre-wrap rounded-xl bg-muted/30 p-5 font-sans leading-7">
            {recommendations}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Advisory note: AI recommendations are supplemental career guidance and do not modify OfferProof’s verification findings or risk scores.
          </p>
        </div>
      )}
    </section>
  );
}
