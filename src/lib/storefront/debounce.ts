/**
 * Generic trailing-edge debounce (U6 search bar, ~300ms per spec). Plain,
 * hook-free helper so it's directly unit-testable with `vi.useFakeTimers()`
 * — the "use client" `SearchBar` component that wraps this stays a thin
 * `useMemo`d instance, per this repo's no-JSX-render-test-infra convention.
 */
export interface Debounced<Args extends unknown[]> {
  /** Schedule a call; resets the pending timer if one is already queued. */
  call: (...args: Args) => void;
  /** Cancel any pending scheduled call without invoking it. */
  cancel: () => void;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    call: (...args: Args) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn(...args);
      }, delayMs);
    },
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
