import { useEffect, useState } from "react";
import { api, mergeLivePoll, type PollView } from "@/lib/api";
import { getVoterToken, useVoterToken } from "@/lib/voter";

export function usePollStream(slug: string) {
  const voterToken = useVoterToken();
  const [poll, setPoll] = useState<PollView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const normalized = slug.trim().toUpperCase();
    if (!normalized) return;

    let cancelled = false;
    let es: EventSource | null = null;
    const token = voterToken || getVoterToken();

    setLoading(true);
    setNotFound(false);

    api
      .getPoll(normalized, token)
      .then((view) => {
        if (cancelled) return;
        if (!view) {
          setPoll(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        setPoll(view);
        setLoading(false);
        es = new EventSource(api.streamUrl(normalized, token));
        if (cancelled) {
          es.close();
          return;
        }
        es.onmessage = (ev) => {
          try {
            const next = JSON.parse(ev.data) as PollView;
            setPoll((prev) => mergeLivePoll(prev, next));
          } catch {
            /* ignore malformed frames */
          }
        };
      })
      .catch(() => {
        if (cancelled) return;
        setPoll(null);
        setNotFound(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [slug, voterToken]);

  return { poll, setPoll, loading, notFound, voterToken };
}
