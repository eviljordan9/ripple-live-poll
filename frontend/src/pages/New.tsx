import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, POLL_TEMPLATES, sanitizeSlugInput, SLUG_MAX } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function NewPoll() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [hideUntilVoted, setHideUntilVoted] = useState(false);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <AppShell>
        <div className="h-8 w-40 animate-pulse rounded bg-fg/8" />
        <div className="mt-6 h-40 animate-pulse rounded-2xl bg-fg/6" />
      </AppShell>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  function addOption() {
    if (options.length >= 8) return;
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const poll = await api.createPoll({
        question,
        options,
        hideUntilVoted,
        slug: slug || undefined,
      });
      toast.success("Poll is live");
      await navigate(`/p/${poll.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create poll.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <p className="text-xs font-medium uppercase tracking-widest text-muted">
        New poll
      </p>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">
        What are we deciding?
      </h1>

      <div className="mt-6 flex flex-wrap gap-2">
        {POLL_TEMPLATES.map((tpl) => (
          <button
            key={tpl.name}
            type="button"
            onClick={() => {
              if (tpl.question) setQuestion(tpl.question);
              setOptions([...tpl.options]);
            }}
            className="h-9 rounded-full border border-border px-3 text-xs font-medium text-muted transition-colors duration-[150ms] hover:border-border-strong hover:text-fg"
          >
            {tpl.name}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="question">Question</Label>
          <Input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Where should we take the offsite?"
            maxLength={160}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="slug">Link code</Label>
          <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-border bg-bg-elevated">
            <span className="shrink-0 pl-3.5 font-mono text-sm text-subtle">/p/</span>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(sanitizeSlugInput(e.target.value))}
              placeholder="AUTO"
              maxLength={SLUG_MAX}
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-none border-0 bg-transparent font-mono text-sm tracking-wide uppercase focus-visible:ring-0"
            />
          </div>
          <p className="text-xs text-subtle">
            3–16 letters or numbers. Leave blank to generate one.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Options</Label>
          <div className="flex flex-col gap-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={60}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove option"
                  disabled={options.length <= 2}
                  onClick={() => removeOption(i)}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            disabled={options.length >= 8}
            className={cn(
              "inline-flex h-11 items-center gap-2 self-start rounded-xl px-2 text-sm font-medium text-muted hover:text-fg",
              options.length >= 8 && "opacity-40",
            )}
          >
            <Plus className="size-4" />
            Add option
          </button>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-border bg-bg-elevated p-4">
          <input
            type="checkbox"
            checked={hideUntilVoted}
            onChange={(e) => setHideUntilVoted(e.target.checked)}
            className="mt-1 size-4 accent-fg"
          />
          <span>
            <span className="block text-sm font-medium">Hide results until they vote</span>
            <span className="mt-0.5 block text-sm text-muted">
              The room sees the tally after casting a vote. You always see it.
            </span>
          </span>
        </label>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Opening…" : "Open the poll"}
        </Button>
      </form>
    </AppShell>
  );
}
