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

  const renderAgentContent = (msg: ChatMessage) => {
    if (!msg.streamId) return null;
    const stream = streams.get(msg.streamId);
    if (!stream) return null;

    const elements: React.ReactNode[] = [];
    let textAccumulator = '';

    const flushText = (key: string) => {
      if (textAccumulator) {
        elements.push(
          <div
            key={key}
            className="bg-gray-800 rounded-lg p-3"
          >
            <div className="text-gray-300 whitespace-pre-wrap text-sm">{textAccumulator}</div>
          </div>
        );
        textAccumulator = '';
      }
    };

    for (const chunk of stream.chunks) {
      textAccumulator += chunk.text;

      if (chunk.beforeToolCallSeq) {
        flushText(`chunk-${chunk.id}`);

        const matchingCalls = stream.toolCalls.filter(
          (tc) => tc.seq === chunk.beforeToolCallSeq
        );

        for (const tc of matchingCalls) {
          const elementId = `TOOL_CALL-${tc.seq}`;
          elements.push(
            <div
              key={`tc-wrapper-${tc.call_id}`}
              ref={(el) => setElementRef(elementId, el)}
              data-element-id={elementId}
            >
              <ToolCallCard
                toolCall={tc}
                isSelected={selectedTimelineId === `TOOL_CALL-${tc.seq}`}
                onClick={() => onToolCardClick(tc.seq)}
              />
            </div>
          );
        }
      }
    }

    flushText(`final-${msg.streamId}`);

    if (stream.toolCalls.length > 0) {
      const toolCallsWithoutChunks = stream.toolCalls.filter(
        (tc) => !stream.chunks.some((ch) => ch.beforeToolCallSeq === tc.seq)
      );
      for (const tc of toolCallsWithoutChunks) {
        const elementId = `TOOL_CALL-${tc.seq}`;
        elements.push(
          <div
            key={`tc-wrapper-orphan-${tc.call_id}`}
            ref={(el) => setElementRef(elementId, el)}
            data-element-id={elementId}
          >
            <ToolCallCard
              toolCall={tc}
              isSelected={selectedTimelineId === `TOOL_CALL-${tc.seq}`}
              onClick={() => onToolCardClick(tc.seq)}
            />
          </div>
        );
      }
    }

    return elements;
  };

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
              <div className="bg-blue-600 rounded-lg px-4 py-2 max-w-[70%]" data-element-id={`USER_MESSAGE-${msg.id}`}>
                <div className="text-white text-sm whitespace-pre-wrap">{msg.content}</div>
              </div>
            ) : (
              <div className="space-y-2 max-w-[85%] min-w-0">
                {renderAgentContent(msg)}
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
