'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SequenceBuffer } from './sequence-buffer';
import type {
  ServerMessage,
  ClientMessage,
  StreamState,
  TimelineEvent,
  ContextSnapshot,
  ChatMessage,
  ConnectionStatus,
  StreamBlock,
  ToolCall,
} from './types';

const WS_URL = 'ws://localhost:4747/ws';
const MAX_RECONNECT_DELAY = 10000;
const INITIAL_RECONNECT_DELAY = 500;

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

let localIdCounter = 0;
function timelineId(type: string, seq?: number, suffix?: string): string {
  return `${type}-${seq ?? `local-${++localIdCounter}`}${suffix ? '-' + suffix : ''}`;
}

export function useAgentWebSocket(): UseAgentWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstConnectRef = useRef(true);
  const seqBufRef = useRef(new SequenceBuffer());
  const domConsumedSeqRef = useRef(0);

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
          id: timelineId(event.type, event.seq),
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
        addTimelineEvent({ type: 'PONG', content: `Echoed: ${JSON.stringify(challenge)}` });
      }
    },
    [addTimelineEvent]
  );

  const sendToolAck = useCallback(
    (callId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: 'TOOL_ACK', call_id: callId };
        wsRef.current.send(JSON.stringify(msg));
        addTimelineEvent({ type: 'TOOL_ACK', content: `Acknowledged: ${callId}`, call_id: callId });
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

  const processMessages = useCallback(
    (msgs: ServerMessage[]) => {
      for (const msg of msgs) {
        addTimelineEvent({
          type: msg.type,
          seq: msg.seq,
          content: getEventContent(msg),
          data: msg,
          call_id: msg.call_id,
          stream_id: msg.stream_id,
        });

        switch (msg.type) {
          case 'TOKEN': {
            const streamId = msg.stream_id || 'default';
            const text = msg.text || '';
            setStreams((prev) => {
              const next = new Map(prev);
              const existing = next.get(streamId) || {
                stream_id: streamId,
                blocks: [],
                isComplete: false,
              };
              const blocks = [...existing.blocks];
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock && lastBlock.kind === 'text') {
                blocks[blocks.length - 1] = {
                  kind: 'text',
                  id: lastBlock.id,
                  text: lastBlock.text + text,
                  stream_id: streamId,
                };
              } else {
                blocks.push({
                  kind: 'text',
                  id: `text-${streamId}-${blocks.length}`,
                  text,
                  stream_id: streamId,
                });
              }
              next.set(streamId, { ...existing, blocks });
              return next;
            });

            setMessages((prev) => {
              const existing = prev.find(
                (m) => m.streamId === streamId && m.role === 'agent'
              );
              if (existing) {
                return prev.map((m) =>
                  m.id === existing.id
                    ? { ...m, content: m.content + text }
                    : m
                );
              }
              return [
                ...prev,
                {
                  id: `agent-${streamId}`,
                  role: 'agent' as const,
                  content: text,
                  streamId,
                  timestamp: Date.now(),
                },
              ];
            });
            break;
          }

          case 'TOOL_CALL': {
            const streamId = msg.stream_id || 'default';
            const tc: ToolCall = {
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
                blocks: [],
                isComplete: false,
              };
              const blocks: StreamBlock[] = [
                ...existing.blocks,
                {
                  kind: 'tool-call',
                  id: `tc-${msg.call_id}`,
                  call: tc,
                },
              ];
              next.set(streamId, { ...existing, blocks });
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
              if (!existing) return next;
              const blocks = existing.blocks.map((b) => {
                if (
                  b.kind === 'tool-call' &&
                  b.call.call_id === msg.call_id &&
                  msg.result !== undefined
                ) {
                  return {
                    kind: 'tool-call' as const,
                    id: b.id,
                    call: { ...b.call, result: msg.result },
                  };
                }
                return b;
              });
              next.set(streamId, { ...existing, blocks });
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
      }
    },
    [addTimelineEvent, sendPong, sendToolAck]
  );

  const processMessagesRef = useRef(processMessages);

  useEffect(() => {
    processMessagesRef.current = processMessages;
  }, [processMessages]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as ServerMessage;
      const seqBuf = seqBufRef.current;

      if (msg.seq === undefined) {
        processMessagesRef.current([msg]);
        return;
      }

      const toProcess = seqBuf.tryProcess(msg);
      if (toProcess.length > 0) {
        processMessagesRef.current(toProcess);
        const maxSeq = toProcess.reduce(
          (max, m) => (m.seq !== undefined && m.seq > max ? m.seq : max),
          domConsumedSeqRef.current
        );
        domConsumedSeqRef.current = maxSeq;
      }
    } catch {
      console.error('Failed to parse message');
    }
  }, []);

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

        const lastSeq = domConsumedSeqRef.current;
        if (lastSeq > 0) {
          const resumeMsg: ClientMessage = {
            type: 'RESUME',
            last_seq: lastSeq,
          };
          ws.send(JSON.stringify(resumeMsg));
          addTimelineEvent({
            type: 'RESUME',
            content: `Resuming from seq ${lastSeq}`,
          });
        }
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
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [addTimelineEvent, handleMessage]);

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
