import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AuthPage from "@/app/auth/page";
import { login } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";

const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/lib/api/endpoints", () => ({
  login: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  signInWithGoogle: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  captureUIError: vi.fn(),
  identifyUser: vi.fn(),
  track: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockLogin = vi.mocked(login);

function resetAuthStore() {
  useAuthStore.setState({
    token: null,
    refreshToken: null,
    expiresAt: null,
    profile: null,
    orgId: null,
    propertyId: null,
    _hasHydrated: false,
  });
}

describe("login form", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = "neumas_session=; Path=/; Max-Age=0";
    mockSearchParams = new URLSearchParams();
    resetAuthStore();
  });

  it("renders email and password fields", () => {
    render(<AuthPage />);

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
  });

  it("shows validation errors when submitted empty", async () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email")).toBeTruthy();
    expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("navigates to dashboard after a successful login response", async () => {
    mockLogin.mockResolvedValue({
      access_token: "not-a-real-jwt",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "refresh-token",
      profile: {
        user_id: "user-1",
        email: "chef@example.com",
        full_name: "Test Chef",
        org_id: "org-1",
        org_name: "Neumas Test",
        property_id: "property-1",
        property_name: "Main Kitchen",
        role: "admin",
      },
    });

    render(<AuthPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "chef@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: "chef@example.com",
        password: "correct-password",
      });
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });

    // Regression for AUTH-001: without this cookie, middleware (src/utils/supabase/proxy.ts)
    // has no way to see an email/password session and bounces the browser back to
    // /auth?next=%2Fdashboard even though login succeeded and router.replace fired.
    expect(document.cookie).toContain("neumas_session=1");
  });

  it("redirects to a same-origin next= target after a successful login", async () => {
    mockSearchParams = new URLSearchParams({ next: "/dashboard/inventory" });
    mockLogin.mockResolvedValue({
      access_token: "not-a-real-jwt",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "refresh-token",
      profile: {
        user_id: "user-1",
        email: "chef@example.com",
        full_name: "Test Chef",
        org_id: "org-1",
        org_name: "Neumas Test",
        property_id: "property-1",
        property_name: "Main Kitchen",
        role: "admin",
      },
    });

    render(<AuthPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "chef@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard/inventory");
    });
  });

  it("redirects an already-authenticated user straight to dashboard on visiting /auth", async () => {
    useAuthStore.setState({
      token: "existing-token",
      refreshToken: null,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      profile: {
        user_id: "user-1",
        email: "chef@example.com",
        full_name: "Test Chef",
        org_id: "org-1",
        org_name: "Neumas Test",
        property_id: "property-1",
        property_name: "Main Kitchen",
        role: "admin",
      },
      orgId: "org-1",
      propertyId: "property-1",
      _hasHydrated: true,
    });

    render(<AuthPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });
  });
});
