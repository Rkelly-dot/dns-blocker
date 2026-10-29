import type { QueryEntry } from "../api";
import { formatClock } from "../lib/format";

export function LiveTail({ entries, live }: { entries: QueryEntry[]; live: boolean }) {
  const recent = [...entries].reverse().slice(0, 9);

  return (
    <div className="stream">
      <div className="stream-head">
        <span className="cmd">tail -f queries</span>
        {live ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="caret" aria-hidden="true" />
          </>
        ) : (
          <span>· paused</span>
        )}
        <span style={{ marginLeft: "auto" }}>{recent.length} shown</span>
      </div>
      {recent.map((entry, index) => (
        <div
          key={`${entry.timestamp}-${entry.domain}-${index}`}
          className={`stream-row ${entry.blocked ? "blocked" : "allowed"}${index === 0 ? " newest" : ""}`}
        >
          <span className="time">{formatClock(entry.timestamp)}</span>
          <span className="domain" title={entry.domain}>
            {entry.domain}
          </span>
          <span className="marker">{entry.blocked ? "BLOCK" : "OK"}</span>
        </div>
      ))}
    </div>
  );
}
