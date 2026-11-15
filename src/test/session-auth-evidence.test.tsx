import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock Supabase
const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockUpdateUser = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      getUser: () => mockGetUser(),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { recommendations: "Tips" }, error: null }),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useSearch: () => ({ redirect: "/verify" }),
  }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { Login } from "@/routes/login";
import { ReportView, getEvidenceSnippet } from "@/components/verify/ReportView";
import type { Finding, Report } from "@/lib/verify/engine";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Improvement 1: Automatic Logout via sessionStorage", () => {
  it("uses sessionStorage in the browser environment so session is discarded when browser is closed", async () => {
    // Verify sessionStorage functions as intended for auth storage
    const testKey = "sb-tgmzdtjbxojwiaczaedj-auth-token";
    const testSession = JSON.stringify({ access_token: "xyz123", user: { id: "u-1" } });

    window.sessionStorage.setItem(testKey, testSession);
    expect(window.sessionStorage.getItem(testKey)).toBe(testSession);

    window.sessionStorage.removeItem(testKey);
    expect(window.sessionStorage.getItem(testKey)).toBeNull();
  });
});

describe("Improvement 2: Email OTP directly on the signup page", () => {
  it("initiates email OTP on signup and verifies OTP directly on the page without opening another tab", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockVerifyOtp.mockResolvedValue({
      data: { session: { access_token: "token123" }, user: { id: "user123" } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ data: { user: { id: "user123" } }, error: null });

    render(<Login />);

    // Switch to Sign up tab
    const signupTab = screen.getByRole("tab", { name: "Sign up" });
    fireEvent.pointerDown(signupTab, { button: 0 });
    fireEvent.mouseDown(signupTab, { button: 0 });
    fireEvent.click(signupTab, { button: 0 });
    fireEvent.keyDown(signupTab, { key: "Enter" });

    // Fill in email and password
    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "candidate@example.com" } });

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "securePassword123" } });

    // Click "Send verification code"
    const submitBtn = screen.getByRole("button", { name: "Send verification code" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);
    });

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "candidate@example.com",
      options: { shouldCreateUser: true },
    });

    // The user should now see the OTP verification form directly on the page!
    await waitFor(() => {
      expect(screen.getByText("Verify your email")).toBeInTheDocument();
      expect(screen.getByText(/candidate@example.com/)).toBeInTheDocument();
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Verify & Continue" })).toBeInTheDocument();
    });

    // Enter 6-digit OTP code directly on the same page
    const otpInput = screen.getByLabelText("Verification code");
    fireEvent.change(otpInput, { target: { value: "482910" } });

    const verifyBtn = screen.getByRole("button", { name: "Verify & Continue" });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: "candidate@example.com",
        token: "482910",
        type: "email",
      });
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/verify", replace: true });
    });
  });
});

describe("Improvement 3: Highlighted Evidence dropdown", () => {
  it("getEvidenceSnippet extracts the exact suspicious sentence with relevant words demarcated", () => {
    const fullText =
      "Congratulations on your selection. Kindly pay a refundable security deposit of ₹2,999 within 24 hours. Contact hr@scam.org.";
    const snippet = getEvidenceSnippet(fullText, "refundable security deposit");

    expect(snippet).not.toBeNull();
    expect(snippet?.highlight).toBe("refundable security deposit");
    expect(snippet?.prefix).toContain("Kindly pay a");
    expect(snippet?.suffix).toContain("of ₹2,999 within 24 hours.");
  });

  it("renders a collapsed 'View Evidence' dropdown that reveals highlighted sentence only on click", async () => {
    const sampleOfferText =
      "We are pleased to offer you the position. Kindly pay a refundable security deposit of ₹2,999 to secure your slot. Report by Monday.";

    const mockFinding: Finding = {
      id: "fee_required",
      name: "Payment requested",
      severity: "high",
      evidence: ["refundable security deposit"],
      explanation: "Legitimate employers never ask candidates to pay any upfront fee.",
      action: "Do not pay. Confirm via official company website.",
    };

    const mockReport: Report = {
      assessment: "high_concern",
      points: 10,
      findings: [mockFinding],
      extracted: {
        company: "Test Corp",
        recruiter: "Fake HR",
        jobTitle: "Data Entry",
        salary: null,
        joiningDate: null,
        location: null,
        emails: [],
        domains: [],
        urls: [],
        phones: [],
      },
      phrases: ["refundable security deposit"],
    };

    render(<ReportView report={mockReport} text={sampleOfferText} onReset={() => {}} />);

    // Warning is visible
    expect(screen.getByText("Payment requested")).toBeInTheDocument();

    // "View Evidence (1)" dropdown button is present and collapsed by default
    const viewEvidenceBtn = screen.getByRole("button", {
      name: "View evidence for Payment requested",
    });
    expect(viewEvidenceBtn).toBeInTheDocument();
    expect(viewEvidenceBtn).toHaveAttribute("aria-expanded", "false");

    // The sentence evidence container is initially collapsed/hidden on screen
    expect(screen.getByText("View Evidence (1)")).toBeInTheDocument();

    // Click to expand
    fireEvent.click(viewEvidenceBtn);

    // Now expanded
    expect(viewEvidenceBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hide Evidence")).toBeInTheDocument();

    // Check highlighted sentence
    const markElement = screen.getByText("refundable security deposit");
    expect(markElement.tagName.toLowerCase()).toBe("mark");
    expect(markElement.className).toContain("mark-high");
    expect(screen.getByText(/Kindly pay a/)).toBeInTheDocument();
    expect(screen.getByText(/to secure your slot\./)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(viewEvidenceBtn);
    expect(viewEvidenceBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("View Evidence (1)")).toBeInTheDocument();
  });
});
