import { describe, it, expect } from "vitest";
import { analyze } from "./engine";
import { extract, scoreFindings } from "./engine";
import { serializeEvidence } from "./evidence";

describe("offer engine", () => {
  it("flags a registration fee as high concern", () => {
    const r = analyze("Congratulations! Pay a registration fee of Rs 2,500 within 24 hours. Contact hr.jobs@gmail.com");
    expect(r.assessment).toBe("high_concern");
    expect(r.findings.map((f) => f.id)).toContain("payment_request");
    expect(r.findings.map((f) => f.id)).toContain("personal_email");
  });

  it("rates a complete, ordinary offer as low concern", () => {
    const r = analyze(
      "Company: Acme Technologies Pvt Ltd\nPosition: Software Engineer Intern\nStipend: ₹25,000 per month\nLocation: Bengaluru\nContact: priya@acmetech.com",
    );
    expect(r.assessment).toBe("low_concern");
  });

  it("flags shortened links", () => {
    const r = analyze("Fill your details at https://bit.ly/abc123");
    expect(r.findings.map((f) => f.id)).toContain("suspicious_links");
  });

  for (const fee of ["registration", "onboarding", "processing", "training", "passport", "visa", "equipment"]) {
    it(`detects a mandatory ${fee} fee without an amount`, () => {
      const result = analyze(`You must pay the ${fee} fee before joining.`);
      expect(result.findings.find((finding) => finding.id === "payment_request")?.severity).toBe("high");
      expect(result.assessment).toBe("high_concern");
    });
  }
  for (const safe of ["No candidate fees.", "You are not required to pay registration fees.", "Training costs are paid by the company.", "We will pay you INR 25000 per month.", "Never send your OTP, PIN or password.", "No experience required."]) {
    it(`avoids a false positive for: ${safe}`, () => {
      expect(analyze(safe).findings).toEqual([]);
    });
  }
  it("does not let a negated fee hide a later demand", () => {
    expect(analyze("No candidate fees, but you must pay an equipment deposit.").findings.map((finding) => finding.id)).toContain("payment_request");
  });
  it("keeps amounts, payment method, deadline and reimbursement in exact evidence", () => {
    const passage = "Please pay a visa fee of USD 500 via bank transfer within 24 hours; we will reimburse you after joining.";
    const finding = analyze(passage).findings.find((finding) => finding.id === "payment_request");
    expect(finding?.evidence).toContain(passage);
    expect(finding?.citations?.[0]?.passage).toBe(passage);
  });
  it("detects a cheque-funded vendor purchase even when applicant receives money first", () => {
    expect(analyze("We will send you a cheque. Deposit the check and buy equipment from our vendor.").findings.map((finding) => finding.id)).toContain("cheque_vendor");
  });
  it("detects personal laptop hosting", () => {
    expect(analyze("Earn payment to host our server software on your personal laptop.").findings.map((finding) => finding.id)).toContain("device_hosting");
  });
  it("flags requested secrets, but not a passport used as a document title", () => {
    expect(analyze("Please send your OTP for onboarding.").assessment).toBe("high_concern");
    expect(analyze("Passport policy: keep your passport valid.").findings).toEqual([]);
  });
  it("does not flag verified-channel payroll wording as a suspicious identity request", () => {
    expect(analyze("Submit bank account details through the official HR portal after joining.").findings).toEqual([]);
  });
  it("ignores applicant addresses and commentary for employer extraction and warnings", () => {
    const result = analyze(serializeEvidence([
      { id: "a", name: "letter", kind: "document", text: "To: jane@gmail.com\nCompany: Acme Ltd\nJob title: Principal Software Engineer\nSalary: INR 120000 per month\nFrom: priya@acme.com\nLocation: Mumbai" },
      { id: "b", name: "my notes", kind: "commentary", text: "Company: Fake Ltd\nPay a registration fee of Rs 5000.\nSalary: USD 500 daily" },
    ]));
    expect(result.extracted.company).toBe("Acme Ltd");
    expect(result.extracted.jobTitle).toBe("Principal Software Engineer");
    expect(result.extracted.emails).toEqual(["priya@acme.com"]);
    expect(result.findings).toEqual([]);
    expect(result.extracted.emailContacts?.find((contact) => contact.email === "jane@gmail.com")?.role).toBe("applicant");
  });
  it("excludes an applicant information block", () => {
    const result = extract("Applicant details:\nName: Jane Smith\nEmail: jane@gmail.com\nCompany: Acme Ltd\nPosition: Analyst\nContact: hr@acme.com");
    expect(result.emails).toEqual(["hr@acme.com"]);
  });
  it("deduplicates the same fee across sources while retaining each source reference", () => {
    const result = analyze(serializeEvidence([1, 2].map((id) => ({ id: `${id}`, name: `image-${id}.png`, kind: "document", text: "Pay a registration fee of Rs 2500." }))));
    expect(result.findings).toHaveLength(1);
    expect(result.points).toBe(6);
    expect(result.findings[0]?.citations?.map((citation) => citation.source)).toEqual(["image-1.png", "image-2.png"]);
    expect(result.findings[0]?.evidence).toEqual(["Pay a registration fee of Rs 2500."]);
  });
  it("shows ambiguous salaries and corroborates conflicts across documents", () => {
    const result = analyze(serializeEvidence([
      { id: "a", name: "letter.pdf · page 1", kind: "document", text: "Salary: INR 25000 per month" },
      { id: "b", name: "email.png", kind: "document", text: "Salary: INR 50000 per month" },
    ]));
    expect(result.extracted.salary).toBeNull();
    expect(result.extracted.fields?.salary?.status).toBe("Ambiguous");
    expect(result.findings.find((finding) => finding.id === "inconsistent_salary")?.citations).toHaveLength(2);
    expect(result.assessment).toBe("needs_review");
  });
  it("does not confuse equivalent monthly and annual salary or CTC and base pay", () => {
    for (const text of ["Salary: INR 25000 per month\nSalary: INR 300000 per year", "Salary: INR 25000 per month\nCTC: INR 500000 per year"]) {
      expect(analyze(text).findings.map((finding) => finding.id)).not.toContain("inconsistent_salary");
    }
  });
  it("uses measured OCR confidence without scoring missing or failed extraction as risk", () => {
    const result = analyze(serializeEvidence([{ id: "a", name: "blurred.png", kind: "document", method: "ocr", confidence: 32, text: "unreadable fragments" }]));
    expect(result.extracted.fields?.company?.status).toBe("Could not extract");
    expect(result.points).toBe(0);
    expect(result.assessment).toBe("low_concern");
  });
  it("keeps one weak personal-email signal below High Concern", () => {
    expect(analyze("Recruiter: Jane Smith\nEmail: jane@gmail.com").assessment).toBe("low_concern");
  });
  it("does not infer impersonation from a company abbreviation or a legitimate form link", () => {
    expect(analyze("Company: International Business Machines\nFrom: hr@ibm.com\nForm: https://docs.google.com/forms/test").findings).toEqual([]);
  });
  it("scores each warning once and requires corroboration for medium signals", () => {
    const finding = (id: string, severity: "medium" | "low") => ({ id, severity, name: id, evidence: [id], explanation: id, action: id });
    expect(scoreFindings([finding("a", "medium"), finding("a", "medium")]).points).toBe(3);
    expect(scoreFindings([finding("a", "medium"), finding("b", "medium")]).assessment).toBe("needs_review");
    expect(scoreFindings([finding("a", "medium"), finding("b", "medium"), finding("c", "medium")]).assessment).toBe("high_concern");
  });
});
