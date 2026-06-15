import type { ContextDiff } from './types';

export function computeContextDiff(
  prev: unknown,
  next: unknown
): ContextDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  if (prev === null || prev === undefined || typeof prev !== 'object') {
    if (next !== null && next !== undefined && typeof next === 'object') {
      added.push(...Object.keys(next as Record<string, unknown>));
    }
    return { added, removed, changed };
  }

  if (next === null || next === undefined || typeof next !== 'object') {
    removed.push(...Object.keys(prev as Record<string, unknown>));
    return { added, removed, changed };
  }

  const prevObj = prev as Record<string, unknown>;
  const nextObj = next as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]);

  for (const key of allKeys) {
    const prevVal = prevObj[key];
    const nextVal = nextObj[key];

    if (!(key in prevObj)) {
      added.push(key);
    } else if (!(key in nextObj)) {
      removed.push(key);
    } else if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      changed.push(key);
    }
  }

  return { added, removed, changed };
}
