import { useCallback, useEffect, useState } from 'react';

import { api, fetchLeft, fetchRight } from './api';
import type { QueueStats } from './api';
import { LeftPane } from './components/LeftPane';
import { RightPane } from './components/RightPane';
import { useInfiniteList } from './hooks/useInfiniteList';
import { compareIds, matchesFilter } from './utils';

type Toast = { id: number; kind: 'ok' | 'error'; text: string };

export default function App() {
  const left = useInfiniteList(fetchLeft);
  const right = useInfiniteList(fetchRight);

  const [addPending, setAddPending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((previous) => [...previous, { id, kind, text }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const tick = async () => {
      try {
        const data = await api.stats(controller.signal);
        if (active) setStats(data);
      } catch {
        void 0;
      }
    };

    void tick();
    const timer = setInterval(tick, 3000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const handleSelect = useCallback(
    async (id: string) => {
      left.removeItem(id);
      if (matchesFilter(id, right.filter)) right.appendItem(id);

      const { status } = await api.select(id);
      if (status !== 200) {
        notify('error', `Не удалось выбрать ID ${id}`);
        await Promise.all([left.refresh(), right.refresh()]);
      }
    },
    [left, right, notify]
  );

  const handleDeselect = useCallback(
    async (id: string) => {
      right.removeItem(id);
      if (matchesFilter(id, left.filter)) left.insertSortedItem(id, compareIds);

      const { status } = await api.deselect(id);
      if (status !== 200) {
        notify('error', `Не удалось убрать ID ${id}`);
        await Promise.all([left.refresh(), right.refresh()]);
      }
    },
    [left, right, notify]
  );

  const handleReorder = useCallback(
    async (id: string, anchorId: string, position: 'before' | 'after') => {
      right.moveItem(id, anchorId, position);
      const { status } = await api.reorder(id, anchorId, position);
      if (status !== 200) {
        notify('error', 'Не удалось изменить порядок');
        await right.refresh();
      }
    },
    [right, notify]
  );

  const handleAdd = useCallback(
    async (rawId: string) => {
      setAddPending(true);
      try {
        const { status, data } = await api.addItem(rawId);
        if (status === 200 && data.ok !== false) {
          notify('ok', `ID ${rawId} добавлен`);
          await left.refresh();
        } else if (data.error === 'duplicate') {
          notify('error', `ID ${rawId} уже существует`);
        } else if (data.error === 'invalid') {
          notify('error', 'Некорректный ID');
        } else {
          notify('error', `Не удалось добавить ID ${rawId}`);
        }
      } catch {
        notify('error', 'Сервер недоступен');
      } finally {
        setAddPending(false);
      }
    },
    [left, notify]
  );

  const totalFlushes = stats ? stats.lanes.normal.flushes + stats.lanes.add.flushes : 0;
  const totalDeduped = stats ? stats.lanes.normal.deduped + stats.lanes.add.deduped : 0;
  const totalPending = stats ? stats.lanes.normal.pending + stats.lanes.add.pending : 0;

  return (
    <div className="app">
      <header className="app__head">
        <h1>Список из 1 000 000 элементов</h1>
        <p className="app__sub">
          Слева - все элементы, кроме выбранных, справа - выбранные. Порядок выбранных хранится
          на сервере и переживает перезагрузку страницы, а значения фильтров - нет.
        </p>
        {stats ? (
          <div className="app__stats">
            <span>получение/изменение: батч {stats.config.normalMs} мс</span>
            <span>добавление: батч {stats.config.addMs} мс</span>
            <span>флешей: {totalFlushes}</span>
            <span>склеено запросов: {totalDeduped}</span>
            <span>в очереди: {totalPending}</span>
          </div>
        ) : null}
      </header>

      <main className="layout">
        <LeftPane list={left} onSelect={handleSelect} onAdd={handleAdd} addPending={addPending} />
        <RightPane list={right} onDeselect={handleDeselect} onReorder={handleReorder} />
      </main>

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
