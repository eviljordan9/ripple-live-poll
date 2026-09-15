import { formatDistanceToNow } from "date-fns";
import { Copy, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { copyToClipboard, pollShareUrl } from "@/lib/clipboard";
import { api, formatVoteCount, type PollSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Studio() {
  const { user, loading } = useAuth();
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setListLoading(true);
    api
      .listMine()
      .then((rows) => {
        if (!cancelled) setPolls(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load polls.");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <AppShell wide>
        <div className="h-8 w-32 animate-pulse rounded bg-fg/8" />
        <div className="mt-8 grid gap-3">
          <div className="h-24 animate-pulse rounded-2xl bg-fg/6" />
          <div className="h-24 animate-pulse rounded-2xl bg-fg/6" />
        </div>
      </AppShell>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  async function onDelete(slug: string) {
    try {
      await api.delete(slug);
      setConfirmSlug(null);
      setPolls((prev) => prev.filter((p) => p.slug !== slug));
      toast.success("Poll deleted");
    } catch {
      toast.error("Could not delete that poll.");
    }
  }

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted">
            Studio
          </p>
          <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">
            Your polls
          </h1>
        </div>
        <Button asChild>
          <Link to="/new">
            <Plus />
            New poll
          </Link>
        </Button>
      </div>

      {listLoading ? (
        <div className="mt-8 grid gap-3">
          <div className="h-24 animate-pulse rounded-2xl bg-fg/6" />
          <div className="h-24 animate-pulse rounded-2xl bg-fg/6" />
        </div>
      ) : polls.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <p className="font-display text-2xl">Nothing live yet.</p>
          <p className="mt-2 text-sm text-muted">Open a poll and send the code to the room.</p>
          <Button asChild className="mt-6">
            <Link to="/new">Create a poll</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {polls.map((poll) => (
            <li
              key={poll.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-bg-elevated p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link to={`/p/${poll.slug}`} className="min-w-0 flex-1">
                <p className="truncate font-display text-xl font-medium">{poll.question}</p>
                <p className="mt-1 text-sm text-muted">
                  <span className="font-mono tracking-[0.14em]">{poll.slug}</span>
                  <span className="mx-2 text-subtle">·</span>
                  {poll.status === "open" ? "Live" : "Closed"}
                  <span className="mx-2 text-subtle">·</span>
                  {formatVoteCount(poll.totalVotes)}
                  <span className="mx-2 text-subtle">·</span>
                  {formatDistanceToNow(new Date(poll.createdAt), { addSuffix: true })}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const url = pollShareUrl(poll.slug);
                    const ok = await copyToClipboard(url);
                    if (ok) toast.success("Link copied");
                    else toast.message("Copy failed — open the poll and select the link.");
                  }}
                >
                  <Copy />
                  Copy
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/p/${poll.slug}`}>Open</Link>
                </Button>
                {confirmSlug === poll.slug ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-live"
                    onClick={() => void onDelete(poll.slug)}
                  >
                    Confirm delete
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmSlug(poll.slug)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
