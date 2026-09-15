export type PollStatus = "open" | "closed";

export type PollOptionView = {
  id: string;
  label: string;
  votes: number;
  pct: number;
};

export type PollView = {
  id: string;
  slug: string;
  question: string;
  status: PollStatus;
  hideUntilVoted: boolean;
  createdAt: string;
  totalVotes: number;
  options: PollOptionView[];
  votedOptionId: string | null;
  resultsVisible: boolean;
  isOwner: boolean;
};

export type PollSummary = {
  id: string;
  slug: string;
  question: string;
  status: PollStatus;
  totalVotes: number;
  optionCount: number;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
};

export type VoteResult = {
  ok: boolean;
  code: "ok" | "closed" | "duplicate" | "not_found" | "invalid" | string;
  poll: PollView | null;
  error?: string;
};

export const POLL_TEMPLATES: { name: string; question: string; options: string[] }[] = [
  { name: "Yes / No", question: "", options: ["Yes", "No"] },
  { name: "This or that", question: "", options: ["Option A", "Option B"] },
  { name: "Team call", question: "What should we do?", options: ["Ship it", "Needs work", "Park it"] },
  { name: "Scale", question: "How are we feeling?", options: ["1", "2", "3", "4", "5"] },
];

export const DEMO_SLUG = "WELCOME";
export const SLUG_MIN = 3;
export const SLUG_MAX = 16;

export function sanitizeSlugInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, SLUG_MAX);
}

export function isValidSlug(slug: string): boolean {
  return /^[A-Z0-9]{3,16}$/.test(slug);
}

export function sharePath(slug: string): string {
  return `/p/${slug}`;
}

export function formatVoteCount(n: number): string {
  if (n === 1) return "1 vote";
  return `${n.toLocaleString()} votes`;
}

export function mergeLivePoll(
  local: PollView | null,
  incoming: PollView,
  opts: { takeVote?: boolean } = {},
): PollView {
  const votedOptionId = opts.takeVote
    ? (incoming.votedOptionId ?? local?.votedOptionId ?? null)
    : (local?.votedOptionId ?? null);
  const isOwner = Boolean(local?.isOwner || incoming.isOwner);
  const resultsVisible =
    isOwner || !incoming.hideUntilVoted || votedOptionId !== null || incoming.status === "closed";
  return {
    ...incoming,
    votedOptionId,
    isOwner,
    resultsVisible,
    totalVotes: resultsVisible ? incoming.totalVotes : 0,
    options: incoming.options.map((opt) => ({
      ...opt,
      votes: resultsVisible ? opt.votes : 0,
      pct: resultsVisible ? opt.pct : 0,
    })),
  };
}

type ErrorBody = { error?: string };

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { credentials: "include", ...init, headers });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = data as ErrorBody;
    throw new Error(typeof err.error === "string" ? err.error : "Request failed.");
  }
  return data as T;
}

export const api = {
  streamUrl(slug: string, voter = "") {
    const q = new URLSearchParams();
    if (voter) q.set("voter", voter);
    const qs = q.toString();
    return `/api/polls/${encodeURIComponent(slug)}/stream${qs ? `?${qs}` : ""}`;
  },

  async getMe(): Promise<User | null> {
    const data = await request<{ user: User | null }>("/api/auth/me");
    return data.user ?? null;
  },

  signup(name: string, email: string, password: string) {
    return request<User>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email: string, password: string) {
    return request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  async getPoll(slug: string, voterToken?: string): Promise<PollView | null> {
    const q = new URLSearchParams();
    if (voterToken) q.set("voter", voterToken);
    const qs = q.toString();
    const res = await fetch(`/api/polls/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`, {
      credentials: "include",
    });
    if (res.status === 404) return null;
    const data = await parseJson(res);
    if (!res.ok) {
      const err = data as ErrorBody;
      throw new Error(typeof err.error === "string" ? err.error : "Could not load poll.");
    }
    return data as unknown as PollView;
  },

  async vote(slug: string, optionId: string, voterToken: string): Promise<VoteResult> {
    const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/vote`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId, voterToken }),
    });
    const data = await parseJson(res);
    return {
      ok: Boolean(data.ok),
      code: typeof data.code === "string" ? data.code : res.ok ? "ok" : "error",
      poll: (data.poll as PollView | null | undefined) ?? null,
      error: typeof data.error === "string" ? data.error : undefined,
    };
  },

  createPoll(input: {
    question: string;
    options: string[];
    hideUntilVoted: boolean;
    slug?: string;
  }) {
    return request<PollView>("/api/polls", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listMine() {
    return request<PollSummary[]>("/api/polls");
  },

  close(slug: string) {
    return request<PollView>(`/api/polls/${encodeURIComponent(slug)}/close`, { method: "POST" });
  },

  reopen(slug: string) {
    return request<PollView>(`/api/polls/${encodeURIComponent(slug)}/reopen`, { method: "POST" });
  },

  rename(slug: string, nextSlug: string) {
    return request<PollView>(`/api/polls/${encodeURIComponent(slug)}/rename`, {
      method: "POST",
      body: JSON.stringify({ nextSlug }),
    });
  },

  delete(slug: string) {
    return request<{ ok: boolean }>(`/api/polls/${encodeURIComponent(slug)}`, { method: "DELETE" });
  },
};
