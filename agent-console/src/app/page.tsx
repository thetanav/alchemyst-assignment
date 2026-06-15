'use client';

import { useRef, useCallback } from 'react';
import { useAgentWebSocket } from '@/lib/useAgentWebSocket';
import { ChatPanel } from '@/components/ChatPanel';
import { TimelinePanel } from '@/components/TimelinePanel';
import { ContextPanel } from '@/components/ContextPanel';
import { ConnectionStatus } from '@/components/ConnectionStatus';

export default function Home() {
  const {
    streams,
    messages,
    timeline,
    contexts,
    connectionStatus,
    sendMessage,
    selectedTimelineId,
    setSelectedTimelineId,
    highlightElementId,
    setHighlightElementId,
  } = useAgentWebSocket();

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashHighlight = useCallback((id: string | null) => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    setHighlightElementId(id);
    if (id) {
      highlightTimerRef.current = setTimeout(() => {
        setHighlightElementId(null);
        highlightTimerRef.current = null;
      }, 2000);
    }
  }, [setHighlightElementId]);

  return (
    <div className="flex h-screen bg-gray-900 text-white relative">
      <ConnectionStatus status={connectionStatus} />

      <div className="flex-1 flex flex-col min-w-0">
        <ChatPanel
          streams={streams}
          messages={messages}
          onSendMessage={sendMessage}
          selectedTimelineId={selectedTimelineId}
          onToolCardClick={(seq) => {
            const id = `TOOL_CALL-${seq}`;
            setSelectedTimelineId(id);
            flashHighlight(id);
          }}
          highlightElementId={highlightElementId}
        />
      </div>

      <div className="w-80 border-l border-gray-700 flex flex-col">
        <TimelinePanel
          events={timeline}
          selectedId={selectedTimelineId}
          onSelect={(id) => {
            setSelectedTimelineId(id);
            flashHighlight(id);
          }}
        />
      </div>

      <div className="w-80 border-l border-gray-700 flex flex-col">
        <ContextPanel contexts={contexts} />
      </div>
    </div>
  );
}
