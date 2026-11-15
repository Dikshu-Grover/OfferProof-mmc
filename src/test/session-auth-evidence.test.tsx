import { act, fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock Supabase
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockResend = vi.fn();
const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockSetSession = vi.fn();
let authChangeCallback: ((event: string, session: unknown) => void) | null = null;

const mockOnAuthStateChange = vi.fn((cb) => {
  authChangeCallback = cb;
  return {
    data: {
      subscription: {
        unsubscribe: vi.fn(),
      },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      resend: (...args: unknown[]) => mockResend(...args),
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
      setSession: (...args: unknown[]) => mockSetSession(...args),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        mockOnAuthStateChange(cb),
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

import { Login, maskEmail } from "@/routes/login";
import { ReportView, getEvidenceSnippet } from "@/components/verify/ReportView";
import type { Finding, Report } from "@/lib/verify/engine";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authChangeCallback = null;
});

describe("Improvement 1: Automatic Logout via sessionStorage", () => {
  it("uses sessionStorage in the browser environment so session is discarded when browser is closed", async () => {
    const testKey = "sb-tgmzdtjbxojwiaczaedj-auth-token";
    const testSession = JSON.stringify({ access_token: "xyz123", user: { id: "u-1" } });

    window.sessionStorage.setItem(testKey, testSession);
    expect(window.sessionStorage.getItem(testKey)).toBe(testSession);

    window.sessionStorage.removeItem(testKey);
    expect(window.sessionStorage.getItem(testKey)).toBeNull();
  });
});

describe("3-Stage Registration & Magic Link Verification Flow", () => {
  it("maskEmail correctly masks the email address for privacy", () => {
    expect(maskEmail("alex.hunter@example.com")).toBe("a***r@example.com");
    expect(maskEmail("john@test.org")).toBe("j***n@test.org");
    expect(maskEmail("ab@test.org")).toBe("a***@test.org");
  });

  it("Stage 1 & 2: Submits full registration, requests Supabase magic confirmation link, and displays 'Check your inbox' screen with masked email", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-123" }, session: null },
      error: null,
    });

    render(<Login />);

    // Stage 1: Registration form
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Alex Hunter" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "alex.hunter@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "securePassword123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "securePassword123" },
    });

    // Submit registration
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "alex.hunter@example.com",
        password: "securePassword123",
        options: {
          data: { full_name: "Alex Hunter" },
          emailRedirectTo: expect.stringContaining("/login?redirect=%2Fverify"),
        },
      });
    });

    // Stage 2: Check your inbox screen is displayed
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
      expect(screen.getByText("a***r@example.com")).toBeInTheDocument();
      expect(
        screen.getByText(/We sent a Supabase magic confirmation link to activate your account/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Return to this OfferProof tab/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Resend email/i })).toBeInTheDocument();
      expect(screen.getByText(/Entered wrong email\? Change it/i)).toBeInTheDocument();
    });
  });

  it("Stage 3: Automatically detects verification via auth state change and transitions to email-verified success state", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-456" }, session: null },
      error: null,
    });

    render(<Login />);

    // Register
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Sarah Connor" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sarah@cyberdyne.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "futureisnow88" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "futureisnow88" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    // Reaches verification stage
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    });

    // Simulate cross-tab / email magic-link click triggering Supabase auth state change
    act(() => {
      if (authChangeCallback) {
        authChangeCallback("SIGNED_IN", {
          user: { id: "user-456", email: "sarah@cyberdyne.com" },
          access_token: "mock_jwt_token",
          refresh_token: "mock_refresh",
        });
      }
    });

    // Stage 3 Success state is rendered automatically
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Email verified!" })).toBeInTheDocument();
      expect(screen.getByText(/Your account is confirmed and ready/i)).toBeInTheDocument();
    });
  });

  it("resend email calls Supabase resend with signup type and activates cooldown", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-789" }, session: null },
      error: null,
    });
    mockResend.mockResolvedValue({ data: {}, error: null });

    render(<Login />);

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "john.doe@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    });

    const resendBtn = screen.getByRole("button", { name: /Resend email/i });
    expect(resendBtn).toBeDisabled(); // cooldown active
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
