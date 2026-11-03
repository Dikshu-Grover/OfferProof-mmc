// Explainable, rule-based offer checks. Pure TypeScript: no React, no DOM.
// Results are heuristic signals, never a guarantee or a fraud probability.

export type Severity = "low" | "medium" | "high";
export type Assessment = "low_concern" | "needs_review" | "high_concern";

export interface Finding {
  id: string;
  name: string;
  severity: Severity;
  evidence: string[];
  explanation: string;
  action: string;
}

export interface Extracted {
  company: string | null;
  recruiter: string | null;
  jobTitle: string | null;
  salary: string | null;
  joiningDate: string | null;
  location: string | null;
  emails: string[];
  domains: string[];
  urls: string[];
  phones: string[];
}

export interface Report {
  assessment: Assessment;
  points: number;
  findings: Finding[];
  extracted: Extracted;
  phrases: string[];
}

const FREE_MAIL = [
  "gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com",
  "rediffmail.com", "aol.com", "icloud.com", "proton.me", "protonmail.com", "mail.com", "yandex.com", "gmx.com",
];
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "rb.gy", "cutt.ly", "is.gd", "shorturl.at", "tiny.cc"];
const RISKY_TLDS = [".xyz", ".top", ".click", ".buzz", ".work", ".live", ".icu", ".online", ".site", ".info"];

function findAll(text: string, re: RegExp): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(re)) out.add(m[0].trim());
  return [...out];
}

function firstGroup(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim().replace(/[.,;]+$/, "") || null;
}

export function extract(text: string): Extracted {
  const emails = findAll(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi).map((e) => e.toLowerCase());
  const urls = findAll(text, /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi).map((u) => u.replace(/[.,;]+$/, ""));
  const domains = new Set<string>();
  emails.forEach((e) => domains.add(e.split("@")[1]));
  urls.forEach((u) => {
    const h = hostOf(u);
    if (h) domains.add(h);
  });
  return {
    company:
      firstGroup(text, /(?:company|organi[sz]ation|employer)\s*(?:name)?\s*[:\-]\s*([^\n]{2,60})/i) ??
      firstGroup(text, /\b(?:at|join|with)\s+([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3}\s+(?:Pvt\.?\s*Ltd\.?|Ltd\.?|Inc\.?|LLC|Technologies|Solutions|Corp(?:oration)?|Limited))/),
    recruiter:
      firstGroup(text, /(?:regards|sincerely|recruiter|hr manager|hiring manager|from)\s*[,:\-]?\s*\n?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/),
    jobTitle: firstGroup(text, /(?:position|role|designation|job title)\s*(?:of)?\s*[:\-]?\s*([^\n,.]{2,60})/i),
    salary:
      firstGroup(text, /(?:salary|stipend|ctc|compensation|package|pay)\s*(?:of|is)?\s*[:\-]?\s*([^\n]{2,60})/i) ??
      firstGroup(text, /((?:₹|rs\.?|inr|\$|usd|£|€)\s?[\d,]+(?:\.\d+)?\s*(?:k|lpa|lakhs?|per\s+\w+|\/\s?\w+)?)/i),
    joiningDate: firstGroup(text, /(?:joining date|start date|date of joining|report(?:ing)? on|commence on)\s*[:\-]?\s*([^\n]{2,40})/i),
    location: firstGroup(text, /(?:location|work location|based in|office)\s*[:\-]\s*([^\n]{2,50})/i),
    emails,
    domains: [...domains],
    urls,
    phones: findAll(text, /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)\d{3,5}[\s-]?\d{3,5}/g).filter((p) => p.replace(/\D/g, "").length >= 10),
  };
}

export function hostOf(u: string): string | null {
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function rootDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length > 2 && ["co", "com", "org", "net", "ac", "gov"].includes(parts[parts.length - 2])) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function matchPhrases(text: string, patterns: RegExp[]): string[] {
  const out = new Set<string>();
  for (const re of patterns) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of text.matchAll(g)) out.add(m[0]);
  }
  return [...out];
}

const FEE = [
  /\b(?:registration|security|processing|refundable|application|joining|verification|documentation|kit|uniform|deposit)\s+(?:fee|fees|charge|charges|amount|deposit)\b/i,
  /\bpay(?:ment)?\s+(?:of\s+)?(?:₹|rs\.?|inr|\$|usd)\s?[\d,]+/i,
  /\b(?:deposit|transfer|send)\s+(?:the\s+)?(?:amount|money|fee)/i,
];
const TRAINING = [/\b(?:training|onboarding|certification|laptop|equipment)\s+(?:fee|fees|cost|charges|payment)\b/i, /\bpay\s+for\s+(?:your\s+)?(?:training|laptop|certification)/i];
const URGENCY = [
  /\bwithin\s+(?:24|48|12|2|6)\s*(?:hours|hrs)\b/i,
  /\b(?:immediately|urgent(?:ly)?|asap|today itself|last chance|limited (?:seats|slots)|offer expires)\b/i,
  /\bfailing which\b/i,
  /\bdo not share (?:this|with anyone)\b/i,
];
const SENSITIVE = [
  /\b(?:aadhaar|aadhar|pan card|passport|ssn|social security)(?:\s+(?:number|copy|card))?\b/i,
  /\b(?:bank account (?:number|details)|account number|ifsc|cvv|debit card|credit card|otp|upi pin|net ?banking password)\b/i,
];
const UNREALISTIC = [
  /\b(?:earn|salary of|make)\s+(?:₹|rs\.?|\$)?\s?[\d,]+\s*(?:per day|\/day|daily|a day)\b/i,
  /\bno (?:experience|interview|qualification)s? (?:required|needed)\b/i,
  /\b(?:work from home|part[- ]time)\b.*\b(?:₹|rs\.?|\$)\s?[\d,]{5,}/i,
  /\bguaranteed (?:income|salary|placement|job)\b/i,
];

export function analyze(text: string): Report {
  const t = text.replace(/\r/g, "");
  const x = extract(t);
  const findings: Finding[] = [];

  const fee = matchPhrases(t, FEE);
  if (fee.length)
    findings.push({
      id: "payment_request",
      name: "Payment or fee requested",
      severity: "high",
      evidence: fee,
      explanation: "Legitimate employers almost never ask candidates to pay registration, security or processing fees to receive or accept an offer.",
      action: "Do not pay. Contact the company through the phone or email listed on its official website and ask whether this fee is real.",
    });

  const training = matchPhrases(t, TRAINING);
  if (training.length)
    findings.push({
      id: "training_payment",
      name: "Training or equipment payment",
      severity: "high",
      evidence: training,
      explanation: "Asking new hires to pay for training, certification or a laptop is a common pattern in fake internships and job scams.",
      action: "Ask for the company's written policy on training costs and confirm it with HR via an official channel before paying anything.",
    });

  const urgency = matchPhrases(t, URGENCY);
  if (urgency.length)
    findings.push({
      id: "urgency",
      name: "Pressure or urgency language",
      severity: urgency.length >= 2 ? "medium" : "low",
      evidence: urgency,
      explanation: "Tight deadlines and secrecy discourage you from checking the offer. Real employers usually give reasonable time to decide.",
      action: "Take the time you need. Ask for a deadline extension; a genuine recruiter will rarely refuse.",
    });

  const sensitive = matchPhrases(t, SENSITIVE);
  if (sensitive.length)
    findings.push({
      id: "sensitive_info",
      name: "Sensitive information requested",
      severity: sensitive.some((s) => /otp|cvv|pin|password|card/i.test(s)) ? "high" : "medium",
      evidence: sensitive,
      explanation: "Identity documents and banking details can be misused. OTPs, PINs, CVVs and passwords should never be shared with anyone.",
      action: "Share ID documents only after you have verified the employer, and only through their official HR portal. Never share OTPs or PINs.",
    });

  const unreal = matchPhrases(t, UNREALISTIC);
  if (unreal.length)
    findings.push({
      id: "unrealistic_pay",
      name: "Unrealistic promises",
      severity: "medium",
      evidence: unreal,
      explanation: "High pay for little work, guaranteed income or 'no interview required' claims are typical of bait offers.",
      action: "Compare the salary with published ranges for the same role and city on trusted job sites.",
    });

  const freeMail = x.emails.filter((e) => FREE_MAIL.includes(e.split("@")[1]));
  if (freeMail.length)
    findings.push({
      id: "personal_email",
      name: "Recruiter uses a personal email",
      severity: "medium",
      evidence: freeMail,
      explanation: "Established companies usually recruit from their own domain (e.g. name@company.com), not from free email services.",
      action: "Find the company's official careers or HR email on its website and forward the offer there to confirm it.",
    });

  const corpDomains = [...new Set(x.domains.filter((d) => !FREE_MAIL.includes(d) && !SHORTENERS.includes(d)).map(rootDomain))];
  if (x.company && corpDomains.length) {
    const key = x.company.toLowerCase().replace(/(pvt|ltd|inc|llc|technologies|solutions|limited|corp(oration)?|[^a-z])/g, "");
    const mismatched = corpDomains.filter((d) => key.length >= 3 && !d.replace(/[^a-z]/g, "").includes(key.slice(0, Math.min(5, key.length))));
    if (mismatched.length && mismatched.length === corpDomains.length)
      findings.push({
        id: "domain_mismatch",
        name: "Company and domain don't match",
        severity: "medium",
        evidence: [`Company: ${x.company}`, ...mismatched.map((d) => `Domain: ${d}`)],
        explanation: "The email or website domain does not resemble the company name. Scammers often use look-alike or unrelated domains.",
        action: "Search for the company's official website independently and compare its domain with the one in this offer.",
      });
  }
  if (corpDomains.length > 1 && x.emails.length && new Set(x.emails.map((e) => rootDomain(e.split("@")[1] ?? ""))).size > 1)
    findings.push({
      id: "multiple_domains",
      name: "Multiple sender domains",
      severity: "low",
      evidence: x.emails,
      explanation: "The offer mentions emails from more than one domain, which can indicate an inconsistent or copied document.",
      action: "Confirm which domain the company actually uses.",
    });

  const badLinks = x.urls.filter((u) => {
    const h = hostOf(u) ?? "";
    return SHORTENERS.includes(h) || RISKY_TLDS.some((tld) => h.endsWith(tld)) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || u.startsWith("http://") || /(forms\.gle|docs\.google\.com\/forms|wa\.me|t\.me)/.test(u);
  });
  if (badLinks.length)
    findings.push({
      id: "suspicious_links",
      name: "Suspicious links",
      severity: "medium",
      evidence: badLinks,
      explanation: "Shortened links, unencrypted links, messaging links or unusual domain endings hide where you are being sent.",
      action: "Don't enter personal or payment details through these links. Navigate to the company's site by typing its address yourself.",
    });

  const missing: string[] = [];
  if (!x.company) missing.push("Company name");
  if (!x.jobTitle) missing.push("Job title");
  if (!x.salary) missing.push("Salary / stipend");
  if (!x.location) missing.push("Work location");
  if (!x.emails.length && !x.phones.length) missing.push("Contact details");
  if (missing.length >= 2)
    findings.push({
      id: "missing_details",
      name: "Missing key details",
      severity: missing.length >= 4 ? "medium" : "low",
      evidence: missing.map((m) => `Not found: ${m}`),
      explanation: "Formal offers normally state the employer, role, pay, location and contact details. Vague offers are harder to verify.",
      action: "Ask the recruiter for a formal offer letter that includes these details on company letterhead.",
    });

  const weight = { low: 1, medium: 3, high: 6 } as const;
  const points = findings.reduce((s, f) => s + weight[f.severity], 0);
  const assessment: Assessment = findings.some((f) => f.severity === "high") || points >= 8 ? "high_concern" : points >= 3 ? "needs_review" : "low_concern";
  const phrases = [...new Set(findings.filter((f) => !["missing_details", "domain_mismatch"].includes(f.id)).flatMap((f) => f.evidence))];

  return { assessment, points, findings, extracted: x, phrases };
}

export const ASSESSMENT_META: Record<Assessment, { label: string; summary: string }> = {
  low_concern: { label: "Low Concern", summary: "We found few or no common warning signs. This does not prove the offer is genuine; still verify independently." },
  needs_review: { label: "Needs Review", summary: "Some warning signs appeared. Verify the details below with the company before you proceed." },
  high_concern: { label: "High Concern", summary: "Several or serious warning signs appeared. Do not pay or share sensitive data until you have verified the employer." },
};
