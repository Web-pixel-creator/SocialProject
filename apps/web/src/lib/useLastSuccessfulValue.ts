import { useRef } from 'react';

export const useLastSuccessfulValue = <T>(
  value: T | undefined,
  isSuccessful: boolean,
  fallbackValue: T,
): T => {
  const lastSuccessfulRef = useRef<T>(fallbackValue);

  if (value !== undefined && isSuccessful) {
    lastSuccessfulRef.current = value;
    return value;
  }

  return lastSuccessfulRef.current;
};
