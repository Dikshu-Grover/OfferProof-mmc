import { describe, it, expect } from "vitest";
import { analyze } from "./engine";

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
});
