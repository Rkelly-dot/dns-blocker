import { useCallback, useEffect, useRef, useState } from "react";

type PollingState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  updatedAt: Date | null;
};

/**
 * Fetches data on mount and then on an interval. Overlapping requests are
 * skipped, and the latest loader callback is always used so pages can poll
 * with fresh filter state without restarting the timer.
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs: number | null) {
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    updatedAt: null,
  });

  const loadRef = useRef(load);
  loadRef.current = load;

  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((prev) => ({
      ...prev,
      refreshing: prev.data !== null,
      loading: prev.data === null,
    }));

    try {
      const data = await loadRef.current();
      if (!mounted.current) return;
      setState({ data, error: null, loading: false, refreshing: false, updatedAt: new Date() });
    } catch (error) {
      if (!mounted.current) return;
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Request failed",
        loading: false,
        refreshing: false,
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (intervalMs === null) return;
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, refresh]);

  return { ...state, refresh };
}

/** Renders a clock that ticks so relative timestamps stay honest. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
