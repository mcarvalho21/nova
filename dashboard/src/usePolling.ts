import { useState, useEffect, useRef, useCallback } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
): { data: T | null; error: string | null; lastUpdated: Date | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const tickRef = useRef(0);

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, [fetcher]);

  useEffect(() => {
    doFetch();
    const id = setInterval(() => {
      tickRef.current++;
      doFetch();
    }, intervalMs);
    return () => clearInterval(id);
  }, [doFetch, intervalMs]);

  return { data, error, lastUpdated, refresh: doFetch };
}
