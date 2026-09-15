import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PollLive, PollSkeleton } from "@/components/poll-live";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { api, mergeLivePoll } from "@/lib/api";
import { usePollStream } from "@/lib/use-poll-stream";
import { cacheVote, getVoterToken } from "@/lib/voter";

export default function PollPage() {
  const { slug = "" } = useParams();
  const normalized = slug.trim().toUpperCase();
  const navigate = useNavigate();
  const { poll, setPoll, loading, notFound } = usePollStream(normalized);
  const [voting, setVoting] = useState(false);
  const isOwner = poll?.isOwner === true;

  async function onVote(optionId: string) {
    setVoting(true);
    try {
      const result = await api.vote(normalized, optionId, getVoterToken());
      if (result.poll) {
        if (result.poll.votedOptionId) cacheVote(normalized, result.poll.votedOptionId);
        setPoll((prev) => mergeLivePoll(prev, result.poll!, { takeVote: true }));
      }
      if (!result.ok) {
        if (result.code === "duplicate") toast.message("You already voted here.");
        if (result.code === "closed") toast.message("This poll is closed.");
        if (result.code === "not_found") toast.error("Poll not found.");
        if (result.code === "invalid") toast.error("That option is not on this poll.");
      }
    } catch {
      toast.error("Could not record that vote.");
    } finally {
      setVoting(false);
    }
  }

  async function onClose() {
    try {
      const next = await api.close(normalized);
      setPoll((prev) => mergeLivePoll(prev, next));
      toast.success("Poll closed");
    } catch {
      toast.error("Could not close this poll.");
    }
  }

  async function onReopen() {
    try {
      const next = await api.reopen(normalized);
      setPoll((prev) => mergeLivePoll(prev, next));
      toast.success("Poll reopened");
    } catch {
      toast.error("Could not reopen this poll.");
    }
  }

  async function onRenameSlug(nextSlug: string) {
    try {
      const next = await api.rename(normalized, nextSlug);
      setPoll((prev) => mergeLivePoll(prev, next));
      toast.success("Link updated");
      void navigate(`/p/${next.slug}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the link.");
    }
  }

  return (
    <AppShell>
      {loading ? (
        <PollSkeleton />
      ) : notFound || !poll ? (
        <div className="rounded-2xl border border-border bg-bg-elevated px-6 py-16 text-center">
          <p className="font-display text-3xl">No poll with that code.</p>
          <p className="mt-2 text-sm text-muted">Check the code and try again.</p>
          <Button asChild className="mt-6">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      ) : (
        <PollLive
          poll={poll}
          isOwner={isOwner}
          onVote={onVote}
          voting={voting}
          onClose={onClose}
          onReopen={onReopen}
          onRenameSlug={onRenameSlug}
        />
      )}
    </AppShell>
  );
}
