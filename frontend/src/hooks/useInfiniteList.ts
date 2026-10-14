import { useCallback, useEffect, useRef, useState } from 'react';

import type { Item, Page } from '../api';

type Fetcher = (filter: string, offset: number, signal?: AbortSignal) => Promise<Page>;
type Position = 'before' | 'after';

export type InfiniteList = {
  filterInput: string;
  setFilterInput: (value: string) => void;
  filter: string;
  items: Item[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => Promise<void>;
  removeItem: (id: string) => void;
  appendItem: (id: string) => void;
  insertSortedItem: (id: string, compare: (a: string, b: string) => number) => void;
  moveItem: (id: string, anchorId: string, position: Position) => void;
};

export function useInfiniteList(fetcher: Fetcher, debounceMs = 300): InfiniteList {
  const [filterInput, setFilterInput] = useState('');
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const filterRef = useRef('');
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (filterInput === filter) return;
    const timer = setTimeout(() => setFilter(filterInput), debounceMs);
    return () => clearTimeout(timer);
  }, [filterInput, filter, debounceMs]);

  const load = useCallback(
    async (reset: boolean, force = false) => {
      if (loadingRef.current && !force) return;
      if (!reset && !hasMoreRef.current) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const seq = seqRef.current + 1;
      seqRef.current = seq;
      loadingRef.current = true;
      setLoading(true);

      const offset = reset ? 0 : offsetRef.current;

      try {
        const page = await fetcher(filterRef.current, offset, controller.signal);
        if (seq !== seqRef.current) return;

        setItems((prev) => (reset ? page.items : mergeUnique(prev, page.items)));
        offsetRef.current = offset + page.items.length;
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);
        setTotal(page.total);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted || seq !== seqRef.current) return;
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные');
      } finally {
        if (seq === seqRef.current) {
          loadingRef.current = false;
          setLoading(false);
          setInitialLoading(false);
        }
      }
    },
    [fetcher]
  );

  useEffect(() => {
    filterRef.current = filter;
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setItems([]);
    setHasMore(true);
    setInitialLoading(true);
    void load(true, true);
  }, [filter, load]);

  const loadMore = useCallback(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    await load(true, true);
  }, [load]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) return prev;
      if (index < offsetRef.current) offsetRef.current -= 1;
      return prev.filter((item) => item.id !== id);
    });
    setTotal((value) => Math.max(0, value - 1));
  }, []);

  const appendItem = useCallback((id: string) => {
    setItems((prev) => {
      if (prev.some((item) => item.id === id)) return prev;
      offsetRef.current += 1;
      return [...prev, { id }];
    });
    setTotal((value) => value + 1);
  }, []);

  const insertSortedItem = useCallback((id: string, compare: (a: string, b: string) => number) => {
    setItems((prev) => {
      if (prev.some((item) => item.id === id)) return prev;
      const index = prev.findIndex((item) => compare(id, item.id) < 0);
      if (index === -1) return prev;
      const next = prev.slice();
      next.splice(index, 0, { id });
      offsetRef.current += 1;
      return next;
    });
    setTotal((value) => value + 1);
  }, []);

  const moveItem = useCallback((id: string, anchorId: string, position: Position) => {
    setItems((prev) => {
      const from = prev.findIndex((item) => item.id === id);
      if (from === -1) return prev;
      const next = prev.slice();
      next.splice(from, 1);
      const anchorIndex = next.findIndex((item) => item.id === anchorId);
      if (anchorIndex === -1) return prev;
      next.splice(position === 'after' ? anchorIndex + 1 : anchorIndex, 0, { id });
      return next;
    });
  }, []);

  return {
    filterInput,
    setFilterInput,
    filter,
    items,
    total,
    hasMore,
    loading,
    initialLoading,
    error,
    loadMore,
    refresh,
    removeItem,
    appendItem,
    insertSortedItem,
    moveItem,
  };
}

function mergeUnique(previous: Item[], next: Item[]): Item[] {
  const seen = new Set(previous.map((item) => item.id));
  const result = previous.slice();
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
