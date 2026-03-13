import { useEffect, useRef } from 'react';

/**
 * Executes a callback exactly once when the monitored value
 * is no longer 'undefined'.
 *
 * @template T - The type of the value being monitored.
 * @param {T | undefined} value - The state or prop to observe.
 * @param {(value: T) => void} callback - Function to run (receives the defined value).
 */
export function useOnceDefined<T>(value: T | undefined, callback: (value: T) => void): void {
  // A ref to track execution without triggering re-renders
  const hasTriggered = useRef<boolean>(false);

  useEffect(() => {
    // Strict check: value must be defined and action never executed
    if (value !== undefined && !hasTriggered.current) {
      callback(value);

      // Prevent any future executions even if 'value' changes again
      hasTriggered.current = true;
    }
  }, [value, callback]);
}
