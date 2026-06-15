'use client';

import { useState, useMemo } from 'react';
import type { ContextSnapshot, ContextDiff } from '@/lib/types';
import { computeContextDiff } from '@/lib/contextDiff';

const LARGE_OBJECT_THRESHOLD = 50;

interface ContextPanelProps {
  contexts: ContextSnapshot[];
}

export function ContextPanel({ contexts }: ContextPanelProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);

  const groupedContexts = useMemo(() => {
    const groups = new Map<string, ContextSnapshot[]>();
    for (const ctx of contexts) {
      const existing = groups.get(ctx.context_id) || [];
      existing.push(ctx);
      groups.set(ctx.context_id, existing);
    }
    return groups;
  }, [contexts]);

  const currentContext = useMemo(() => {
    if (selectedIdx >= 0 && selectedIdx < contexts.length) {
      return contexts[selectedIdx];
    }
    return contexts[contexts.length - 1];
  }, [contexts, selectedIdx]);

  const diff = useMemo((): ContextDiff | null => {
    if (!currentContext) return null;

    const contextHistory = groupedContexts.get(currentContext.context_id) || [];
    const currentIdxInGroup = contextHistory.findIndex(
      (c) => c.seq === currentContext.seq
    );

    if (currentIdxInGroup <= 0) return null;

    const prevSnapshot = contextHistory[currentIdxInGroup - 1];
    return computeContextDiff(prevSnapshot.data, currentContext.data);
  }, [currentContext, groupedContexts]);

  const isLargeObject = useMemo(() => {
    if (!currentContext?.data) return false;
    const str = JSON.stringify(currentContext.data);
    return str.length > LARGE_OBJECT_THRESHOLD;
  }, [currentContext]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700 font-medium text-gray-300">
        Context Inspector
      </div>

      {contexts.length === 0 ? (
        <div className="p-4 text-gray-500 text-sm">No context snapshots yet</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">
              Snapshot {selectedIdx >= 0 ? selectedIdx + 1 : contexts.length} of{' '}
              {contexts.length}
            </div>
            <input
              type="range"
              min={0}
              max={contexts.length - 1}
              value={selectedIdx >= 0 ? selectedIdx : contexts.length - 1}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>Oldest</span>
              <span>Latest</span>
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-2">
            ID: <code className="text-gray-400">{currentContext?.context_id}</code>
          </div>
          <div className="text-xs text-gray-500 mb-2">
            Seq: <code className="text-gray-400">#{currentContext?.seq}</code>
          </div>

          {diff && (
            <div className="mb-4 p-2 bg-gray-800 rounded text-xs">
              <div className="font-medium text-gray-300 mb-1">Changes from previous:</div>
              {diff.added.length > 0 && (
                <div className="text-green-400">+ Added: {diff.added.join(', ')}</div>
              )}
              {diff.removed.length > 0 && (
                <div className="text-red-400">- Removed: {diff.removed.join(', ')}</div>
              )}
              {diff.changed.length > 0 && (
                <div className="text-yellow-400">~ Changed: {diff.changed.join(', ')}</div>
              )}
              {diff.added.length === 0 &&
                diff.removed.length === 0 &&
                diff.changed.length === 0 && (
                  <div className="text-gray-500">No changes</div>
                )}
            </div>
          )}

          <div className="text-xs bg-gray-800 rounded p-3 overflow-x-auto max-h-[60vh] overflow-y-auto">
            {currentContext && (
              <JsonTree
                data={currentContext.data}
                diff={diff}
                defaultCollapsed={isLargeObject}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface JsonTreeProps {
  data: unknown;
  diff?: ContextDiff | null;
  depth?: number;
  defaultCollapsed?: boolean;
}

function JsonTree({ data, diff, depth = 0, defaultCollapsed = false }: JsonTreeProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (data === null || data === undefined) {
    return <span className="text-gray-500">null</span>;
  }

  if (typeof data !== 'object') {
    return (
      <span className={typeof data === 'string' ? 'text-green-300' : 'text-blue-300'}>
        {typeof data === 'string' ? `"${data}"` : String(data)}
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>;

    if (collapsed && depth > 0) {
      return (
        <span
          onClick={() => setCollapsed(false)}
          className="cursor-pointer text-gray-400 hover:text-gray-200"
        >
          Array({data.length}) [...]
        </span>
      );
    }

    return (
      <div>
        <span className="text-gray-500 cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? `Array(${data.length}) [>]` : '['}
        </span>
        {!collapsed && (
          <>
            {data.map((item, i) => (
              <div key={i} style={{ paddingLeft: 12 }}>
                <JsonTree data={item} diff={diff} depth={depth + 1} defaultCollapsed={defaultCollapsed} />
                {i < data.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            ))}
            <span className="text-gray-500">]</span>
          </>
        )}
      </div>
    );
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return <span className="text-gray-500">{'{}'}</span>;

  if (collapsed && depth > 0) {
    return (
      <span
        onClick={() => setCollapsed(false)}
        className="cursor-pointer text-gray-400 hover:text-gray-200"
      >
        {'{...}'} ({keys.length} keys)
      </span>
    );
  }

  return (
    <div>
      <span className="text-gray-500 cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? `{>}` : '{'}
      </span>
      {!collapsed && (
        <>
          {keys.map((key, i) => {
            let highlightClass = '';
            if (diff) {
              if (diff.added.includes(key)) highlightClass = 'bg-green-900/30';
              else if (diff.changed.includes(key)) highlightClass = 'bg-yellow-900/30';
              else if (diff.removed.includes(key)) highlightClass = 'bg-red-900/30';
            }

            return (
              <div key={key} style={{ paddingLeft: 12 }} className={highlightClass}>
                <span className="text-purple-300">&quot;{key}&quot;</span>
                <span className="text-gray-500">: </span>
                <JsonTree data={obj[key]} diff={diff} depth={depth + 1} defaultCollapsed={defaultCollapsed} />
                {i < keys.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            );
          })}
          <span className="text-gray-500">{'}'}</span>
        </>
      )}
    </div>
  );
}
