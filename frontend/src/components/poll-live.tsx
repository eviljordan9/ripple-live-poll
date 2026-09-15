import { Check, Copy, Lock, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrMark } from "@/components/qr-mark";
import { copyToClipboard, pollShareUrl } from "@/lib/clipboard";
import { formatVoteCount, sanitizeSlugInput, SLUG_MAX, type PollView } from "@/lib/api";
import { cn } from "@/lib/utils";

export function LiveBadge({ closed }: { closed: boolean }) {
  if (closed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted">
        <Lock className="size-3" />
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-live">
      <span className="relative flex size-2">
        <span className="live-ping absolute inset-0 animate-ping rounded-full bg-live opacity-60" />
        <span className="relative size-2 rounded-full bg-live" />
      </span>
      Live
    </span>
  );
}

function ResultBar({
  label,
  pct,
  votes,
  selected,
  visible,
}: {
  label: string;
  pct: number;
  votes: number;
  selected: boolean;
  visible: boolean;
}) {
  const width = visible ? pct : 0;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border px-4 py-3.5",
        selected ? "border-border-strong bg-fg/8" : "border-border bg-bg-subtle",
      )}
    >
      <div
        className="bar-fill absolute inset-y-0 left-0 bg-fg/12 transition-[width] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `${width}%` }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {selected ? <Check className="size-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </span>
        {visible ? (
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
            {pct}%
            <span className="hidden sm:inline"> · {votes}</span>
          </span>
        ) : (
          <span className="text-xs text-subtle">Hidden</span>
        )}
      </div>
    </div>
  );
}

export function PollLive({
  poll,
  onVote,
  voting = false,
  isOwner = false,
  onClose,
  onReopen,
  onRenameSlug,
  compact = false,
}: {
  poll: PollView;
  onVote?: (optionId: string) => void;
  voting?: boolean;
  isOwner?: boolean;
  onClose?: () => void;
  onReopen?: () => void;
  onRenameSlug?: (nextSlug: string) => void;
  compact?: boolean;
}) {
  const closed = poll.status === "closed";
  const canVote = !closed && !poll.votedOptionId && Boolean(onVote);
  const [copied, setCopied] = useState(false);
  const [draftSlug, setDraftSlug] = useState(poll.slug);
  const [showQr, setShowQr] = useState(false);
  const shareInputRef = useRef<HTMLInputElement>(null);
  const canEditSlug = Boolean(isOwner && onRenameSlug);
  const slugDirty = canEditSlug && draftSlug !== poll.slug;

  useEffect(() => {
    setDraftSlug(poll.slug);
  }, [poll.slug]);

  async function copyLink() {
    const url = pollShareUrl(poll.slug);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success("Link copied");
      return;
    }
    const field = shareInputRef.current;
    if (field) {
      field.focus();
      field.select();
      toast.message("Select the code, then copy it.");
      return;
    }
    toast.error("Could not copy link");
  }

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-bg-elevated",
        compact ? "p-5 sm:p-6" : "p-6 sm:p-8",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <LiveBadge closed={closed} />
        <span className="font-mono text-xs tabular-nums tracking-wide text-subtle">
          {poll.resultsVisible ? formatVoteCount(poll.totalVotes) : "Vote to see tally"}
        </span>
      </div>

      <h2
        className={cn(
          "mt-4 font-display font-medium tracking-tight text-fg",
          compact ? "text-2xl leading-snug" : "text-3xl leading-snug",
        )}
      >
        {poll.question}
      </h2>

      <div className="mt-6 grid gap-2.5">
        {canVote
          ? poll.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={voting}
                onClick={() => onVote?.(opt.id)}
                className="min-h-12 rounded-xl border border-border bg-bg-subtle px-4 py-3.5 text-left text-sm font-medium transition-[background-color,border-color,transform] duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border-strong hover:bg-fg/8 active:scale-[0.99] disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))
          : poll.options.map((opt) => (
              <ResultBar
                key={opt.id}
                label={opt.label}
                pct={opt.pct}
                votes={opt.votes}
                selected={poll.votedOptionId === opt.id}
                visible={poll.resultsVisible}
              />
            ))}
      </div>

      {!canVote && !poll.resultsVisible ? (
        <p className="mt-4 text-sm text-muted">Results stay hidden until you vote.</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-border bg-bg-elevated">
            <span className="shrink-0 pl-3.5 font-mono text-sm text-subtle">/p/</span>
            <Input
              ref={shareInputRef}
              readOnly={!canEditSlug}
              value={draftSlug}
              maxLength={SLUG_MAX}
              aria-label={canEditSlug ? "Edit share code" : "Share code"}
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setDraftSlug(sanitizeSlugInput(e.target.value))}
              onFocus={(e) => {
                if (!canEditSlug) e.currentTarget.select();
              }}
              onClick={(e) => {
                if (!canEditSlug) e.currentTarget.select();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && slugDirty) {
                  e.preventDefault();
                  onRenameSlug?.(draftSlug);
                }
              }}
              className="min-w-0 flex-1 rounded-none border-0 bg-transparent font-mono text-sm tracking-wide uppercase focus-visible:ring-0"
            />
          </div>
          {slugDirty ? (
            <Button type="button" onClick={() => onRenameSlug?.(draftSlug)}>
              Save
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={copyLink}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowQr((open) => !open)}
          >
            <QrCode />
            {showQr ? "Hide QR" : "Show QR"}
          </Button>
          {canEditSlug ? (
            <span className="text-xs text-subtle">
              {slugDirty ? "Save to update the link." : "You can edit the code."}
            </span>
          ) : null}
          {isOwner && !closed && onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close poll
            </Button>
          ) : null}
          {isOwner && closed && onReopen ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReopen}>
              Reopen
            </Button>
          ) : null}
        </div>
        {showQr ? (
          <div className="rounded-xl border border-border bg-bg-subtle p-4">
            <div className={cn("mx-auto", compact ? "w-40" : "w-52")}>
              <div className="overflow-hidden rounded-lg bg-fg p-2">
                <QrMark
                  value={pollShareUrl(poll.slug)}
                  label={`QR code for poll ${poll.slug}`}
                />
              </div>
            </div>
            <p className="mt-3 text-center font-mono text-sm tracking-widest text-fg">
              {poll.slug}
            </p>
            <p className="mt-1 text-center text-xs text-subtle">Scan to open and vote</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PollSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6 sm:p-8">
      <div className="h-3 w-16 animate-pulse rounded bg-fg/8" />
      <div className="mt-5 h-8 w-4/5 animate-pulse rounded bg-fg/8" />
      <div className="mt-6 grid gap-2.5">
        <div className="h-12 animate-pulse rounded-xl bg-fg/6" />
        <div className="h-12 animate-pulse rounded-xl bg-fg/6" />
        <div className="h-12 animate-pulse rounded-xl bg-fg/6" />
      </div>
    </div>
  );
}
