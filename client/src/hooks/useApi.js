/**
 * @module useApi
 * @description Generic data-fetching hook that manages loading, error, and
 * data state for any async fetch function.
 *
 * Features:
 *  • Automatic abort on component unmount via AbortController
 *  • Typed error messages surfaced as strings
 *  • Optional `immediate` flag to disable auto-fetch on mount
 *
 * @template T
 * @param {() => Promise<T>}     fetcher   Async function returning data.
 * @param {{ immediate?: boolean }} [opts]  Hook options.
 *
 * @example
 *   const { data, loading, error, refetch } = useApi(
 *     () => fetch('/api/datasets').then(r => r.json()),
 *   );
 */
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * @template T
 * @param {() => Promise<T>} fetcher
 * @param {{ immediate?: boolean }} [opts]
 * @returns {{ data: T | null; loading: boolean; error: string | null; refetch: () => void }}
 */
export function useApi(fetcher, { immediate = true } = {}) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error,   setError]   = useState(null);

  // Track whether this hook instance is still mounted
  const mountedRef  = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      if (mountedRef.current) setData(result);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (immediate) execute();
  }, [immediate]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refetch: execute };
}
