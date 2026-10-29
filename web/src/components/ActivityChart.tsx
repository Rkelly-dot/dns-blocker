import { useState } from "react";
import type { QueryEntry } from "../api";
import { bucketQueries, formatBucketTime, formatCount } from "../lib/format";

const BUCKETS = 34;

export function ActivityChart({ entries, windowMs }: { entries: QueryEntry[]; windowMs: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = bucketQueries(entries, windowMs, BUCKETS);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.allowed + bucket.blocked));
  const active = hover !== null ? buckets[hover] : null;

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="legend">
          <span>
            <i className="swatch allowed" />
            allowed
          </span>
          <span>
            <i className="swatch blocked" />
            blocked
          </span>
        </div>
        <div className="chart-readout">
          {active ? (
            <>
              <b>
                {formatBucketTime(active.start)}–{formatBucketTime(active.end)}
              </b>{" "}
              · {formatCount(active.allowed + active.blocked)} queries · {formatCount(active.blocked)} blocked
            </>
          ) : (
            "hover a bar for a breakdown"
          )}
        </div>
      </div>

      <div className="chart-plot" onMouseLeave={() => setHover(null)}>
        <div className="chart-grid" style={{ top: "33%" }} />
        <div className="chart-grid" style={{ top: "66%" }} />
        <div className="chart-bars" role="img" aria-label="Query volume by time bucket">
          {buckets.map((bucket, index) => {
            const total = bucket.allowed + bucket.blocked;
            const blockedHeight = (bucket.blocked / max) * 100;
            const allowedHeight = (bucket.allowed / max) * 100;
            return (
              <div
                key={bucket.start}
                className={`chart-col${hover === index ? " hover" : ""}`}
                onMouseEnter={() => setHover(index)}
                title={`${formatBucketTime(bucket.start)} · ${formatCount(total)} queries · ${formatCount(bucket.blocked)} blocked`}
              >
                {blockedHeight > 0 ? (
                  <div className="bar-blocked" style={{ height: `${blockedHeight}%` }} />
                ) : null}
                {allowedHeight > 0 ? (
                  <div className="bar-allowed" style={{ height: `${allowedHeight}%` }} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-axis">
        <span>{formatBucketTime(buckets[0].start)}</span>
        <span>per-bucket totals · last 1,000 events</span>
        <span>{formatBucketTime(buckets[buckets.length - 1].end)}</span>
      </div>
    </div>
  );
}
