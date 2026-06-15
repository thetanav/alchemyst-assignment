'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ServerMessage,
  ClientMessage,
  StreamState,
  TimelineEvent,
  ContextSnapshot,
  ChatMessage,
} from './types';

const WS_URL = 'ws://localhost:4747/ws';
const MAX_RECONNECT_DELAY = 10000;
const INITIAL_RECONNECT_DELAY = 500;

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface UseAgentWebSocketReturn {
  streams: Map<string, StreamState>;
  messages: ChatMessage[];
  timeline: TimelineEvent[];
  contexts: ContextSnapshot[];
  connectionStatus: ConnectionStatus;
  sendMessage: (content: string) => void;
  selectedTimelineId: string | null;
  setSelectedTimelineId: (id: string | null) => void;
  highlightElementId: string | null;
  setHighlightElementId: (id: string | null) => void;
}

export function useAgentWebSocket(): UseAgentWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedSeqRef = useRef(0);
  const processedSeqsRef = useRef(new Set<number>());
  const reorderBufferRef = useRef(new Map<number, ServerMessage>());
  const isFirstConnectRef = useRef(true);

  const [streams, setStreams] = useState<Map<string, StreamState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [contexts, setContexts] = useState<ContextSnapshot[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [highlightElementId, setHighlightElementId] = useState<string | null>(null);

  const addTimelineEvent = useCallback(
    (event: Omit<TimelineEvent, 'id' | 'timestamp'>) => {
      setTimeline((prev) => [
        ...prev,
        {
          ...event,
          id: `${event.type}-${event.seq ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  const sendPong = useCallback(
    (challenge: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: 'PONG', echo: challenge };
        wsRef.current.send(JSON.stringify(msg));
        addTimelineEvent({ type: 'PONG', content: `Echoed: ${challenge}` });
      }
    },
    [addTimelineEvent]
  );

  const sendToolAck = useCallback(
    (callId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: 'TOOL_ACK', call_id: callId };
        wsRef.current.send(JSON.stringify(msg));
        addTimelineEvent({ type: 'TOOL_ACK', content: `Acknowledged: ${callId}` });
      }
    },
    [addTimelineEvent]
  );

  function getEventContent(msg: ServerMessage): string {
    switch (msg.type) {
      case 'TOKEN':
        return msg.text || '';
      case 'TOOL_CALL':
        return `Tool: ${msg.tool_name} (${msg.call_id})`;
      case 'TOOL_RESULT':
        return `Result for: ${msg.call_id}`;
      case 'CONTEXT_SNAPSHOT':
        return `Context: ${msg.context_id}`;
      case 'PING':
        return `Challenge: ${msg.challenge || '(empty/corrupt)'}`;
      case 'STREAM_END':
        return `Stream ended: ${msg.stream_id}`;
      case 'ERROR':
        return `Error: ${msg.code} - ${msg.message}`;
      default:
        return JSON.stringify(msg);
    }
  }

  const processMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.seq !== undefined && processedSeqsRef.current.has(msg.seq)) {
        return;
      }
      if (msg.seq !== undefined) {
        processedSeqsRef.current.add(msg.seq);
        if (msg.seq > lastProcessedSeqRef.current) {
          lastProcessedSeqRef.current = msg.seq;
        }
      }

      addTimelineEvent({
        type: msg.type,
        seq: msg.seq,
        content: getEventContent(msg),
        data: msg,
      });

      switch (msg.type) {
        case 'TOKEN': {
          const streamId = msg.stream_id || 'default';
          setStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(streamId) || {
              stream_id: streamId,
              chunks: [{ id: `chunk-init-${streamId}`, text: '', stream_id: streamId }],
              toolCalls: [],
              isComplete: false,
            };
            const updatedChunks = [...existing.chunks];
            const lastIdx = updatedChunks.length - 1;
            updatedChunks[lastIdx] = {
              ...updatedChunks[lastIdx],
              text: updatedChunks[lastIdx].text + (msg.text || ''),
            };
            next.set(streamId, { ...existing, chunks: updatedChunks });
            return next;
          });

          setMessages((prev) => {
            const streamId = msg.stream_id || 'default';
            const existing = prev.find((m) => m.streamId === streamId && m.role === 'agent');
            if (existing) {
              return prev.map((m) =>
                m.id === existing.id ? { ...m, content: m.content + (msg.text || '') } : m
              );
            }
            return [
              ...prev,
              {
                id: `agent-${streamId}-${Date.now()}`,
                role: 'agent' as const,
                content: msg.text || '',
                streamId,
                timestamp: Date.now(),
              },
            ];
          });
          break;
        }

        case 'TOOL_CALL': {
          const streamId = msg.stream_id || 'default';
          const toolCall = {
            call_id: msg.call_id || '',
            tool_name: msg.tool_name || '',
            args: (msg.args || {}) as Record<string, unknown>,
            stream_id: streamId,
            seq: msg.seq,
          };

          setStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(streamId) || {
              stream_id: streamId,
              chunks: [{ id: `chunk-init-${streamId}`, text: '', stream_id: streamId }],
              toolCalls: [],
              isComplete: false,
            };

            const updatedChunks = [...existing.chunks];
            const lastChunk = updatedChunks[updatedChunks.length - 1];

            updatedChunks[updatedChunks.length - 1] = {
              ...lastChunk,
              beforeToolCallSeq: msg.seq,
            };

            updatedChunks.push({
              id: `chunk-after-${msg.call_id}`,
              text: '',
              stream_id: streamId,
            });

            next.set(streamId, {
              ...existing,
              chunks: updatedChunks,
              toolCalls: [...existing.toolCalls, toolCall],
            });
            return next;
          });

          setTimeout(() => sendToolAck(msg.call_id || ''), 100);
          break;
        }

        case 'TOOL_RESULT': {
          const streamId = msg.stream_id || 'default';
          setStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(streamId);
            if (existing) {
              next.set(streamId, {
                ...existing,
                toolCalls: existing.toolCalls.map((tc) =>
                  tc.call_id === msg.call_id ? { ...tc, result: msg.result } : tc
                ),
              });
            }
            return next;
          });
          break;
        }

        case 'CONTEXT_SNAPSHOT':
          setContexts((prev) => [
            ...prev,
            {
              context_id: msg.context_id || '',
              data: msg.data,
              seq: msg.seq ?? 0,
              timestamp: Date.now(),
            },
          ]);
          break;

        case 'PING':
          sendPong(msg.challenge || '');
          break;

        case 'STREAM_END': {
          const streamId = msg.stream_id || 'default';
          setStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(streamId);
            if (existing) {
              next.set(streamId, { ...existing, isComplete: true });
            }
            return next;
          });
          break;
        }

        case 'ERROR':
          console.error('Server error:', msg.code, msg.message);
          break;
      }
    },
    [addTimelineEvent, sendPong, sendToolAck]
  );

  const processMessageRef = useRef(processMessage);
  const flushReorderBufferRef = useRef<() => void>(() => {});

  useEffect(() => {
    processMessageRef.current = processMessage;
  }, [processMessage]);

  const flushReorderBuffer = useCallback(() => {
    const buffer = reorderBufferRef.current;
    let expected = lastProcessedSeqRef.current + 1;

    let found = true;
    while (found) {
      found = false;
      for (let seq = expected; ; seq++) {
        if (buffer.has(seq)) {
          const msg = buffer.get(seq)!;
          buffer.delete(seq);
          processMessageRef.current(msg);
          expected = seq + 1;
          found = true;
        } else {
          break;
        }
      }
    }
  }, []);

  useEffect(() => {
    flushReorderBufferRef.current = flushReorderBuffer;
  }, [flushReorderBuffer]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as ServerMessage;

      if (msg.seq !== undefined && processedSeqsRef.current.has(msg.seq)) {
        return;
      }

      if (msg.seq === undefined) {
        processMessageRef.current(msg);
        return;
      }

      if (msg.seq === lastProcessedSeqRef.current + 1) {
        processMessageRef.current(msg);
        flushReorderBufferRef.current();
      } else if (msg.seq > lastProcessedSeqRef.current + 1) {
        reorderBufferRef.current.set(msg.seq, msg);
      }
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  }, []);

  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      setConnectionStatus(isFirstConnectRef.current ? 'connecting' : 'reconnecting');

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        isFirstConnectRef.current = false;
        setConnectionStatus('connected');
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

        if (lastProcessedSeqRef.current > 0) {
          const resumeMsg: ClientMessage = {
            type: 'RESUME',
            last_seq: lastProcessedSeqRef.current,
          };
          ws.send(JSON.stringify(resumeMsg));
          addTimelineEvent({
            type: 'RESUME',
            content: `Resuming from seq ${lastProcessedSeqRef.current}`,
          });
        }

        flushReorderBufferRef.current();
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setConnectionStatus('disconnected');

        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );
          connectRef.current();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectRef.current = connect;
  }, [addTimelineEvent, handleMessage]);

  useEffect(() => {
    connectRef.current();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: 'USER_MESSAGE', content };
        wsRef.current.send(JSON.stringify(msg));
        addTimelineEvent({ type: 'USER_MESSAGE', content });
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [addTimelineEvent]
  );

  return {
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
  };
}
