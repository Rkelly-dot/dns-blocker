const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Mirrors the server-side validation so bad input fails before a request. */
export function isValidDomain(domain: string): boolean {
  return domain.length <= 253 && DOMAIN_PATTERN.test(domain);
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(part: number, total: number, digits = 1): string {
  if (total <= 0) return "0%";
  return `${((part / total) * 100).toFixed(digits)}%`;
}

/** 14:03:27 — always 24h so columns line up. */
export function formatClock(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function formatDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "unknown";
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${day} ${formatClock(date)}`;
}

export function formatRelative(iso: string | Date, now: number = Date.now()): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (Number.isNaN(seconds)) return "unknown";
  if (seconds < 3) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--";
  const seconds = Math.floor(totalSeconds);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export type Bucket = {
  start: number;
  end: number;
  allowed: number;
  blocked: number;
};

/**
 * Buckets query timestamps for the activity chart. Entries older than the
 * window are ignored; an "all" window is derived from the oldest entry.
 */
export function bucketQueries(
  entries: { timestamp: string; blocked: boolean }[],
  windowMs: number | null,
  bucketCount: number,
  now: number = Date.now(),
): Bucket[] {
  let start: number;
  if (windowMs !== null) {
    start = now - windowMs;
  } else if (entries.length > 0) {
    start = Math.min(...entries.map((entry) => new Date(entry.timestamp).getTime()));
  } else {
    start = now - 60 * 60 * 1000;
  }

  const end = now;
  const span = Math.max(end - start, 1);
  const width = span / bucketCount;

  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    start: start + i * width,
    end: start + (i + 1) * width,
    allowed: 0,
    blocked: 0,
  }));

  for (const entry of entries) {
    const time = new Date(entry.timestamp).getTime();
    if (Number.isNaN(time) || time < start || time > end) continue;
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((time - start) / width)));
    if (entry.blocked) buckets[index].blocked += 1;
    else buckets[index].allowed += 1;
  }

  return buckets;
}

/** Short label for a chart bucket boundary, e.g. 09:42. */
export function formatBucketTime(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(entries: { timestamp: string; domain: string; blocked: boolean }[]): string {
  const header = "timestamp,domain,status";
  const rows = entries.map((entry) =>
    [new Date(entry.timestamp).toISOString(), entry.domain, entry.blocked ? "blocked" : "allowed"]
      .map((cell) => csvEscape(String(cell)))
      .join(","),
  );
  return [header, ...rows].join("\n");
}
