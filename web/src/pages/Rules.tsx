import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Rule, type RuleAction } from "../api";
import { Icon } from "../components/icons";
import { useToast } from "../components/Toast";
import { EmptyState, PageHeader, Panel, Segmented, StatTile, Tag } from "../components/ui";
import { usePolling } from "../hooks/usePolling";
import { copyText } from "../lib/clipboard";
import {
  formatCount,
  formatDateTime,
  formatRelative,
  isValidDomain,
  normalizeDomain,
} from "../lib/format";
import { readConfirmDelete, readRefreshMs } from "../lib/prefs";

type Filter = "all" | "block" | "allow";

export function Rules() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [domain, setDomain] = useState("");
  const [action, setAction] = useState<RuleAction>("block");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState<string | null>(null);

  const domainRef = useRef<HTMLInputElement>(null);
  const confirmTimer = useRef<number | null>(null);

  const { data, error, loading, refreshing, refresh } = usePolling(api.listRules, readRefreshMs());
  const rules: Rule[] = data ?? [];

  useEffect(() => {
    if (params.get("new") === "1") domainRef.current?.focus();
  }, [params]);

  useEffect(() => {
    return () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    };
  }, []);

  const counts = useMemo(
    () => ({
      block: rules.filter((rule) => rule.action === "block").length,
      allow: rules.filter((rule) => rule.action === "allow").length,
    }),
    [rules],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rules.filter((rule) => {
      if (filter !== "all" && rule.action !== filter) return false;
      return needle === "" || rule.domain.includes(needle);
    });
  }, [rules, search, filter]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const normalized = normalizeDomain(domain);
    if (!normalized) {
      setFormError("Enter the domain you want to match.");
      return;
    }
    if (!isValidDomain(normalized)) {
      setFormError("That is not a valid domain. Use a name like ads.example.com.");
      return;
    }

    setSaving(true);
    try {
      await api.addRule(normalized, action);
      toast.push(`${normalized} will be ${action === "block" ? "blocked" : "allowed"}`);
      setDomain("");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the rule.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule: Rule) => {
    if (readConfirmDelete() && confirming !== rule.domain) {
      setConfirming(rule.domain);
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirming(null), 4000);
      return;
    }

    try {
      await api.deleteRule(rule.domain);
      setConfirming(null);
      toast.push(`Rule removed for ${rule.domain}`, "info");
      await refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Could not remove the rule.", "error");
    }
  };

  const copyDomain = async (value: string) => {
    const ok = await copyText(value);
    if (ok) toast.push("Domain copied");
    else toast.push("Could not copy the domain", "error");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="rules"
        title="Manual rules"
        description="Rules are stored in rules.db, applied to DNS immediately, and survive blocklist reloads."
        actions={
          <button type="button" className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="banner">
          <Icon name="alert" size={14} />
          <div>
            <strong>{data ? "Showing the last successful read." : "Rules unavailable."}</strong> {error}
          </div>
        </div>
      ) : null}

      <div className="tiles tiles-3">
        <StatTile label="Total rules" value={formatCount(rules.length)} foot="stored in rules.db" />
        <StatTile label="Blocked" value={formatCount(counts.block)} foot="refused before the feed" />
        <StatTile label="Allowed" value={formatCount(counts.allow)} foot="overrides downloaded feeds" />
      </div>

      <Panel
        title="add a rule"
        note="Block rules match the domain and every subdomain. An allow rule wins over any downloaded blocklist entry."
      >
        <form className="rule-form" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="rule-domain">
              Domain
            </label>
            <input
              id="rule-domain"
              ref={domainRef}
              className={`input mono${formError ? " invalid" : ""}`}
              placeholder="ads.example.com"
              autoComplete="off"
              spellCheck={false}
              value={domain}
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? "rule-domain-error" : "rule-domain-hint"}
              onChange={(event) => {
                setDomain(event.target.value);
                if (formError) setFormError(null);
              }}
            />
            {formError ? (
              <span className="field-error" id="rule-domain-error" role="alert">
                {formError}
              </span>
            ) : (
              <span className="field-hint" id="rule-domain-hint">
                Trailing dots and uppercase are normalised.
              </span>
            )}
          </div>

          <div className="field">
            <span className="field-label">Action</span>
            <Segmented<RuleAction>
              label="Rule action"
              value={action}
              onChange={setAction}
              options={[
                { label: "Block", value: "block" },
                { label: "Allow", value: "allow" },
              ]}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Icon name="plus" size={13} />
            {saving ? "Saving" : "Add rule"}
          </button>
        </form>
      </Panel>

      <Panel title="active rules" flush note={`${formatCount(visible.length)} shown · ${formatCount(rules.length)} total`}>
        <div className="toolbar">
          <div className="input-wrap" style={{ flex: "1 1 240px", maxWidth: 340 }}>
            <Icon name="search" size={13} />
            <input
              className="input mono"
              style={{ width: "100%" }}
              placeholder="Filter rules"
              aria-label="Filter rules by domain"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Segmented<Filter>
            label="Filter rules by action"
            value={filter}
            onChange={setFilter}
            options={[
              { label: "all", value: "all" },
              { label: "block", value: "block" },
              { label: "allow", value: "allow" },
            ]}
          />
          <span className="spacer" />
          <span className="toolbar-meta">
            {readConfirmDelete() ? "delete asks for confirmation" : "single-click delete"}
          </span>
        </div>

        {loading && !data ? (
          <EmptyState title="Loading rules" text="Reading rules from the resolver." />
        ) : visible.length === 0 ? (
          <EmptyState
            title={rules.length === 0 ? "No manual rules yet" : "No rules match"}
            text={
              rules.length === 0
                ? "Add a domain above to override the downloaded blocklists for that name. Changes take effect on the next lookup."
                : "Adjust the search or action filter to see the rest of your rules."
            }
            actions={
              rules.length === 0 ? (
                <button type="button" className="btn btn-sm" onClick={() => domainRef.current?.focus()}>
                  Add your first rule
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Manual DNS rules</caption>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Action</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Manage</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((rule) => (
                  <tr key={rule.domain}>
                    <td className="domain-cell" title={rule.domain}>
                      {rule.domain}
                    </td>
                    <td>
                      {rule.action === "block" ? <Tag tone="blocked">block</Tag> : <Tag tone="allowed">allow</Tag>}
                    </td>
                    <td className="time-cell" title={formatDateTime(rule.created_at)}>
                      {formatRelative(rule.created_at)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => void copyDomain(rule.domain)}
                          aria-label={`Copy ${rule.domain}`}
                          title="Copy domain"
                        >
                          <Icon name="copy" size={12} />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${confirming === rule.domain ? "btn-danger" : ""}`.trim()}
                          onClick={() => void remove(rule)}
                          onBlur={() => setConfirming(null)}
                          aria-label={
                            confirming === rule.domain
                              ? `Confirm deletion of the rule for ${rule.domain}`
                              : `Delete the rule for ${rule.domain}`
                          }
                        >
                          <Icon name="trash" size={12} />
                          {confirming === rule.domain ? "Confirm" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
