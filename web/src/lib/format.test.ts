import { describe, expect, it } from "vitest";
import {
  bucketQueries,
  formatDuration,
  formatPercent,
  formatRelative,
  isValidDomain,
  normalizeDomain,
  toCsv,
} from "./format";

describe("domain validation", () => {
  it("accepts names with a suffix", () => {
    expect(isValidDomain("ads.example.com")).toBe(true);
    expect(isValidDomain("a-b.example.co.uk")).toBe(true);
  });

  it("rejects spaces, scheme prefixes, and bare labels", () => {
    expect(isValidDomain("ads example.com")).toBe(false);
    expect(isValidDomain("https://example.com")).toBe(false);
    expect(isValidDomain("localhost")).toBe(false);
    expect(isValidDomain("-ads.example.com")).toBe(false);
  });

  it("normalises case and a trailing dot", () => {
    expect(normalizeDomain("  Ads.Example.COM. ")).toBe("ads.example.com");
  });
});

describe("formatting", () => {
  it("formats relative time against a fixed clock", () => {
    const now = new Date("2026-10-29T12:00:00Z").getTime();
    expect(formatRelative("2026-10-29T11:59:58Z", now)).toBe("just now");
    expect(formatRelative("2026-10-29T11:59:12Z", now)).toBe("48s ago");
    expect(formatRelative("2026-10-29T11:20:00Z", now)).toBe("40m ago");
    expect(formatRelative("2026-10-29T08:00:00Z", now)).toBe("4h ago");
  });

  it("formats durations and percentages", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(3 * 3600 + 12 * 60)).toBe("3h 12m");
    expect(formatPercent(1, 4)).toBe("25.0%");
    expect(formatPercent(0, 0)).toBe("0%");
  });

  it("escapes csv fields that contain separators", () => {
    const csv = toCsv([{ timestamp: "2026-10-29T12:00:00Z", domain: 'weird,domain"x.com', blocked: true }]);
    expect(csv.split("\n")[0]).toBe("timestamp,domain,status");
    expect(csv).toContain('"weird,domain""x.com",blocked');
  });
});

describe("bucketQueries", () => {
  it("counts events into the right bucket and ignores stale ones", () => {
    const now = new Date("2026-10-29T12:00:00Z").getTime();
    const minute = 60 * 1000;
    const buckets = bucketQueries(
      [
        { timestamp: new Date(now - 30 * 1000).toISOString(), blocked: true },
        { timestamp: new Date(now - 45 * 1000).toISOString(), blocked: false },
        { timestamp: new Date(now - 90 * 1000).toISOString(), blocked: false },
        { timestamp: new Date(now - 60 * minute).toISOString(), blocked: true }, // outside window
      ],
      2 * minute,
      4,
      now,
    );

    expect(buckets).toHaveLength(4);
    expect(buckets.reduce((sum, bucket) => sum + bucket.blocked, 0)).toBe(1);
    expect(buckets.reduce((sum, bucket) => sum + bucket.allowed, 0)).toBe(2);
    expect(buckets[3].blocked).toBe(1);
    expect(buckets[3].allowed).toBe(0);
    expect(buckets[2].allowed).toBe(1);
    expect(buckets[1].allowed).toBe(1);
  });
});
