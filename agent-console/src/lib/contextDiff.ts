import type { ContextDiff } from './types';

const MAX_DEPTH = 4;
const MAX_KEYS = 200;

export function computeContextDiff(
  prev: unknown,
  next: unknown,
  depth = 0
): ContextDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  if (depth > MAX_DEPTH) {
    if (typeof prev !== typeof next) changed.push('<type>');
    else if (prev !== next) changed.push('<deep>');
    return { added, removed, changed };
  }

  if (prev === null || prev === undefined || typeof prev !== 'object') {
    if (next !== null && next !== undefined && typeof next === 'object') {
      const keys = Object.keys(next as Record<string, unknown>);
      added.push(...keys.slice(0, MAX_KEYS));
      if (keys.length > MAX_KEYS) added.push(`...${keys.length - MAX_KEYS} more`);
    } else if (prev !== next) {
      changed.push('<value>');
    }
    return { added, removed, changed };
  }

  if (next === null || next === undefined || typeof next !== 'object') {
    const keys = Object.keys(prev as Record<string, unknown>);
    removed.push(...keys.slice(0, MAX_KEYS));
    if (keys.length > MAX_KEYS) removed.push(`...${keys.length - MAX_KEYS} more`);
    return { added, removed, changed };
  }

  const prevObj = prev as Record<string, unknown>;
  const nextObj = next as Record<string, unknown>;
  const allKeys = [...new Set([
    ...Object.keys(prevObj),
    ...Object.keys(nextObj),
  ])].slice(0, MAX_KEYS);

  for (const key of allKeys) {
    if (!(key in prevObj)) {
      added.push(key);
    } else if (!(key in nextObj)) {
      removed.push(key);
    } else {
      const pv = prevObj[key];
      const nv = nextObj[key];
      if (typeof pv === 'object' && typeof nv === 'object' && pv !== null && nv !== null) {
        const sub = computeContextDiff(pv, nv, depth + 1);
        if (sub.added.length > 0 || sub.removed.length > 0 || sub.changed.length > 0) {
          changed.push(key);
        }
      } else if (pv !== nv) {
        changed.push(key);
      }
    }
  }

  if (allKeys.length < Math.max(Object.keys(prevObj).length, Object.keys(nextObj).length)) {
    const omitted = Math.max(Object.keys(prevObj).length, Object.keys(nextObj).length) - MAX_KEYS;
    added.push(`...${omitted} keys omitted`);
  }

  return { added, removed, changed };
}
