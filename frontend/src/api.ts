export type Item = { id: string };
export type Page = { items: Item[]; total: number; hasMore: boolean };
export type MutationResult = { ok: boolean; error?: string; id?: string; noop?: boolean };

export type QueueStats = {
  config: { normalMs: number; addMs: number; graceMs: number };
  lanes: Record<
    string,
    {
      intervalMs: number;
      pending: number;
      flushes: number;
      applied: number;
      deduped: number;
      lastBatchSize: number;
    }
  >;
};

export const PAGE_SIZE = 20;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Сервер ответил ${response.status}`);
  return (await response.json()) as T;
}

function pageQuery(filter: string, offset: number): string {
  return new URLSearchParams({
    filter,
    offset: String(offset),
    limit: String(PAGE_SIZE),
  }).toString();
}

export function fetchLeft(filter: string, offset: number, signal?: AbortSignal): Promise<Page> {
  return getJson<Page>(`/api/left?${pageQuery(filter, offset)}`, signal);
}

export function fetchRight(filter: string, offset: number, signal?: AbortSignal): Promise<Page> {
  return getJson<Page>(`/api/right?${pageQuery(filter, offset)}`, signal);
}

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

export const api = {
  addItem: (id: string) => postJson<MutationResult>('/api/items', { id }),
  select: (id: string) => postJson<MutationResult>('/api/select', { id }),
  deselect: (id: string) => postJson<MutationResult>('/api/deselect', { id }),
  reorder: (id: string, anchorId: string, position: 'before' | 'after') =>
    postJson<MutationResult>('/api/reorder', { id, anchorId, position }),
  stats: (signal?: AbortSignal) => getJson<QueueStats>('/api/stats', signal),
};
