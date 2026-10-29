import type { ReactNode } from "react";

export type IconName =
  | "overview"
  | "queries"
  | "rules"
  | "system"
  | "search"
  | "copy"
  | "trash"
  | "plus"
  | "pause"
  | "play"
  | "download"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "check"
  | "alert"
  | "info"
  | "terminal"
  | "refresh"
  | "lock";

const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="3" rx="1" />
      <rect x="9" y="7" width="5" height="7" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
    </>
  ),
  queries: <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />,
  rules: (
    <>
      <path d="M8 2l4.8 1.9v4.2c0 2.9-2.3 4.9-4.8 5.9-2.5-1-4.8-3-4.8-5.9V3.9L8 2z" />
      <path d="M6 8l1.4 1.4L10.2 6.6" />
    </>
  ),
  system: (
    <>
      <path d="M2 5h5.5M11.5 5H14M2 11h3.5M9.5 11H14" />
      <circle cx="9.5" cy="5" r="1.6" />
      <circle cx="7.5" cy="11" r="1.6" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.4" />
      <path d="M10.3 10.3L14 14" />
    </>
  ),
  copy: (
    <>
      <rect x="5" y="5" width="8" height="9" rx="1.2" />
      <path d="M11 5V3.4A1.4 1.4 0 009.6 2H4.4A1.4 1.4 0 003 3.4v6.2A1.4 1.4 0 004.4 11H5" />
    </>
  ),
  trash: (
    <>
      <path d="M2.5 4.5h11M6 4.5V2.6h4v1.9M4 4.5l.6 9h6.8l.6-9" />
      <path d="M6.5 7v4M9.5 7v4" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  pause: (
    <>
      <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="2.2" />
    </>
  ),
  play: <path d="M5 3.2l7 4.8-7 4.8V3.2z" />,
  download: (
    <>
      <path d="M8 2v8M4.6 7.4L8 10.8l3.4-3.4" />
      <path d="M3 13.2h10" />
    </>
  ),
  "chevron-left": <path d="M9.5 3.5L5 8l4.5 4.5" />,
  "chevron-right": <path d="M6.5 3.5L11 8l-4.5 4.5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  check: <path d="M3.5 8.5l3 3 6-6.5" />,
  alert: (
    <>
      <path d="M8 2.5l6 11H2l6-11z" />
      <path d="M8 6.5v3.2M8 11.6v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 7.2v4M8 4.9v.1" />
    </>
  ),
  terminal: (
    <>
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.4" />
      <path d="M4.4 6.2L6.6 8l-2.2 1.8M8 10h3.4" />
    </>
  ),
  refresh: (
    <>
      <path d="M13 8a5 5 0 01-8.6 3.5M3 8a5 5 0 018.6-3.5" />
      <path d="M11.9 2.2v2.6H9.3M4.1 13.8v-2.6h2.6" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="7" width="10" height="6.6" rx="1.2" />
      <path d="M5.4 7V5.3a2.6 2.6 0 015.2 0V7" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
