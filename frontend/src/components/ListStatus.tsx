import type { InfiniteList } from '../hooks/useInfiniteList';

export function ListStatus({ list }: { list: InfiniteList }) {
  if (list.error) return <p className="hint hint--error">Ошибка: {list.error}</p>;
  if (list.initialLoading) return <p className="hint">Загрузка…</p>;
  if (list.items.length === 0) {
    return (
      <p className="hint">
        {list.filter.trim() === '' ? 'Список пуст' : 'Ничего не найдено по этому ID'}
      </p>
    );
  }
  return null;
}
