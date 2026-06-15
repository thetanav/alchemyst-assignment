'use client';

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
            setHighlightElementId(id);
            setTimeout(() => setHighlightElementId(null), 2000);
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
            if (id) {
              setHighlightElementId(id);
              setTimeout(() => setHighlightElementId(null), 2000);
            }
          }}
        />
      </div>

      <div className="w-80 border-l border-gray-700 flex flex-col">
        <ContextPanel contexts={contexts} />
      </div>
    </div>
  );
}
