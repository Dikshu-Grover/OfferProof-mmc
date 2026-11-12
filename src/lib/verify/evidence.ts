// Source boundaries travel in offer_text so existing guest and account storage retain provenance.
export interface EvidenceSource {
  id: string;
  name: string;
  kind: "document" | "commentary";
  text: string;
  method?: "paste" | "pdf-text" | "ocr" | "edited" | undefined;
  confidence?: number | undefined;
}

const PREFIX = "[OfferProof evidence] ";

export function serializeEvidence(sources: EvidenceSource[]): string {
  return sources.map((source) => `${PREFIX}${JSON.stringify(source)}`).join("\n");
}

export function readEvidence(text: string): EvidenceSource[] {
  const lines = text.trim().split("\n");
  if (lines.length && lines.every((line) => line.startsWith(PREFIX))) {
    try {
      const sources: EvidenceSource[] = lines.map((line, index) => {
        const value: unknown = JSON.parse(line.slice(PREFIX.length));
        if (!value || typeof value !== "object" || !("text" in value) || typeof value.text !== "string" || !("name" in value) || typeof value.name !== "string") throw new Error("Invalid source");
        const record = value as Partial<EvidenceSource>;
        return { id: `source-${index + 1}`, name: value.name, text: value.text, kind: record.kind === "commentary" ? "commentary" : "document", method: record.method, confidence: typeof record.confidence === "number" ? record.confidence : undefined };
      });
      return sources;
    } catch { /* Treat unrecognised input as pasted text, not trusted metadata. */ }
  }
  return [{ id: "source-1", name: "Pasted offer", kind: "document", method: "paste", text }];
}

export function passages(source: EvidenceSource): string[] {
  return source.text.replace(/\r/g, "").split(/\n+/).flatMap((line) => line.split(/(?<=[!?])\s+|(?<=\.)\s+(?=[A-Z])/)).map((line) => line.trim()).filter(Boolean);
}

/** Applicant blocks and labelled comments cannot supply employer facts. */
export function employerPassages(source: EvidenceSource): string[] {
  if (source.kind === "commentary") return [];
  let applicantBlock = false;
  return passages(source).filter((line) => {
    if (/^(?:applicant|candidate|employee|recipient)(?:\s+(?:details|information))?\s*:\s*$/i.test(line)) { applicantBlock = true; return false; }
    if (/^(?:company|employer|offer details|recruiter|sender|from|position|job title|salary|stipend|joining date)\s*:/i.test(line)) applicantBlock = false;
    return !applicantBlock && !/^(?:to|dear|applicant|candidate|employee|recipient|my email|comment(?:ary)?|my notes?|applicant comments?)\b/i.test(line);
  });
}