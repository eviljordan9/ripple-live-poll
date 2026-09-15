import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { user, loading, login, signup } = useAuth();
  const next = "/studio";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-sm pt-6">
          <div className="h-8 w-40 animate-pulse rounded bg-fg/8" />
          <div className="mt-6 h-40 animate-pulse rounded-3xl bg-fg/6" />
        </div>
      </AppShell>
    );
  }

  if (user) {
    return <Navigate to={next} replace />;
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "up") {
        await signup(name.trim() || email.split("@")[0] || "Host", email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-sm pt-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">
          Host access
        </p>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">
          {mode === "in" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          You need an account to create and manage polls. Voting stays open to anyone with the link.
        </p>

        <form onSubmit={onEmail} className="mt-8 flex flex-col gap-3">
          {mode === "up" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
            />
          </div>
          {error ? <p className="text-sm text-live">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-5 text-sm text-muted hover:text-fg"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setError(null);
          }}
        >
          {mode === "in" ? "Need an account? Create one" : "Already have one? Sign in"}
        </button>

        <p className="mt-10 text-sm text-subtle">
          Just voting?{" "}
          <Link to="/" className="text-muted underline-offset-4 hover:text-fg hover:underline">
            Go home
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
