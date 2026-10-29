const REFRESH_KEY = "nullify.refreshSeconds";
const CONFIRM_DELETE_KEY = "nullify.confirmDelete";

export const REFRESH_OPTIONS = [
  { label: "2s", seconds: 2 },
  { label: "5s", seconds: 5 },
  { label: "10s", seconds: 10 },
  { label: "30s", seconds: 30 },
  { label: "Off", seconds: 0 },
];

/** Auto-refresh interval in ms. Null means manual refresh only. */
export function readRefreshMs(): number | null {
  try {
    const raw = window.localStorage.getItem(REFRESH_KEY);
    const seconds = raw === null ? 5 : Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
  } catch {
    return 5000;
  }
}

export function writeRefreshSeconds(seconds: number): void {
  try {
    window.localStorage.setItem(REFRESH_KEY, String(seconds));
  } catch {
    // Storage can be disabled; the default still applies.
  }
}

export function readConfirmDelete(): boolean {
  try {
    return window.localStorage.getItem(CONFIRM_DELETE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeConfirmDelete(enabled: boolean): void {
  try {
    window.localStorage.setItem(CONFIRM_DELETE_KEY, String(enabled));
  } catch {
    // Ignore; it only affects a confirmation step.
  }
}
