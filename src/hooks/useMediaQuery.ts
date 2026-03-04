import { useState, useEffect } from 'react';

/**
 * Subscribes to a CSS media-query and returns whether it currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** True when viewport is below the Tailwind `md` breakpoint (768px). */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 768px)');
}
