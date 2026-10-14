import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const ROOT_MARGIN = 240;

export function useInfiniteScroll(
  scrollRef: RefObject<HTMLElement>,
  sentinelRef: RefObject<HTMLElement>,
  onReachEnd: () => void,
  enabled: boolean,
  fillKey: number
): void {
  const callbackRef = useRef(onReachEnd);
  callbackRef.current = onReachEnd;

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
      },
      { root, rootMargin: `0px 0px ${ROOT_MARGIN}px 0px` }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, sentinelRef, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const rootRect = root.getBoundingClientRect();
    const sentinelRect = sentinel.getBoundingClientRect();
    if (sentinelRect.top > rootRect.bottom + ROOT_MARGIN) return;

    const timer = setTimeout(() => callbackRef.current(), 0);
    return () => clearTimeout(timer);
  }, [scrollRef, sentinelRef, enabled, fillKey]);
}
