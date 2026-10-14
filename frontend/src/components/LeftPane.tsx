import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { InfiniteList } from '../hooks/useInfiniteList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { formatNumber } from '../utils';
import { ListStatus } from './ListStatus';

type Props = {
  list: InfiniteList;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  addPending: boolean;
};

export function LeftPane({ list, onSelect, onAdd, addPending }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [newId, setNewId] = useState('');

  useInfiniteScroll(
    scrollRef,
    sentinelRef,
    list.loadMore,
    list.hasMore && !list.loading && !list.error,
    list.items.length
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newId.trim();
    if (value === '' || addPending) return;
    onAdd(value);
    setNewId('');
  }

  return (
    <section className="pane">
      <header className="pane__head">
        <div className="pane__title">
          <h2>Все элементы</h2>
          <span className="badge" title="Всего подходящих элементов">
            {formatNumber(list.total)}
          </span>
        </div>
        <input
          className="filter"
          type="search"
          placeholder="Фильтр по ID"
          aria-label="Фильтр по ID в левом списке"
          value={list.filterInput}
          onChange={(event) => list.setFilterInput(event.target.value)}
        />
      </header>

      <form className="add" onSubmit={handleSubmit}>
        <input
          className="add__input"
          placeholder="Добавить ID вручную (например, 2000000)"
          aria-label="Новый ID"
          value={newId}
          onChange={(event) => setNewId(event.target.value)}
        />
        <button className="add__btn" type="submit" disabled={addPending || newId.trim() === ''}>
          {addPending ? 'Добавляем…' : 'Добавить'}
        </button>
      </form>

      <div className="pane__scroll" ref={scrollRef}>
        <ListStatus list={list} />

        <ul className="items">
          {list.items.map((item) => (
            <li key={item.id} className="item">
              <button className="item__btn" type="button" onClick={() => onSelect(item.id)}>
                <span className="item__id">{item.id}</span>
                <span className="item__hint">выбрать →</span>
              </button>
            </li>
          ))}
        </ul>

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
