import { BASE_MAX } from './constants.js';
import { filterBaseMatches } from './filter.js';

const DIGITS = /^\d+$/;

const selected = [];
const selectedSet = new Set();
const customIds = new Set();

export function normalizeId(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  if (value === '' || value.length > 64) return null;
  if (DIGITS.test(value)) return value.replace(/^0+/, '') || '0';
  return value;
}

export function isBaseId(id) {
  if (!DIGITS.test(id)) return false;
  const n = Number(id);
  return Number.isSafeInteger(n) && n >= 1 && n <= BASE_MAX;
}

export function exists(id) {
  return isBaseId(id) || customIds.has(id);
}

export function addItem(rawId) {
  const id = normalizeId(rawId);
  if (id === null) return { ok: false, error: 'invalid' };
  if (exists(id)) return { ok: false, error: 'duplicate', id };
  customIds.add(id);
  return { ok: true, item: { id } };
}

export function selectItem(rawId) {
  const id = normalizeId(rawId);
  if (id === null || !exists(id)) return { ok: false, error: 'not_found' };
  if (selectedSet.has(id)) return { ok: true, noop: true, id };
  selected.push(id);
  selectedSet.add(id);
  return { ok: true, id };
}

export function deselectItem(rawId) {
  const id = normalizeId(rawId);
  if (id === null || !selectedSet.has(id)) return { ok: false, error: 'not_selected' };
  const index = selected.indexOf(id);
  if (index !== -1) selected.splice(index, 1);
  selectedSet.delete(id);
  return { ok: true, id };
}

export function reorderItem(rawId, rawAnchorId, position) {
  const id = normalizeId(rawId);
  if (id === null || !selectedSet.has(id)) return { ok: false, error: 'not_selected' };

  const anchor = rawAnchorId === null || rawAnchorId === undefined ? null : normalizeId(rawAnchorId);
  const from = selected.indexOf(id);
  selected.splice(from, 1);

  let to;
  if (anchor === null || anchor === id || !selectedSet.has(anchor)) {
    to = selected.length;
  } else {
    const anchorIndex = selected.indexOf(anchor);
    to = position === 'after' ? anchorIndex + 1 : anchorIndex;
  }
  selected.splice(to, 0, id);
  return { ok: true, id };
}

function compareIds(a, b) {
  const aNum = DIGITS.test(a);
  const bNum = DIGITS.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function listRight({ filter = '', offset = 0, limit = 20 } = {}) {
  const needle = String(filter).trim().toLowerCase();
  const skip = Math.max(0, Number(offset) || 0);
  const take = Math.max(0, Number(limit) || 0);

  const source = needle === ''
    ? selected
    : selected.filter((id) => id.toLowerCase().includes(needle));

  const items = source.slice(skip, skip + take).map((id) => ({ id }));
  return { items, total: source.length, hasMore: skip + take < source.length };
}

export function listLeft({ filter = '', offset = 0, limit = 20 } = {}) {
  const text = String(filter).trim();
  const skip = Math.max(0, Number(offset) || 0);
  const take = Math.max(0, Number(limit) || 0);

  if (text === '') {
    const total = BASE_MAX + customIds.size - selected.length;
    const items = [];
    let seen = 0;

    for (let n = 1; n <= BASE_MAX; n += 1) {
      const id = String(n);
      if (selectedSet.has(id)) continue;
      if (seen >= skip && items.length < take) items.push({ id });
      seen += 1;
      if (items.length === take) break;
    }

    if (items.length < take) {
      const customs = Array.from(customIds).sort(compareIds);
      for (const id of customs) {
        if (selectedSet.has(id)) continue;
        if (seen >= skip && items.length < take) items.push({ id });
        seen += 1;
      }
    }

    return { items, total, hasMore: skip + take < total };
  }

  const needle = text.toLowerCase();
  const baseMatches = filterBaseMatches(text);
  const customMatches = Array.from(customIds)
    .filter((id) => id.toLowerCase().includes(needle))
    .sort(compareIds);

  const items = [];
  let seen = 0;

  for (const value of baseMatches) {
    const id = String(value);
    if (selectedSet.has(id)) continue;
    if (seen >= skip && items.length < take) items.push({ id });
    seen += 1;
  }

  if (items.length < take) {
    for (const id of customMatches) {
      if (selectedSet.has(id)) continue;
      if (seen >= skip && items.length < take) items.push({ id });
      seen += 1;
    }
  }

  return { items, total: seen, hasMore: skip + take < seen };
}

export function getSelected() {
  return selected.slice();
}

export function reset() {
  selected.length = 0;
  selectedSet.clear();
  customIds.clear();
}
