import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

import type { InfiniteList } from '../hooks/useInfiniteList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { formatNumber } from '../utils';
import { ListStatus } from './ListStatus';

type Position = 'before' | 'after';
type DropTarget = { id: string; position: Position } | null;

type Props = {
  list: InfiniteList;
  onDeselect: (id: string) => void;
  onReorder: (id: string, anchorId: string, position: Position) => void;
};

export function RightPane({ list, onDeselect, onReorder }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  useInfiniteScroll(
    scrollRef,
    sentinelRef,
    list.loadMore,
    list.hasMore && !list.loading && !list.error,
    list.items.length
  );

  function resetDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  function positionWithin(event: DragEvent<HTMLLIElement>): Position {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function startDrag(event: DragEvent<HTMLLIElement>, id: string) {
    setDragId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  function overItem(event: DragEvent<HTMLLIElement>, id: string) {
    if (!dragId || dragId === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ id, position: positionWithin(event) });
  }

  function dropOnItem(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault();
    if (!dragId || dragId === id) {
      resetDrag();
      return;
    }
    onReorder(dragId, id, positionWithin(event));
    resetDrag();
  }

  function dropToEnd(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!dragId) return;
    const last = list.items.at(-1);
    if (last && last.id !== dragId) onReorder(dragId, last.id, 'after');
    resetDrag();
  }

  const canReorder = list.items.length > 1;

  return (
    <section className="pane pane--selected">
      <header className="pane__head">
        <div className="pane__title">
          <h2>Выбранные элементы</h2>
          <span className="badge" title="Всего выбранных">
            {formatNumber(list.total)}
          </span>
        </div>
        <input
          className="filter"
          type="search"
          placeholder="Фильтр по ID"
          aria-label="Фильтр по ID в правом списке"
          value={list.filterInput}
          onChange={(event) => list.setFilterInput(event.target.value)}
        />
      </header>

      <p className="pane__note">
        Порядок меняется перетаскиванием и хранится на сервере - он переживёт перезагрузку.
        Работает и при включённом фильтре.
      </p>

      <div className="pane__scroll" ref={scrollRef}>
        <ListStatus list={list} />

        <ul className={`items${dragId ? ' items--dragging' : ''}`}>
          {list.items.map((item) => {
            const classes = ['item', 'item--draggable'];
            if (dragId === item.id) classes.push('item--dragging');
            if (dropTarget?.id === item.id) {
              classes.push(dropTarget.position === 'before' ? 'item--drop-before' : 'item--drop-after');
            }
            return (
              <li
                key={item.id}
                className={classes.join(' ')}
                draggable={canReorder}
                onDragStart={(event) => startDrag(event, item.id)}
                onDragOver={(event) => overItem(event, item.id)}
                onDrop={(event) => dropOnItem(event, item.id)}
                onDragEnd={resetDrag}
              >
                <span className="item__grip" aria-hidden="true">
                  ⠿
                </span>
                <span className="item__id">{item.id}</span>
                <button
                  className="item__remove"
                  type="button"
                  title="Убрать из выбранных"
                  onClick={() => onDeselect(item.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        {dragId ? (
          <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={dropToEnd}>
            Перетащите сюда, чтобы поместить в конец
          </div>
        ) : null}

        <div className="sentinel" ref={sentinelRef}>
          {list.loading && !list.initialLoading ? <span className="hint">Ещё 20…</span> : null}
          {!list.hasMore && list.items.length > 0 ? (
            <span className="hint hint--muted">Конец списка</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
