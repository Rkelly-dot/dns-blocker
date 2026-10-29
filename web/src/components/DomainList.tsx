import type { DomainCount } from "../api";
import { formatCount } from "../lib/format";

export function DomainList({
  domains,
  onSelect,
}: {
  domains: DomainCount[];
  onSelect?: (domain: string) => void;
}) {
  const max = Math.max(1, ...domains.map((domain) => domain.count));

  return (
    <div className="domain-list">
      {domains.map((item) => (
        <button
          key={item.domain}
          type="button"
          className="domain-row"
          onClick={() => onSelect?.(item.domain)}
          title={onSelect ? `Filter queries for ${item.domain}` : item.domain}
        >
          <span className="domain-main">
            <span className="domain-name">{item.domain}</span>
            <span className="domain-bar" style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }} />
          </span>
          <span className="domain-count">{formatCount(item.count)}</span>
        </button>
      ))}
    </div>
  );
}
