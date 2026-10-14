import { BASE_MAX } from './constants.js';

const CACHE_MAX = 20;
const cache = new Map();

function computeBaseMatches(sub) {
  if (!/^\d+$/.test(sub)) return [];

  const subLen = sub.length;
  const subVal = Number(sub);
  const found = new Set();

  for (let len = subLen; len <= 6; len += 1) {
    for (let pos = 0; pos <= len - subLen; pos += 1) {
      const prefixLen = pos;
      const suffixLen = len - subLen - pos;

      if (prefixLen === 0 && sub[0] === '0') continue;

      const suffixShift = 10 ** suffixLen;
      const totalShift = 10 ** (subLen + suffixLen);
      const suffixMax = suffixShift - 1;

      if (prefixLen === 0) {
        const base = subVal * suffixShift;
        for (let suffix = 0; suffix <= suffixMax; suffix += 1) {
          const value = base + suffix;
          if (value >= 1 && value <= BASE_MAX) found.add(value);
        }
        continue;
      }

      const prefixLow = 10 ** (prefixLen - 1);
      const prefixHigh = 10 ** prefixLen - 1;
      for (let prefix = prefixLow; prefix <= prefixHigh; prefix += 1) {
        const base = prefix * totalShift + subVal * suffixShift;
        if (base > BASE_MAX) break;
        for (let suffix = 0; suffix <= suffixMax; suffix += 1) {
          const value = base + suffix;
          if (value <= BASE_MAX) found.add(value);
        }
      }
    }
  }

  if ('1000000'.includes(sub)) found.add(BASE_MAX);

  const result = Array.from(found);
  result.sort((a, b) => a - b);
  return result;
}

export function filterBaseMatches(sub) {
  const cached = cache.get(sub);
  if (cached) return cached;

  const result = computeBaseMatches(sub);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(sub, result);
  return result;
}

export function __clearFilterCache() {
  cache.clear();
}
