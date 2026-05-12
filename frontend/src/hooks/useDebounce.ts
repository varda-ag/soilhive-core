import { useEffect, useState, useRef } from 'react';

export function useDebounce<T>(value: T, delay: number): { value: T; isPending: boolean } {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (JSON.stringify(value) === JSON.stringify(debouncedValue)) {
      return; // Already up to date, no timeout needed
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay, debouncedValue]);

  return { value: debouncedValue, isPending: JSON.stringify(value) !== JSON.stringify(debouncedValue) };
}
