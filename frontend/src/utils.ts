const DIGITS = /^\d+$/;

export function compareIds(a: string, b: string): number {
  const aNumeric = DIGITS.test(a);
  const bNumeric = DIGITS.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function matchesFilter(id: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return needle === '' || id.toLowerCase().includes(needle);
}

export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}
