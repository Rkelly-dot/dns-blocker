import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type QueryEntry, type RuleAction } from "../api";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import { EmptyState, PageHeader, Panel, Segmented, Tag } from "../components/ui";
import { usePolling } from "../hooks/usePolling";
import { copyText } from "../lib/clipboard";
import { formatCount, formatDateTime, toCsv } from "../lib/format";
import { readRefreshMs } from "../lib/prefs";

type StatusFilter = "all" | "blocked" | "allowed";
type SortKey = "timestamp" | "domain";

const PAGE_SIZE = 25;

function parseStatus(value: string | null): StatusFilter {
  return value === "blocked" || value === "allowed" ? value : "all";
}

export function Queries() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("domain") ?? "");
  const [status, setStatus] = useState<StatusFilter>(parseStatus(params.get("status")));
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "timestamp", dir: "desc" });
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const interval = useMemo(() => (live ? readRefreshMs() : null), [live]);
  const { data, error, loading, refreshing, refresh } = usePolling(api.log, interval);
  const entries: QueryEntry[] = data ?? [];

  // Keep the URL shareable when filters change, and pick up links from
  // the overview page when they change.
  const domainParam = params.get("domain") ?? "";
  useEffect(() => {
    setSearch(domainParam);
  }, [domainParam]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (search) next.set("domain", search);
    else next.delete("domain");
    if (status === "all") next.delete("status");
    else next.set("status", status);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // params intentionally excluded: it is the value being written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, setParams]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (status === "blocked" && !entry.blocked) return false;
      if (status === "allowed" && entry.blocked) return false;
      return needle === "" || entry.domain.toLowerCase().includes(needle);
    });

    const direction = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.key === "domain") return a.domain.localeCompare(b.domain) * direction;
      return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * direction;
    });
  }, [entries, search, status, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, rows.length);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "timestamp" ? "desc" : "asc" },
    );
  };

  const setFilter = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  const applyRule = async (domain: string, action: RuleAction) => {
    setBusy(domain);
    try {
      await api.addRule(domain, action);
      toast.push(`${domain} is now ${action === "block" ? "blocked" : "allowed"}`);
      await refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not save that rule", "error");
    } finally {
      setBusy(null);
    }
  };

  const copyDomain = async (domain: string) => {
    const ok = await copyText(domain);
    if (ok) toast.push("Domain copied");
    else toast.push("Could not copy the domain", "error");
  };

  const exportCsv = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `nullify-queries-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.push(`Exported ${formatCount(rows.length)} ${rows.length === 1 ? "query" : "queries"}`, "info");
  };

  const filtersActive = search.trim() !== "" || status !== "all";

  return (
    <div className="page">
      <PageHeader
        eyebrow="queries"
        title="Query log"
        description="Search the buffered DNS traffic, spot a noisy domain, and block or allow it without leaving the table."
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={() => setLive((value) => !value)}>
              <Icon name={live ? "pause" : "play"} size={13} />
              {live ? "Pause" : "Resume"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
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
            <strong>{data ? "Showing the last successful read." : "Query log unavailable."}</strong> {error}
          </div>
        </div>
      ) : null}

      <Panel title="buffered traffic" flush>
        <div className="toolbar">
          <div className="input-wrap" style={{ flex: "1 1 260px", maxWidth: 360 }}>
            <Icon name="search" size={13} />
            <input
              className="input mono"
              style={{ width: "100%" }}
              placeholder="Filter by domain"
              aria-label="Filter queries by domain"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearch("");
                  setPage(1);
                }
              }}
            />
          </div>

          <Segmented<StatusFilter>
            label="Filter by status"
            value={status}
            onChange={setFilter}
            options={[
              { label: "all", value: "all" },
              { label: "blocked", value: "blocked" },
              { label: "allowed", value: "allowed" },
            ]}
          />

          <span className="spacer" />
          <span className="toolbar-meta">
            {filtersActive ? `${formatCount(rows.length)} matching` : `${formatCount(rows.length)} in buffer`}
          </span>
          <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Icon name="download" size={13} />
            Export CSV
          </button>
        </div>

        {loading && !data ? (
          <EmptyState title="Reading the query log" text="Waiting for the resolver API to return the buffer." />
        ) : visible.length === 0 ? (
          <EmptyState
            title={filtersActive ? "No queries match" : "No queries captured yet"}
            text={
              filtersActive
                ? "Try a different domain fragment or clear the status filter."
                : "New lookups will appear here as soon as a client starts using this resolver."
            }
            actions={
              filtersActive ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Buffered DNS queries</caption>
                <thead>
                  <tr>
                    <th className="sortable" aria-sort={sort.key === "timestamp" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" onClick={() => toggleSort("timestamp")}>
                        Time
                        {sort.key === "timestamp" ? (
                          <span className="sort-arrow">{sort.dir === "asc" ? "↑" : "↓"}</span>
                        ) : null}
                      </button>
                    </th>
                    <th className="sortable" aria-sort={sort.key === "domain" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" onClick={() => toggleSort("domain")}>
                        Domain
                        {sort.key === "domain" ? (
                          <span className="sort-arrow">{sort.dir === "asc" ? "↑" : "↓"}</span>
                        ) : null}
                      </button>
                    </th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry, index) => (
                    <tr key={`${entry.timestamp}-${entry.domain}-${index}`}>
                      <td className="time-cell" title={new Date(entry.timestamp).toString()}>
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="domain-cell" title={entry.domain}>
                        {entry.domain}
                      </td>
                      <td>{entry.blocked ? <Tag tone="blocked">blocked</Tag> : <Tag tone="allowed">allowed</Tag>}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => void copyDomain(entry.domain)}
                            aria-label={`Copy ${entry.domain}`}
                            title="Copy domain"
                          >
                            <Icon name="copy" size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy === entry.domain}
                            onClick={() => void applyRule(entry.domain, "block")}
                          >
                            Block
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy === entry.domain}
                            onClick={() => void applyRule(entry.domain, "allow")}
                          >
                            Allow
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                {formatCount(firstShown)}–{formatCount(lastShown)} of {formatCount(rows.length)}
              </span>
              <span className="spacer" />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <Icon name="chevron-left" size={14} />
              </button>
              <span>
                page {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage === pageCount}
                aria-label="Next page"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </>
        )}
      </Panel>

      <div className="panel-note" style={{ border: "0", padding: 1 }}>
        Row actions create a persistent rule and apply it immediately. {/* keep operators oriented */}
        Queries are held in memory only — restarting the resolver clears this buffer.
      </div>
    </div>
  );
}
