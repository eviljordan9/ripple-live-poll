import { useSyncExternalStore } from "react";

const TOKEN_KEY = "ripple.voter";
const VOTED_PREFIX = "ripple.voted.";

export function getVoterToken(): string {
  if (typeof window === "undefined") return "";
  try {
    let token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      window.localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    return crypto.randomUUID();
  }
}

export function useVoterToken(): string {
  return useSyncExternalStore(
    () => () => {},
    () => getVoterToken(),
    () => "",
  );
}

export function getCachedVote(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VOTED_PREFIX + slug);
  } catch {
    return null;
  }
}

export function cacheVote(slug: string, optionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOTED_PREFIX + slug, optionId);
  } catch {
    /* ignore quota */
  }
}
