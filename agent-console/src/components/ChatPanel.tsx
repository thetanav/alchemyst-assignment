'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { StreamState, ChatMessage } from '@/lib/types';
import { ToolCallCard } from './ToolCallCard';

interface ChatPanelProps {
  streams: Map<string, StreamState>;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  selectedTimelineId: string | null;
  onToolCardClick: (seq: number) => void;
  highlightElementId: string | null;
}

export function ChatPanel({
  streams,
  messages,
  onSendMessage,
  selectedTimelineId,
  onToolCardClick,
  highlightElementId,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const elementRefsMap = useRef(new Map<string, HTMLElement>());

  const setElementRef = useCallback((elementId: string, el: HTMLElement | null) => {
    if (el) {
      elementRefsMap.current.set(elementId, el);
    } else {
      elementRefsMap.current.delete(elementId);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streams]);

  useEffect(() => {
    if (highlightElementId) {
      const el = elementRefsMap.current.get(highlightElementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-blue-400');
        const timer = setTimeout(() => {
          el.classList.remove('ring-2', 'ring-blue-400');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [highlightElementId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const renderBlocks = useCallback(
    (stream: StreamState): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];

      for (const block of stream.blocks) {
        if (block.kind === 'text') {
          if (block.text) {
            nodes.push(
              <div
                key={block.id}
                data-element-id={`TOKEN-${stream.stream_id}-${block.id}`}
                className="bg-gray-800 rounded-lg p-3"
              >
                <div className="text-gray-300 whitespace-pre-wrap text-sm">
                  {block.text}
                </div>
              </div>
            );
          }
        } else {
          const elementId = `TOOL_CALL-${block.call.seq}`;
          nodes.push(
            <div
              key={block.id}
              ref={(el) => setElementRef(elementId, el)}
              data-element-id={elementId}
            >
              <ToolCallCard
                toolCall={block.call}
                isSelected={selectedTimelineId === `TOOL_CALL-${block.call.seq}`}
                onClick={() => onToolCardClick(block.call.seq)}
              />
            </div>
          );
        }
      }

      if (!stream.isComplete && stream.blocks.length === 0) {
        nodes.push(
          <div key="waiting" className="flex items-center gap-2 text-gray-500 text-sm p-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            Agent is thinking...
          </div>
        );
      }

      return nodes;
    },
    [selectedTimelineId, onToolCardClick, setElementRef]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-gray-500 text-center mt-8">
            Send a message to start chatting with the agent
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              <div
                className="bg-blue-600 rounded-lg px-4 py-2 max-w-[70%]"
                data-element-id={`USER_MESSAGE-${msg.id}`}
              >
                <div className="text-white text-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-w-[85%] min-w-0">
                {msg.streamId && (() => {
                  const stream = streams.get(msg.streamId);
                  if (!stream) return (
                    <div key="no-stream" className="text-gray-500 text-sm p-2">
                      Waiting for response...
                    </div>
                  );
                  return renderBlocks(stream);
                })()}
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-800 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 rounded-lg px-6 py-2 font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
