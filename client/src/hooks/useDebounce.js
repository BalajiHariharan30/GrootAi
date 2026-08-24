/**
 * @module useDebounce
 * @description Custom hook that debounces any rapidly-changing value.
 * Used for search inputs and filter controls to prevent per-keystroke
 * API calls.
 *
 * @template T
 * @param   {T}      value   The value to debounce.
 * @param   {number} delay   Delay in milliseconds (default 300 ms).
 * @returns {T}              The debounced value, updated only after the
 *                           given idle period.
 *
 * @example
 *   const debouncedSearch = useDebounce(searchTerm, 300);
 *   useEffect(() => {
 *     dispatch(searchRecords(debouncedSearch));
 *   }, [debouncedSearch]);
 */
import { useState, useEffect } from 'react';

/**
 * @template T
 * @param {T} value
 * @param {number} [delay=300]
 * @returns {T}
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
