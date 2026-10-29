export type QueryEntry = {
  domain: string;
  blocked: boolean;
  timestamp: string;
};

export type DomainCount = {
  domain: string;
  count: number;
};

export type Stats = {
  total_queries: number;
  total_blocked: number;
  top_domains: DomainCount[] | null;
  rules_count: number;
};

export type RuleAction = "block" | "allow";

export type Rule = {
  domain: string;
  action: RuleAction;
  created_at: string;
};

export type SystemInfo = {
  status: string;
  uptime_seconds: number;
  blocklist_size: number;
  rules_count: number;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Everything goes through the same origin the dashboard is served from.
// The server attaches the API key itself, so no secret ever lives here.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/dashboard/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export const api = {
  log: () => request<QueryEntry[]>("/log"),

  stats: () => request<Stats>("/stats"),

  system: () => request<SystemInfo>("/system"),

  listRules: () => request<Rule[]>("/rules"),

  addRule: (domain: string, action: RuleAction) =>
    request<{ status: string; domain: string; action: RuleAction; rule: Rule }>("/rules", {
      method: "POST",
      body: JSON.stringify({ domain, action }),
    }),

  deleteRule: (domain: string) =>
    request<{ status: string; domain: string }>(`/rules/${encodeURIComponent(domain)}`, {
      method: "DELETE",
    }),
};
