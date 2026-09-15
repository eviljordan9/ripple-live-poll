import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PollLive, PollSkeleton } from "@/components/poll-live";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, DEMO_SLUG, mergeLivePoll } from "@/lib/api";
import { usePollStream } from "@/lib/use-poll-stream";
import { cacheVote, getVoterToken } from "@/lib/voter";

export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [voting, setVoting] = useState(false);
  const { poll, setPoll, loading } = usePollStream(DEMO_SLUG);

  function join(e: FormEvent) {
    e.preventDefault();
    const slug = code.trim().toUpperCase();
    if (!slug) return;
    void navigate(`/p/${slug}`);
  }

  async function onVote(optionId: string) {
    setVoting(true);
    try {
      const result = await api.vote(DEMO_SLUG, optionId, getVoterToken());
      if (result.poll) {
        if (result.poll.votedOptionId) cacheVote(DEMO_SLUG, result.poll.votedOptionId);
        setPoll((prev) => mergeLivePoll(prev, result.poll!, { takeVote: true }));
      }
      if (!result.ok) {
        if (result.code === "duplicate") toast.message("You already voted here.");
        if (result.code === "closed") toast.message("This poll is closed.");
      }
    } catch {
      toast.error("Could not record that vote.");
    } finally {
      setVoting(false);
    }
  }

  return (
    <AppShell wide>
      <section className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">
          Live audience polling
        </p>
        <h1 className="mt-4 font-display text-5xl font-medium leading-none tracking-tight text-fg sm:text-6xl">
          Ask the room.
          <span className="block italic text-muted">Watch it answer.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
          Create a poll, share the link or a short code, and watch tallies
          move as people vote. No refresh. No waiting.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/new">
              Create a poll
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/studio">Your studio</Link>
          </Button>
        </div>
        <form onSubmit={join} className="mt-8 max-w-sm">
          <label htmlFor="join-code" className="text-xs font-medium uppercase tracking-widest text-subtle">
            Have a code?
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME"
              autoComplete="off"
              className="font-mono tracking-widest uppercase"
              maxLength={16}
            />
            <Button type="submit" variant="subtle">
              Join
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-12 max-w-xl">
        {loading ? (
          <PollSkeleton />
        ) : poll ? (
          <PollLive poll={poll} compact onVote={onVote} voting={voting} />
        ) : (
          <div className="rounded-2xl border border-border bg-bg-elevated p-8 text-sm text-muted">
            Demo poll is warming up. Create your own in the meantime.
          </div>
        )}
      </section>

      <section className="mt-16 grid gap-6 border-t border-border pt-12 sm:grid-cols-3">
        {[
          { step: "01", title: "Write the question", body: "Two to eight options. A short code is minted for you." },
          { step: "02", title: "Share the link", body: "Send it to the room. Anyone can vote — no account needed." },
          { step: "03", title: "Watch it live", body: "Bars move as votes land. Close it when the room is done." },
        ].map((item) => (
          <div key={item.step}>
            <p className="font-mono text-xs tracking-widest text-subtle">{item.step}</p>
            <h3 className="mt-2 font-display text-xl font-medium">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
