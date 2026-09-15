import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("font-brand text-xl font-extrabold tracking-tight text-fg", className)}
    >
      Ripple
    </Link>
  );
}

function AuthSlot() {
  const { user, loading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (loading) {
    return <div className="h-8 w-24 animate-pulse rounded-full bg-fg/8" />;
  }
  if (user) {
    const label = user.name || user.email || "Account";
    return (
      <div className="flex items-center gap-3">
        <Link
          to="/studio"
          className="text-sm font-medium text-muted transition-colors duration-[150ms] hover:text-fg"
        >
          Studio
        </Link>
        <div className="flex max-w-xs items-center gap-2 overflow-hidden rounded-full border border-border bg-bg-elevated px-2 py-1 sm:max-w-none">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-fg/10 text-sm font-medium">
            {label.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-medium">{label}</span>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void logout().catch(() => setSigningOut(false));
            }}
            className="cursor-pointer text-sm text-muted underline-offset-4 hover:text-fg hover:underline disabled:cursor-wait disabled:no-underline"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Link
        to="/login"
        className="text-sm font-medium text-muted transition-colors duration-[150ms] hover:text-fg"
      >
        Sign in
      </Link>
      <Link
        to="/new"
        className="inline-flex h-10 items-center rounded-xl bg-fg px-3.5 text-sm font-medium text-bg"
      >
        Create poll
      </Link>
    </div>
  );
}

export function AppShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Wordmark />
          <AuthSlot />
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full grow shrink-0 px-5 py-8 sm:py-12",
          wide ? "max-w-5xl" : "max-w-2xl",
        )}
      >
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 text-xs text-subtle">
          <span className="font-brand font-extrabold tracking-tight">Ripple</span>
          <span>Live polls. Instant answers.</span>
        </div>
      </footer>
    </div>
  );
}
