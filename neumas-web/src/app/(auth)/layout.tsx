/**
 * Auth layout — full viewport, no sidebar.
 * Wraps /login and /signup.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-hidden bg-background">
      {children}
    </div>
  );
}
