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
  applicantEmails?: string[];
  recruiterEmails?: string[];
  unknownEmails?: string[];
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
  "gmail.com",
  "yahoo.com",
  "yahoo.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "rediffmail.com",
  "aol.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "yandex.com",
  "gmx.com",
];

const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "rb.gy",
  "cutt.ly",
  "is.gd",
  "shorturl.at",
  "tiny.cc",
];

const RISKY_TLDS = [
  ".xyz",
  ".top",
  ".click",
  ".buzz",
  ".work",
  ".live",
  ".icu",
  ".online",
  ".site",
  ".info",
];

function findAll(text: string, re: RegExp): string[] {
  const out = new Set<string>();

  for (const match of text.matchAll(re)) {
    out.add(match[0].trim());
  }

  return [...out];
}

function firstGroup(text: string, re: RegExp): string | null {
  const match = text.match(re);
  const value = match?.[1]?.trim().replace(/[.,;]+$/, "");

  return !value ||
    /^(?:not (?:found|provided|stated|specified|available)|n\/?a|unknown|tbd|to be (?:confirmed|discussed)|[-–—]+)$/i.test(
      value,
    )
    ? null
    : value;
}

const RECRUITER_PATTERN =
  /\b(?:recruiter(?:'s)?|recruitment(?:\s+team)?|talent\s+acquisition|hr\s+representative|hr\s+rep|hr\s+manager|hr\s+team|hr\s+department|human\s+resources|hr|hiring\s+contact|hiring\s+manager|hi[...