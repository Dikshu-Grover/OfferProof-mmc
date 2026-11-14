import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL_NAME = "nvidia/nemotron-3.5-bolt-e4b";
const REQUEST_TIMEOUT_MS = 25000;

interface VerificationFinding {
  name?: string;
  severity?: string;
  explanation?: string;
  action?: string;
}

interface RequestPayload {
  sessionId?: string;
  offerText?: unknown;
  context?: {
    sessionId?: string;
    assessment?: string;
    findings?: VerificationFinding[];
    company?: string | null;
    jobTitle?: string | null;
    salary?: string | null;
  };
  assessment?: string;
  findings?: VerificationFinding[];
  company?: string | null;
  jobTitle?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Validate HTTP method
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      {
        status: 405,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Retrieve API key safely
  const apiKey = Deno.env.get("NVIDIA_API_KEY")?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "NVIDIA_API_KEY is not configured in Supabase environment secrets.",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Parse and validate POST JSON payload
  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON in request body." }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  const offerText = typeof payload.offerText === "string" ? payload.offerText.trim() : "";
  if (!offerText) {
    return new Response(
      JSON.stringify({ error: "Missing required field: 'offerText' must be a non-empty string." }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Extract optional verification context (supports either payload.context or top-level properties)
  const sessionId =
    (typeof payload.sessionId === "string" ? payload.sessionId : undefined) ||
    (typeof payload.context?.sessionId === "string" ? payload.context.sessionId : undefined);
  const assessment = payload.context?.assessment || payload.assessment;
  const findings = payload.context?.findings || payload.findings;
  const company = payload.context?.company || payload.company;
  const jobTitle = payload.context?.jobTitle || payload.jobTitle;

  const contextSummaryParts: string[] = [];
  if (company) contextSummaryParts.push(`Company name: ${company}`);
  if (jobTitle) contextSummaryParts.push(`Job title: ${jobTitle}`);
  if (assessment) contextSummaryParts.push(`Heuristic assessment: ${assessment}`);
  if (Array.isArray(findings) && findings.length > 0) {
    const list = findings
      .map((f) => `- ${f.name ?? "Indicator"} (${f.severity ?? "notice"}): ${f.explanation ?? ""}`)
      .join("\n");
    contextSummaryParts.push(`Existing detected indicators:\n${list}`);
  }

  const contextBlock = contextSummaryParts.length > 0
    ? `\n\n--- Verification Context ---\n${contextSummaryParts.join("\n")}`
    : "";

  const systemPrompt =
    "You are OfferProof AI, an objective career advisor specializing in job and internship offer reviews.\n" +
    "Provide clear, professional, and practical next-step recommendations for the candidate.\n" +
    "Guidelines:\n" +
    "1. Never alter or override OfferProof's rule-based findings or risk assessment.\n" +
    "2. Recommend concrete questions the candidate should ask the recruiter or hiring contact.\n" +
    "3. Highlight specific clauses, onboarding procedures, or verification steps to double-check.\n" +
    "4. Structure your response into concise bullet points under exactly these three headings:\n" +
    "### Verification Steps\n" +
    "### Recruiter Questions\n" +
    "### Important Precautions\n" +
    "5. Keep the tone calm, empowering, and pragmatic.";

  const userPrompt =
    `Please provide AI recommendations for the following job offer:\n\n` +
    `--- Offer Text ---\n${offerText.slice(0, 15000)}` +
    contextBlock;

  // Prepare call to NVIDIA API with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const nvidiaResponse = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!nvidiaResponse.ok) {
      const errText = await nvidiaResponse.text().catch(() => "");
      console.error(`NVIDIA API HTTP ${nvidiaResponse.status}:`, errText);
      return new Response(
        JSON.stringify({
          error: "Failed to generate AI recommendations from NVIDIA service.",
          status: nvidiaResponse.status,
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    const data = await nvidiaResponse.json();
    const recommendations = data.choices?.[0]?.message?.content?.trim() || "";

    if (!recommendations) {
      return new Response(
        JSON.stringify({
          error: "NVIDIA service returned an empty recommendation.",
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Return AI recommendations separately without mutating verification logic or scores
    return new Response(
      JSON.stringify({
        recommendations,
        model: MODEL_NAME,
        sessionId,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "NVIDIA API request timed out." }),
        {
          status: 504,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    console.error("Error invoking NVIDIA API:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred while generating recommendations." }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
