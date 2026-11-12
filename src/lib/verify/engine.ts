// Explainable browser-safe rules. Findings are concerns, never authenticity guarantees.
import { employerPassages, passages, readEvidence, type EvidenceSource } from "./evidence";
import { parseSalary, PERIOD_FACTOR } from "../compare/engine";

export type Severity = "low" | "medium" | "high";
export type Assessment = "low_concern" | "needs_review" | "high_concern";
export type FieldStatus = "Extracted" | "Not in document" | "Could not extract" | "Ambiguous" | "Not checked";
export interface Citation { sourceId: string; source: string; passage: string }
export interface Finding { id: string; name: string; severity: Severity; evidence: string[]; explanation: string; action: string; citations?: Citation[]; weight?: number }
export interface FieldInfo { status: FieldStatus; candidates: string[]; citations: Citation[]; confidence?: number }
export interface EmailContact { email: string; role: "applicant" | "sender / recruiter" | "company contact" | "unclassified"; source: string }
export interface Extracted {
  company: string | null; recruiter: string | null; jobTitle: string | null; salary: string | null;
  joiningDate: string | null; location: string | null; emails: string[]; domains: string[]; urls: string[]; phones: string[];
  recruiterDesignation?: string | null; currency?: string | null; fields?: Partial<Record<"company" | "recruiter" | "recruiterDesignation" | "jobTitle" | "salary" | "currency" | "joiningDate" | "location" | "emails" | "phones", FieldInfo>>; emailContacts?: EmailContact[];
  sources?: EvidenceSource[];
}
export interface Report { assessment: Assessment; points: number; findings: Finding[]; extracted: Extracted; phrases: string[] }

const FREE_MAIL = ["gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "rediffmail.com", "aol.com", "icloud.com", "proton.me", "protonmail.com", "mail.com", "yandex.com", "gmx.com"];
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "rb.gy", "cutt.ly", "is.gd", "shorturl.at", "tiny.cc"];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URLS = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const unique = (values: string[]) => [...new Set(values)];
const matches = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[0].replace(/[.,;]+$/, ""));
const group = (text: string, re: RegExp) => text.match(re)?.[1]?.trim().replace(/[.,;]+$/, "") || null;
const cite = (source: EvidenceSource, passage: string): Citation => ({ sourceId: source.id, source: source.name, passage });

export function hostOf(value: string): string | null {
  try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

export function extract(text: string): Extracted {
  const sources = readEvidence(text);
  const fields: Record<string, FieldInfo> = {};
  const fieldNames = ["company", "recruiter", "recruiterDesignation", "jobTitle", "salary", "currency", "joiningDate", "location", "emails", "phones"];
  const unreadable = sources.some((source) => source.kind === "document" && (!source.text.trim() || (source.confidence !== undefined && source.confidence < 60)));
  for (const name of fieldNames) fields[name] = { status: unreadable ? "Could not extract" : "Not in document", candidates: [], citations: [] };
  const add = (name: string, value: string | null, source: EvidenceSource, passage: string) => {
    if (!value) return;
    const field = fields[name];
    if (!field) return;
    if (!field.candidates.some((v) => v.toLowerCase() === value.toLowerCase())) field.candidates.push(value);
    field.citations.push(cite(source, passage));
    // OCR confidence is measured by Tesseract, not an invented field probability.
    if (source.confidence !== undefined) field.confidence = Math.min(field.confidence ?? source.confidence, source.confidence);
    field.status = field.candidates.length > 1 && !["emails", "phones"].includes(name) ? "Ambiguous" : "Extracted";
  };
  const emailContacts: EmailContact[] = [];
  const urls: string[] = [];
  for (const source of sources) {
    const official = employerPassages(source);
    let signature = false;
    for (const line of passages(source)) {
      for (const email of matches(line, EMAIL)) {
        const role: EmailContact["role"] = !official.includes(line) ? "applicant" : /^(?:from|sender|recruiter|hr|hiring|reply[- ]to)\b/i.test(line) || signature ? "sender / recruiter" : /^(?:contact|company email|official email|email|e-mail)\b/i.test(line) ? "company contact" : "unclassified";
        emailContacts.push({ email: email.toLowerCase(), role: source.kind === "commentary" ? "unclassified" : role, source: source.name });
      }
      if (/^(?:regards|sincerely|best regards)\b/i.test(line)) signature = true;
    }
    for (const [index, line] of official.entries()) {
      const clean = (value: string | null) => value?.split(/\s+(?:at|with)\s+|[.;](?:\s|$)/)[0]?.trim() || null;
      add("company", group(line, /^(?:company|organi[sz]ation|employer)(?: name)?\s*[:–-]\s*(.+)/i) ?? group(line, /\b(?:at|join|with)\s+([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,5}\s+(?:Pvt\.?\s*Ltd\.?|Ltd\.?|Inc\.?|LLC|Technologies|Solutions|Corporation|Limited))/), source, line);
      add("jobTitle", clean(group(line, /\b(?:position|job title|role|designation)(?: of)?\s*[:–-]?\s*(.+)/i)), source, line);
      add("salary", group(line, /^(?:salary|stipend|ctc|compensation|package|base salary)(?: of| is)?\s*[:–-]?\s*(.+)/i), source, line);
      add("joiningDate", group(line, /\b(?:joining date|start date|date of joining|reporting on|commence on)\s*[:–-]?\s*(.+)/i), source, line);
      add("location", group(line, /^(?:location|work location|based in|office location)\s*[:–-]\s*(.+)/i), source, line);
      add("recruiter", group(line, /^(?:recruiter|recruiter name|sender name|hiring manager|hr manager)\s*[:–-]\s*([^<@]+?)(?:\s+[A-Z0-9._%+-]+@|$)/i), source, line);
      add("recruiterDesignation", group(line, /^(?:recruiter designation|recruiter title)\s*[:–-]\s*(.+)/i), source, line);
      if (/^(?:regards|sincerely|best regards)\b/i.test(line)) {
        const next = official[index + 1];
        if (next && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(next)) add("recruiter", next, source, next);
        const designation = official[index + 2];
        if (designation && /\b(?:HR|recruiter|manager|talent|recruitment)\b/i.test(designation)) add("recruiterDesignation", designation, source, designation);
      }
      for (const email of matches(line, EMAIL)) add("emails", email.toLowerCase(), source, line);
      if (/\b(?:phone|tel(?:ephone)?|mobile|call|contact)\b/i.test(line)) {
        for (const phone of matches(line, /(?:\+\d{1,3}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)\d{3,5}[ -]?\d{3,5}/g)) {
          const digits = phone.replace(/\D/g, "");
          if (digits.length >= 10 && digits.length <= 15) add("phones", phone, source, line);
        }
      }
      urls.push(...matches(line, URLS));
    }
  }
  for (const salary of fields["salary"]?.candidates ?? []) {
    const currency = parseSalary(salary).currency;
    const ref = fields["salary"]?.citations.find((citation) => citation.passage.includes(salary));
    const source = sources.find((s) => s.id === ref?.sourceId);
    if (source && ref) add("currency", currency, source, ref.passage);
  }
  const value = (name: string) => fields[name]?.status === "Extracted" ? fields[name]?.candidates[0] ?? null : null;
  const emails = unique(fields["emails"]?.candidates ?? []);
  return { company: value("company"), recruiter: value("recruiter"), recruiterDesignation: value("recruiterDesignation"), jobTitle: value("jobTitle"), salary: value("salary"), currency: value("currency"), joiningDate: value("joiningDate"), location: value("location"), emails, phones: fields["phones"]?.candidates ?? [], urls: unique(urls), domains: unique([...emails.map((email) => email.split("@")[1] ?? ""), ...urls.map((url) => hostOf(url) ?? "")].filter(Boolean)), fields, emailContacts, sources };
}

const FEE = /\b(?:registration|onboarding|processing|training|passport|visa|equipment|laptop|security|application|joining|verification|documentation|certification|uniform|kit)\s+(?:fees?|charges?|costs?|payments?|deposits?)\b|\b(?:refundable\s+)?deposit\b/i;
const PAY = /\b(?:pay|transfer|send|remit|purchase|buy|deposit|wire|submit payment|payment required|must be paid|is payable)\b/i;
const NEGATED = /\b(?:no|zero)\s+(?:candidate[- ]paid\s+|candidate\s+|recruitment\s+|registration\s+|training\s+|onboarding\s+)?(?:fees?|charges?|payment|deposit)\b|\b(?:never|do not|don’t|don't|not required to|need not|will not|won't)\s+(?:\w+\s+){0,3}(?:pay|send|share|provide|transfer|purchase)\b|\b(?:fees?|costs?|charges?|equipment|visa|passport|training)\s+(?:are |is |will be )?(?:covered|paid|provided)\s+by\s+(?:the )?(?:company|employer|us)\b|\b(?:no|without)\s+cost\s+to\s+(?:you|the candidate)\b/i;
const MONEY = /(?:₹|rs\.?|inr|usd|\$|£|gbp|€|eur)\s*\d[\d,.]*(?:\s*[kK])?/i;
const SENSITIVE = /\b(?:aadhaar|aadhar|pan card|passport|ssn|social security|bank account (?:number|details)|account number|ifsc|cvv|otp|upi pin|pin|(?:net ?banking )?password|credit card|debit card)\b/i;
const SECRET = /\b(?:otp|cvv|pin|password)\b/i;
const REQUEST = /\b(?:share|send|provide|submit|upload|disclose|give|enter|forward|required|request(?:ed)?)\b/i;

/** Split contrast clauses: a no-fee claim cannot cancel an actual later payment demand. */
function clauses(line: string): string[] { return line.split(/\b(?:but|however|although|except)\b|;|,\s*(?=(?:you |please |must |pay |send |provide ))/i).map((value) => value.trim()).filter(Boolean); }
function candidatePayment(line: string, previous: string): boolean {
  return clauses(line).some((clause) => {
    if (NEGATED.test(clause)) return false;
    const outgoing = /\b(?:we|company|employer)\s+(?:will |shall )?(?:pay|reimburse|refund|provide|cover)\s+(?:you|the candidate|your|all|the)\b|\b(?:paid|payable|payment)\s+to\s+(?:you|the candidate|applicant)\b/i.test(clause);
    const candidate = /\b(?:you|candidate|applicant)\s+(?:must |shall |will |need to |are required to )?(?:pay|purchase|buy|transfer|send|cover)\b|\b(?:please|kindly)\s+(?:pay|send|transfer|deposit|purchase|buy)\b/i.test(clause);
    const requiredFee = FEE.test(clause) && /\b(?:required|payable|mandatory|pay|must|submit|send|transfer|costs you|deducted from)\b/i.test(clause);
    const equipment = /\b(?:pay for|buy|purchase)\b.*\b(?:laptop|equipment|training|visa|passport)\b/i.test(clause);
    const followup = PAY.test(clause) && FEE.test(previous) && !NEGATED.test(previous);
    return (!outgoing || candidate) && (requiredFee || equipment || followup || (candidate && (MONEY.test(clause) || /\b(?:fee|deposit|money|amount|vendor|wallet|upi|crypto|bitcoin|wire|bank transfer)\b/i.test(clause))));
  });
}

const WEIGHTS: Record<Severity, number> = { low: 1, medium: 3, high: 6 };
export function scoreFindings(findings: Finding[]): { points: number; assessment: Assessment } {
  const distinct = [...new Map(findings.map((finding) => [finding.id, finding])).values()];
  const points = distinct.reduce((total, finding) => total + WEIGHTS[finding.severity], 0);
  const strong = distinct.some((finding) => finding.severity === "high");
  const corroborated = distinct.filter((finding) => finding.severity === "medium").length >= 3;
  return { points, assessment: strong || (points >= 9 && corroborated) ? "high_concern" : points >= 3 ? "needs_review" : "low_concern" };
}

export function analyze(text: string): Report {
  const x = extract(text);
  const sources = x.sources ?? readEvidence(text);
  const findings: Finding[] = [];
  const add = (id: string, name: string, severity: Severity, citations: Citation[], explanation: string, action: string) => {
    if (!citations.length) return;
    const existing = findings.find((finding) => finding.id === id);
    const refs = citations.filter((citation, index, all) => all.findIndex((v) => v.sourceId === citation.sourceId && v.passage === citation.passage) === index);
    if (existing) {
      existing.citations = [...(existing.citations ?? []), ...refs].filter((citation, index, all) => all.findIndex((v) => v.sourceId === citation.sourceId && v.passage === citation.passage) === index);
      existing.evidence = unique(existing.citations.map((citation) => citation.passage));
      if (WEIGHTS[severity] > WEIGHTS[existing.severity]) { existing.severity = severity; existing.weight = WEIGHTS[severity]; }
      return;
    }
    findings.push({ id, name, severity, citations: refs, evidence: unique(refs.map((citation) => citation.passage)), explanation, action, weight: WEIGHTS[severity] });
  };
  for (const source of sources) {
    const lines = employerPassages(source);
    for (const [index, line] of lines.entries()) {
      const previous = lines[index - 1] ?? "";
      const next = lines[index + 1] ?? "";
      const refs = [cite(source, line)];
      if (candidatePayment(line, previous)) {
        if (FEE.test(previous) && !FEE.test(line)) refs.unshift(cite(source, previous));
        if (/(?:deadline|within|pay by|upi|bank transfer|wallet|crypto|reimburs|refund)/i.test(next)) refs.push(cite(source, next));
        add("payment_request", "Candidate payment requested", "high", refs, "The passage asks the applicant to fund recruitment or onboarding. Any stated amount, method, deadline or reimbursement promise is shown in the evidence; a missing amount does not make the demand safe.", "Do not pay or purchase anything to secure this job. Confirm the demand with HR using independently obtained company contact details.");
      }
      if (/\b(?:cheque|check)\b/i.test(line) && /\b(?:deposit|cash|send|purchase|buy|vendor|equipment|laptop)\b/i.test(line + " " + next) && !NEGATED.test(line)) {
        add("cheque_vendor", "Cheque / vendor reimbursement scheme", "high", [cite(source, line), ...(next && /vendor|equipment|laptop|send|transfer|balance/i.test(next) ? [cite(source, next)] : [])], "A cheque-funded purchase or transfer can leave you liable if the cheque is reversed. Reimbursement and a named vendor do not establish that funds are genuine.", "Do not spend cheque funds or forward a balance. Ask your bank to independently verify settlement and confirm equipment supply directly with the employer.");
      }
      if (/\b(?:host|hosting|rent|lease|remote access|install)\b/i.test(line) && /\b(?:laptop|device|computer|server)\b/i.test(line) && /\b(?:personal|your|home|payment|paid|earn|access)\b/i.test(line) && !NEGATED.test(line)) {
        add("device_hosting", "Personal device hosting / access arrangement", "medium", refs, "The offer involves hosting software or allowing access on a personal device. This may expose your network or accounts; the text does not establish malicious software.", "Do not install software or grant remote access until independent HR and IT contacts confirm the purpose and security controls.");
      }
      for (const clause of clauses(line)) {
        if (SENSITIVE.test(clause) && REQUEST.test(clause) && !NEGATED.test(clause)) {
          const secret = SECRET.test(clause);
          const normalPayroll = !secret && /official (?:hr |employee |onboarding )?portal|after (?:joining|onboarding|acceptance)|for (?:salary|payroll) processing/i.test(clause);
          if (!normalPayroll) add("sensitive_info", secret ? "Security credentials requested" : "Identity / banking information requested", secret ? "high" : "medium", refs, secret ? "The passage requests a secret such as an OTP, PIN, CVV or password. An employer has no legitimate need for these credentials." : "The passage requests identity or banking information. Such details can be legitimate after verification, but this request does not itself establish a trusted channel.", secret ? "Never share OTPs, PINs, CVVs or passwords. Contact the employer through an independent channel." : "Verify the employer and purpose first; submit only necessary information through a confirmed official HR portal.");
        }
      }
      if (/within\s+(?:2|6|12|24|48)\s*(?:hours|hrs)|failing which|last chance|do not share this offer|urgent(?:ly)?/i.test(line) && !NEGATED.test(line)) add("urgency", "Time pressure or secrecy", "low", refs, "A short deadline or secrecy request reduces time for checking. A deadline by itself is not evidence of fraud.", "Ask for time to confirm the offer independently before responding.");
      const salary = parseSalary(line);
      const dailyHigh = salary.amount !== null && salary.period === "day" && ((salary.currency === "INR" && salary.amount >= 10000) || (["USD", "GBP", "EUR"].includes(salary.currency ?? "") && salary.amount >= 1000));
      const unsupportedPromise = /guaranteed (?:income|salary|returns)|unlimited earnings/i.test(line) || /no (?:experience|qualification)s? (?:required|needed)/i.test(line) && dailyHigh;
      if (unsupportedPromise) add("unrealistic_pay", "Compensation promise needs corroboration", "medium", refs, "The stated guarantee or unusually large daily amount needs supporting terms. No market-rate or employer claim has been independently checked; no-experience wording alone is not flagged.", "Obtain the written pay structure and compare it with published ranges for the exact role, hours and location.");
      const contactEmails = (x.emailContacts ?? []).filter((contact) => contact.source === source.name && ["sender / recruiter", "company contact"].includes(contact.role) && line.toLowerCase().includes(contact.email));
      if (contactEmails.some((contact) => FREE_MAIL.includes(contact.email.split("@")[1] ?? ""))) add("personal_email", "Recruiter / contact uses a personal email", "low", refs, "This claimed recruiter or company contact uses a free-mail address. Small employers may do this legitimately; applicant and unclassified addresses are excluded.", "Confirm the sender's identity through an independently located company HR contact.");
      const bad = matches(line, URLS).filter((url) => { const host = hostOf(url) ?? ""; return SHORTENERS.includes(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || /@/.test(url) || /xn--/i.test(host); });
      if (bad.length) add("suspicious_links", "Obscured or unusual link destination", "medium", refs, "The text contains a shortened, numeric, credential-style or internationalised destination. This is a lexical check only; no website was contacted.", "Do not submit details through the link. Locate the employer's website independently and confirm the destination.");
      else if (matches(line, URLS).some((url) => /^http:\/\//i.test(url))) add("unencrypted_link", "Unencrypted link", "low", refs, "The supplied link uses HTTP. This does not establish a scam, but sensitive information should not be sent through an unencrypted page.", "Use a confirmed HTTPS company site and avoid entering private information at this address.");
    }
  }
  for (const name of ["company", "jobTitle", "joiningDate"] as const) {
    const field = x.fields?.[name];
    if (field?.status === "Ambiguous") add(`inconsistent_${name}`, `Conflicting ${name === "jobTitle" ? "job title" : name === "joiningDate" ? "joining date" : "company name"}`, "medium", field.citations, "Different explicit values occur in this evidence set. Amendments or different roles may explain this; the conflict is not proof of forgery.", "Ask HR which document and value is current, and obtain a corrected written offer.");
  }
  const salaries = x.fields?.["salary"];
  if (salaries && salaries.candidates.length > 1) {
    const parsed = salaries.candidates.map((salary) => ({ ...parseSalary(salary), salary }));
    const known = parsed.filter((value) => value.amount !== null && value.period !== null && value.currency !== null);
    const conflict = known.some((left) => known.some((right) => left.currency === right.currency && left.amount !== null && right.amount !== null && left.period && right.period && Math.abs(left.amount * PERIOD_FACTOR[left.period] - right.amount * PERIOD_FACTOR[right.period]) > Math.max(left.amount * PERIOD_FACTOR[left.period], right.amount * PERIOD_FACTOR[right.period]) * .02 && /^(?:salary|stipend|base salary)/i.test(salaries.citations.find((ref) => ref.passage.includes(left.salary))?.passage ?? "") && /^(?:salary|stipend|base salary)/i.test(salaries.citations.find((ref) => ref.passage.includes(right.salary))?.passage ?? "")));
    if (conflict) add("inconsistent_salary", "Conflicting salary amounts", "medium", salaries.citations, "Explicit base salary or stipend amounts differ after annualising the same currency. CTC versus base pay and unknown periods are not treated as contradictions.", "Ask HR to clarify base pay, CTC, deductions, currency and pay period in one corrected offer.");
  }
  const employerDomains = unique((x.emailContacts ?? []).filter((contact) => ["sender / recruiter", "company contact"].includes(contact.role)).map((contact) => contact.email.split("@")[1] ?? "").filter((domain) => !FREE_MAIL.includes(domain)));
  if (employerDomains.length > 1) {
    const citations = (x.fields?.["emails"]?.citations ?? []).filter((ref) => employerDomains.some((domain) => ref.passage.includes(domain)));
    add("multiple_domains", "Different claimed employer contact domains", "low", citations, "Claimed employer contacts use different domains. Agencies and subsidiaries can explain this; no domain ownership has been checked.", "Confirm the relationship and the recruiter's authority with an independently located company contact.");
  }
  const scored = scoreFindings(findings);
  return { ...scored, findings, extracted: x, phrases: unique(findings.flatMap((finding) => finding.evidence)) };
}

export const ASSESSMENT_META: Record<Assessment, { label: string; summary: string }> = {
  low_concern: { label: "Low Concern", summary: "We found few or no common warning signs. This does not prove the offer is genuine; still verify independently." },
  needs_review: { label: "Needs Review", summary: "Some warning signs appeared. Verify the details below with the company before you proceed." },
  high_concern: { label: "High Concern", summary: "Several or serious warning signs appeared. Do not pay or share sensitive data until you have verified the employer." },
};
