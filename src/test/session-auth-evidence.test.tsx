import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock Supabase
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
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

describe("Original Supabase Magic-Link Authentication Flow", () => {
  it("redirects immediately if user is already signed in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-existing" } } });

    render(<Login />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/verify", replace: true });
    });
  });

  it("handles user sign-in with email and password", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSignInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });

    render(<Login />);

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: "Sign in" });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/verify", replace: true });
    });
  });

  it("handles user signup with magic confirmation link", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-new" }, session: null },
      error: null,
    });

    render(<Login />);

    // Switch to Sign up tab
    const signUpTab = screen.getByRole("tab", { name: "Sign up" });
    fireEvent.keyDown(signUpTab, { key: "Enter", code: "Enter", charCode: 13 });
    fireEvent.click(signUpTab);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: "Create account" });

    fireEvent.change(emailInput, { target: { value: "newuser@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "password123",
        options: {
          emailRedirectTo: expect.stringContaining("/login?redirect=%2Fverify"),
        },
      });
    });

    // Confirmation message shown
    await waitFor(() => {
      expect(screen.getByText("newuser@example.com")).toBeInTheDocument();
      expect(screen.getByText(/for a confirmation link/)).toBeInTheDocument();
    });
  });

  it("validates email format and minimum password length", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Login />);

    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: "Sign in" });

    // Invalid email and short password
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.change(passwordInput, { target: { value: "short" } });
    fireEvent.click(submitBtn);

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
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
