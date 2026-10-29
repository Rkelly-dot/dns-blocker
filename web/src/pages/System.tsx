import { useMemo, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import { PageHeader, Panel, Tag } from "../components/ui";
import { usePolling } from "../hooks/usePolling";
import { copyText } from "../lib/clipboard";
import { formatCount, formatDuration, formatRelative } from "../lib/format";
import {
  readConfirmDelete,
  readRefreshMs,
  REFRESH_OPTIONS,
  writeConfirmDelete,
  writeRefreshSeconds,
} from "../lib/prefs";

const ENDPOINTS = [
  { method: "GET", path: "/api/log", description: "Buffered queries" },
  { method: "GET", path: "/api/stats", description: "Counts and top domains" },
  { method: "GET", path: "/api/rules", description: "List manual rules" },
  { method: "POST", path: "/api/rules", description: "Create or update a rule" },
  { method: "DELETE", path: "/api/rules/{domain}", description: "Remove a rule" },
  { method: "GET", path: "/api/system", description: "Runtime status" },
];

export function System() {
  const toast = useToast();
  const [refreshSeconds, setRefreshSeconds] = useState(() => {
    const ms = readRefreshMs();
    return ms === null ? 0 : Math.round(ms / 1000);
  });
  const [confirmDelete, setConfirmDelete] = useState(readConfirmDelete);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ms: number; at: Date } | null>(null);

  const interval = useMemo(() => (refreshSeconds === 0 ? null : refreshSeconds * 1000), [refreshSeconds]);

  const { data, error, refreshing, refresh } = usePolling(async () => {
    const [system, stats] = await Promise.all([api.system(), api.stats()]);
    return { system, stats };
  }, interval);

  const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const dnsAddress = `${host}:53`;
  const dohAddress = `https://${host}/dns-query`;
  const online = data != null && !error;

  const copy = async (value: string, label: string) => {
    const ok = await copyText(value);
    toast.push(ok ? `${label} copied` : `Could not copy the ${label.toLowerCase()}`, ok ? "ok" : "error");
  };

  const runCheck = async () => {
    setChecking(true);
    const started = performance.now();
    try {
      await api.system();
      const ms = Math.round(performance.now() - started);
      setCheck({ ms, at: new Date() });
      toast.push(`Resolver API answered in ${ms} ms`);
      await refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Diagnostic failed", "error");
    } finally {
      setChecking(false);
    }
  };

  const saveRefresh = (seconds: number) => {
    setRefreshSeconds(seconds);
    writeRefreshSeconds(seconds);
    toast.push(seconds === 0 ? "Auto-refresh disabled" : `Refreshing every ${seconds}s`, "info");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="system"
        title="System & access"
        description="Runtime facts, client connection details, and how the API is protected."
        actions={
          <>
            {online ? <Tag tone="allowed">online</Tag> : <Tag tone="blocked">unreachable</Tag>}
            <button type="button" className="btn btn-sm" onClick={() => void runCheck()} disabled={checking}>
              <Icon name="refresh" size={13} />
              {checking ? "Checking" : "Run check"}
            </button>
          </>
        }
      />

      {error ? (
        <div className="banner">
          <Icon name="alert" size={14} />
          <div>
            <strong>System status is stale.</strong> {error}
          </div>
        </div>
      ) : null}

      <div className="grid grid-1-1">
        <Panel
          title="resolver"
          note={
            check
              ? `Last diagnostic: ${check.ms} ms round trip at ${formatRelative(check.at)}.`
              : "Run a check to measure how quickly the API responds."
          }
        >
          <div className="kv">
            <div className="kv-row">
              <span className="kv-key">Status</span>
              <span className="kv-value">
                {online ? <span className="status-line"><span className="dot live" /> answering</span> : "no response"}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Uptime</span>
              <span className="kv-value">{data ? formatDuration(data.system.uptime_seconds) : "--"}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Blocked domains</span>
              <span className="kv-value">{data ? formatCount(data.system.blocklist_size) : "--"}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Manual rules</span>
              <span className="kv-value">{data ? formatCount(data.system.rules_count) : "--"}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Buffered queries</span>
              <span className="kv-value">
                {data ? `${formatCount(data.stats.total_queries)} / 1,000` : "--"}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Feed reload</span>
              <span className="kv-value">every 24 hours</span>
            </div>
          </div>
        </Panel>

        <Panel title="connect a device" note="Changes apply on the next lookup; no restart required.">
          <div className="stack-sm">
            <div className="field">
              <span className="field-label">DNS resolver</span>
              <div className="copy-field">
                <span>{dnsAddress}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Copy DNS resolver address"
                  title="Copy"
                  onClick={() => void copy(dnsAddress, "Resolver address")}
                >
                  <Icon name="copy" size={13} />
                </button>
              </div>
            </div>

            <div className="field">
              <span className="field-label">DNS-over-HTTPS</span>
              <div className="copy-field">
                <span>{dohAddress}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Copy DNS-over-HTTPS endpoint"
                  title="Copy"
                  onClick={() => void copy(dohAddress, "DoH endpoint")}
                >
                  <Icon name="copy" size={13} />
                </button>
              </div>
            </div>

            <p className="field-hint" style={{ margin: "2px 0 0" }}>
              Point one device at the resolver address to test it, or a whole network if this host is reachable on port 53.
              The DoH endpoint needs the resolver&apos;s certificate to be trusted by the client.
            </p>
          </div>
        </Panel>

        <Panel title="api access" note="The dashboard calls /dashboard/api on the same origin, so the key is never sent to the browser.">
          <div className="stack-sm">
            <div className="copy-field">
              <span>{origin}/api</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Copy API base URL"
                title="Copy"
                onClick={() => void copy(`${origin}/api`, "API base URL")}
              >
                <Icon name="copy" size={13} />
              </button>
            </div>

            <div className="kv">
              {ENDPOINTS.map((endpoint) => (
                <div className="kv-row" key={`${endpoint.method}-${endpoint.path}`}>
                  <span className="kv-key">
                    <span className="inline-code">{endpoint.method}</span>{" "}
                    <span className="mono" style={{ fontSize: 11.5 }}>
                      {endpoint.path}
                    </span>
                  </span>
                  <span className="kv-value">{endpoint.description}</span>
                </div>
              ))}
            </div>

            <div className="row-between" style={{ marginTop: 4 }}>
              <span className="status-line">
                <Icon name="lock" size={12} /> X-API-Key required
              </span>
              <span className="status-line">key held by the resolver process only</span>
            </div>
          </div>
        </Panel>

        <Panel title="preferences" note="Saved in this browser only. They do not change resolver behaviour.">
          <div className="stack-sm">
            <div className="row-between">
              <label className="field-label" htmlFor="refresh-interval">
                Auto-refresh interval
              </label>
              <select
                id="refresh-interval"
                className="select"
                value={refreshSeconds}
                onChange={(event) => saveRefresh(Number(event.target.value))}
              >
                {REFRESH_OPTIONS.map((option) => (
                  <option key={option.seconds} value={option.seconds}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="row-between">
              <label className="check" htmlFor="confirm-delete">
                <input
                  id="confirm-delete"
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(event) => {
                    setConfirmDelete(event.target.checked);
                    writeConfirmDelete(event.target.checked);
                  }}
                />
                Ask before deleting a rule
              </label>
              <span className="toolbar-meta">{refreshing ? "refreshing" : "idle"}</span>
            </div>

            <div className="kv" style={{ marginTop: 4 }}>
              <div className="kv-row">
                <span className="kv-key">Dashboard listener</span>
                <span className="kv-value">{origin.replace(/^https?:\/\//, "")}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Default bind</span>
                <span className="kv-value">127.0.0.1:8080</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Override with</span>
                <span className="kv-value">API_ADDR</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="notes">
        <div className="stack-sm">
          <p className="field-hint" style={{ margin: 0 }}>
            The query log is an in-memory ring buffer of the last 1,000 events. Rules are the only data written to disk.
          </p>
          <p className="field-hint" style={{ margin: 0 }}>
            Blocklists are downloaded from StevenBlack and OISD at startup and refreshed every 24 hours. Manual rules are
            kept separately, so a refresh never drops them.
          </p>
        </div>
      </Panel>
    </div>
  );
}
