'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { TimelineEvent, TokenBatch } from '@/lib/types';

interface TimelinePanelProps {
  events: TimelineEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function TimelinePanel({ events, selectedId, onSelect }: TimelinePanelProps) {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  const groupedEvents = useMemo(() => {
    const groups: Array<TimelineEvent | TokenBatch> = [];
    let currentBatch: TimelineEvent[] = [];

    const flushBatch = () => {
      if (currentBatch.length === 0) return;
      if (currentBatch.length === 1) {
        groups.push(currentBatch[0]);
      } else {
        groups.push({
          id: `batch-${currentBatch[0].id}`,
          tokens: currentBatch,
          startTime: currentBatch[0].timestamp,
          endTime: currentBatch[currentBatch.length - 1].timestamp,
        });
      }
      currentBatch = [];
    };

    for (const event of events) {
      if (event.type === 'TOKEN') {
        currentBatch.push(event);
      } else {
        flushBatch();
        groups.push(event);
      }
    }
    flushBatch();

    return groups;
  }, [events]);

  const filteredEvents = useMemo(() => {
    return groupedEvents.filter((event) => {
      if ('tokens' in event) {
        if (filterType !== 'ALL' && filterType !== 'TOKEN') return false;
        if (searchQuery) {
          const batchText = event.tokens.map((t) => t.content).join('');
          if (!batchText.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        }
        return true;
      }

      if (filterType !== 'ALL' && event.type !== filterType) return false;
      if (searchQuery && !event.content.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [groupedEvents, filterType, searchQuery]);

  const toggleBatch = useCallback((batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  }, []);

  const eventTypes = [
    'ALL', 'TOKEN', 'TOOL_CALL', 'TOOL_RESULT',
    'CONTEXT_SNAPSHOT', 'PING', 'PONG', 'ERROR',
    'STREAM_END', 'USER_MESSAGE', 'TOOL_ACK', 'RESUME',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700 font-medium text-gray-300">
        Agent Trace Timeline
      </div>

      <div className="p-2 border-b border-gray-700 space-y-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full bg-gray-800 text-xs text-gray-300 rounded px-2 py-1 border border-gray-600"
        >
          {eventTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search events..."
          className="w-full bg-gray-800 text-xs text-gray-300 rounded px-2 py-1 border border-gray-600 placeholder-gray-500"
        />
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filteredEvents.map((event) => {
          if ('tokens' in event) {
            const batch = event as TokenBatch;
            const isExpanded = expandedBatches.has(batch.id);
            const totalChars = batch.tokens.reduce((sum, t) => sum + t.content.length, 0);
            const duration = ((batch.endTime - batch.startTime) / 1000).toFixed(1);

            return (
              <div
                key={batch.id}
                onClick={() => toggleBatch(batch.id)}
                className="px-3 py-2 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <EventBadge type="TOKEN" />
                  <span className="text-xs text-gray-400">
                    {batch.tokens.length} tokens ({totalChars} chars, {duration}s)
                  </span>
                  <span className="text-[10px] text-gray-600 ml-auto">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
                {!isExpanded && (
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {batch.tokens.map((t) => t.content).join('').slice(0, 80)}...
                  </div>
                )}
                {isExpanded && (
                  <div className="text-xs text-gray-300 mt-2 whitespace-pre-wrap bg-gray-900 rounded p-2 max-h-32 overflow-y-auto">
                    {batch.tokens.map((t) => t.content).join('')}
                  </div>
                )}
              </div>
            );
          }

          const singleEvent = event as TimelineEvent;
          const isSelected = selectedId === singleEvent.id;
          const isToolCall = singleEvent.type === 'TOOL_CALL';
          const isToolResult = singleEvent.type === 'TOOL_RESULT';

          const linkedCallId = singleEvent.call_id;
          const isLinked = linkedCallId && (isToolCall || isToolResult);

          return (
            <div
              key={singleEvent.id}
              ref={isSelected ? selectedRef : null}
              onClick={() => onSelect(isSelected ? null : singleEvent.id)}
              data-element-id={`${singleEvent.type}-${singleEvent.seq}`}
              className={`px-3 py-2 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${
                isSelected ? 'bg-gray-700' : ''
              } ${
                isToolCall ? 'border-l-2 border-yellow-700' : ''
              } ${
                isToolResult ? 'border-l-2 border-green-700' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <EventBadge type={singleEvent.type} />
                {singleEvent.seq !== undefined && singleEvent.seq >= 0 && (
                  <span className="text-xs text-gray-500 font-mono">#{singleEvent.seq}</span>
                )}
                {isLinked && (
                  <span className="text-[9px] text-gray-600 font-mono ml-auto">
                    {linkedCallId}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1 truncate">
                {singleEvent.content}
              </div>
              {isToolResult && (
                <div className="mt-1 ml-2 border-l-2 border-green-800/50 pl-2 text-[10px] text-gray-600">
                  Linked to {isToolCall ? '' : 'call'} {linkedCallId}
                </div>
              )}
            </div>
          );
        })}
        {filteredEvents.length === 0 && (
          <div className="p-4 text-gray-500 text-xs text-center">
            No events match the current filter
          </div>
        )}
      </div>
    </div>
  );
}

const EVENT_COLORS: Record<string, string> = {
  TOKEN: 'bg-blue-600',
  TOOL_CALL: 'bg-yellow-600',
  TOOL_RESULT: 'bg-green-600',
  CONTEXT_SNAPSHOT: 'bg-purple-600',
  PING: 'bg-gray-600',
  PONG: 'bg-gray-500',
  STREAM_END: 'bg-gray-700',
  ERROR: 'bg-red-600',
  USER_MESSAGE: 'bg-cyan-600',
  TOOL_ACK: 'bg-orange-600',
  RESUME: 'bg-indigo-600',
};

function EventBadge({ type }: { type: string }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded text-white ${EVENT_COLORS[type] || 'bg-gray-600'}`}
    >
      {type}
    </span>
  );
}
