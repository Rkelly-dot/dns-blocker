import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type QueryEntry, type Stats } from "../api";
import { ActivityChart } from "../components/ActivityChart";
import { Icon } from "../components/icons";
import { LiveTail } from "../components/LiveTail";
import { DomainList } from "../components/DomainList";
import { useToast } from "../components/Toast";
import { EmptyState, PageHeader, Panel, Segmented, StatTile } from "../components/ui";
import { useNow, usePolling } from "../hooks/usePolling";
import { copyText } from "../lib/clipboard";
import { formatCount, formatPercent, formatRelative } from "../lib/format";
import { readRefreshMs } from "../lib/prefs";

type Range = "15" | "60" | "all";

const WINDOWS: Record<Range, number | null> = {
  "15": 15 * 60 * 1000,
  "60": 60 * 60 * 1000,
  all: null,
};

export function Overview() {
  const navigate = useNavigate();
  const toast = useToast();
  const [range, setRange] = useState<Range>("15");
  const [live, setLive] = useState(true);
  const interval = useMemo(() => (live ? readRefreshMs() : null), [live]);

  const { data, error, loading, refreshing, updatedAt, refresh } = usePolling(async () => {
    const [stats, log] = await Promise.all([api.stats(), api.log()]);
    return { stats, log };
  }, interval);

  const now = useNow(1000);
  const stats: Stats | undefined = data?.stats;
  const entries: QueryEntry[] = data?.log ?? [];
  const topDomains = stats?.top_domains ?? [];
  const total = stats?.total_queries ?? 0;
  const blocked = stats?.total_blocked ?? 0;
  const blockRate = total > 0 ? (blocked / total) * 100 : 0;
  const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";

  const copyResolver = async () => {
    const ok = await copyText(`${host}:53`);
    toast.push(ok ? "Resolver address copied" : "Could not copy the address", ok ? "ok" : "error");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="overview"
        title="Resolver activity"
        description="The last 1,000 queries handled by this resolver, with the rules currently overriding your feeds."
        actions={
          <>
            <span className="toolbar-meta">
              {updatedAt ? `updated ${formatRelative(updatedAt, now)}` : "not updated yet"}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setLive((value) => !value)}>
              <Icon name={live ? "pause" : "play"} size={13} />
              {live ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh now"
            >
              <Icon name="refresh" size={13} />
              Refresh
            </button>
          </>
        }
      />

      {error ? (
        <div className="banner">
          <Icon name="alert" size={14} />
          <div>
            <strong>{data ? "Showing stale data." : "Could not reach the resolver API."}</strong>{" "}
            {error}
            {!data ? (
              <button type="button" className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => void refresh()}>
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && entries.length === 0 ? (
        <div className="banner">
          <Icon name="info" size={14} />
          <div>
            No DNS queries captured yet. Point a device at this resolver using <span className="inline-code">{host}:53</span>{" "}
            or the DNS-over-HTTPS endpoint.{" "}
            <button type="button" className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={copyResolver}>
              Copy address
            </button>
          </div>
        </div>
      ) : null}

      <div className="tiles">
        <StatTile
          label="Queries"
          value={formatCount(total)}
          foot={total >= 1000 ? "ring buffer is full" : "in the current buffer"}
        />
        <StatTile label="Blocked" value={formatCount(blocked)} foot="refused with NXDOMAIN" />
        <StatTile label="Block rate" value={formatPercent(blocked, total, 1).replace("%", "")} suffix="%" foot="of buffered queries" />
        <StatTile label="Manual rules" value={formatCount(stats?.rules_count ?? 0)} foot="block and allow overrides" />
      </div>

      <div className="grid grid-2-1">
        <Panel
          title="Query volume"
          actions={
            <Segmented<Range>
              label="Chart window"
              value={range}
              onChange={setRange}
              options={[
                { label: "15m", value: "15" },
                { label: "1h", value: "60" },
                { label: "all", value: "all" },
              ]}
            />
          }
          note="Buckets are derived from timestamps in the query buffer. The resolver keeps no longer history."
        >
          <ActivityChart entries={entries} windowMs={WINDOWS[range]} />
        </Panel>

        <Panel title="Block rate" note={`${formatCount(blocked)} of ${formatCount(total)} buffered queries were blocked.`}>
          <div className="big-rate">
            <span className="big-rate-value">{formatPercent(blocked, total, 1).replace("%", "")}</span>
            <span className="big-rate-unit">% blocked</span>
          </div>
          <div
            className="meter"
            style={{ marginTop: 14 }}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(blockRate)}
            aria-label="Block rate"
          >
            <div className="meter-fill" style={{ width: `${blockRate}%` }} />
          </div>
          <div className="breakdown">
            <div className="breakdown-row">
              <span className="swatch-line" style={{ background: "var(--green)" }} />
              <span className="label">Allowed</span>
              <span className="value">{formatCount(total - blocked)}</span>
            </div>
            <div className="breakdown-row">
              <span className="swatch-line" style={{ background: "var(--red)" }} />
              <span className="label">Blocked</span>
              <span className="value">{formatCount(blocked)}</span>
            </div>
            <div className="breakdown-row">
              <span className="swatch-line" style={{ background: "var(--text-3)" }} />
              <span className="label">Observed</span>
              <span className="value">{formatCount(total)}</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 14, width: "100%" }}
            onClick={() => navigate("/rules")}
          >
            Manage rules
            <Icon name="chevron-right" size={12} />
          </button>
        </Panel>
      </div>

      <div className="grid grid-1-1">
        <Panel
          title="Live tail"
          actions={<span className={`tag ${live ? "tag-allowed" : ""}`.trim()}>{live ? "streaming" : "paused"}</span>}
        >
          {entries.length > 0 ? (
            <LiveTail entries={entries} live={live} />
          ) : (
            <EmptyState
              title="Nothing to tail"
              text="Queries will stream here as soon as the resolver answers its first lookup."
            />
          )}
        </Panel>

        <Panel
          title="Top domains"
          actions={
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate("/queries")}>
              Open queries
            </button>
          }
        >
          {topDomains.length > 0 ? (
            <DomainList
              domains={topDomains}
              onSelect={(domain) => navigate(`/queries?domain=${encodeURIComponent(domain)}`)}
            />
          ) : (
            <EmptyState title="No domains yet" text="The most-queried names appear once traffic reaches the resolver." />
          )}
        </Panel>
      </div>
    </div>
  );
}
