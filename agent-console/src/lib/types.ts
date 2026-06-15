export type ServerMessageType =
  | 'TOKEN'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'CONTEXT_SNAPSHOT'
  | 'PING'
  | 'STREAM_END'
  | 'ERROR';

export type ClientMessageType = 'USER_MESSAGE' | 'PONG' | 'RESUME' | 'TOOL_ACK';

export interface ServerMessage {
  type: ServerMessageType;
  seq: number;
  stream_id?: string;
  text?: string;
  call_id?: string;
  tool_name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  context_id?: string;
  data?: unknown;
  challenge?: string;
  code?: string;
  message?: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  content?: string;
  echo?: string;
  last_seq?: number;
  call_id?: string;
}

export interface ToolCall {
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  stream_id: string;
  seq: number;
  result?: unknown;
}

export interface TextChunk {
  id: string;
  text: string;
  stream_id: string;
  beforeToolCallSeq?: number;
}

export interface StreamState {
  stream_id: string;
  chunks: TextChunk[];
  toolCalls: ToolCall[];
  isComplete: boolean;
}

export interface TimelineEvent {
  id: string;
  type: ServerMessageType | 'PONG' | 'USER_MESSAGE' | 'TOOL_ACK' | 'RESUME';
  seq?: number;
  content: string;
  timestamp: number;
  data?: unknown;
}

export interface TokenBatch {
  id: string;
  tokens: TimelineEvent[];
  startTime: number;
  endTime: number;
}

export interface ContextSnapshot {
  context_id: string;
  data: unknown;
  seq: number;
  timestamp: number;
}

export interface ContextDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  streamId?: string;
  timestamp: number;
}
