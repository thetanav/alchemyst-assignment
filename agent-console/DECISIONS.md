# Architecture Decisions

## Sequence-Based Ordering and Deduplication

### Data Structure: `Map<number, ServerMessage>` + `Set<number>`

I use two structures:
- A **`Map<number, ServerMessage>`** (ordered buffer) holds out-of-order messages.
- A **`Set<number>`** (processed set) tracks every seq that has been fully consumed by the render pipeline.

**Why not an array?** A Map gives O(1) insert and delete by seq. Since seq values can be sparse (gaps during chaos mode), an array would waste space or require compaction. A Map also preserves insertion order, which helps debugging.

**How it works:**
1. Every incoming message goes through `SequenceBuffer.tryProcess()`.
2. If `msg.seq === highestProcessed + 1`, it is processed immediately, then `flush()` drains any contiguous buffered messages.
3. If `msg.seq > highestProcessed + 1`, it is buffered.
4. Duplicates (seq already in `processed`) are dropped silently.

**Why this survives chaos mode:** Because we never assume in-order delivery. The buffer holds out-of-order messages until their predecessor arrives. After reconnect, the server replays everything after `last_seq`; the client's dedup set ensures no message is applied twice.

## Preventing Layout Shift During Tool Calls

### Strategy: Block-Based Rendering

The central insight is that a streaming response is **not a string** — it is a sequence of blocks:

```
TextBlock → ToolCallBlock → TextBlock → ToolCallBlock → ToolResultBlock → TextBlock
```

Each `StreamBlock` is rendered independently. When a `TOOL_CALL` arrives:

1. The current `TextBlock` is **finalised** (its text stops growing). No mutation, no replacement — the React element stays mounted with the same key.
2. A `ToolCallBlock` is **appended** after it. A new empty `TextBlock` is appended after that.
3. React reconciles by key — no re-mounting, no layout shift.

**CSS:** The tool card is rendered as a regular block element (`<div>`) in the normal flow. No absolute positioning, no transforms, no height animations. The text block above it already has its final height, so the card simply pushes subsequent content down — which is invisible because the card appears at the insertion point instantly.

**Why not `contentEditable` or mutation-based rendering?** Those approaches cause flicker because React reconciles by replacing innerHTML or manipulating text nodes. Block-based rendering uses stable keys; React only inserts the new `<div>` without touching existing DOM nodes.

## Reconnection State Recovery

### Tracking: DOM-Consumed vs. Socket-Received

The critical distinction:

- **Socket-received** — the WebSocket `onmessage` fired.
- **DOM-consumed** — the message was processed and its effect is visible in the render tree.

We track DOM-consumed state via `SequenceBuffer.highestSeq`. This value is what we send in `RESUME.last_seq`. The socket may have received more messages than the DOM has consumed (e.g., messages buffered but not yet flushed), but `highestSeq` only advances when a message is actually processed through the state pipeline.

**Reconnect flow:**
```
Disconnect detected → show non-blocking indicator
     ↓
Exponential backoff (500ms, 1s, 2s, ... 10s cap)
     ↓
WebSocket open → send RESUME { last_seq: highestSeq }
     ↓
Server replays all events after last_seq
     ↓
Each replayed event enters the SequenceBuffer normally
     ↓
If already processed (dedup set), silently dropped
     ↓
New events fill any gaps and flush to the render pipeline
```

**Why this works:** The server replays a contiguous block of events. The client's buffer + dedup handles any out-of-order or duplicate replay. The render state is never "reset" or "cleared" — we only add to it.

### The Hidden Race Condition: TOOL_ACK Timeout

The assignment hints at a protocol race condition. Here it is:

1. Server sends `TOOL_CALL` (seq 5).
2. Client sends `TOOL_ACK` for `call_id`.
3. Connection drops.
4. Server has a 5-second timeout for `TOOL_ACK`. It hasn't received it (drop), so after 5s it sends `TOOL_RESULT` anyway.
5. Client reconnects, sends `RESUME { last_seq: 5 }`.
6. Server replays `TOOL_RESULT` (seq 6).
7. But it also **replays `TOOL_CALL`** (seq 5) because the server replays *everything after* `last_seq`.

**How we handle it:** Our dedup by seq (`processedSeqs.has(5)`) drops the replayed `TOOL_CALL`. The `TOOL_RESULT` (seq 6) arrives in-order, is processed, and updates the tool card. The tool card was left in "waiting" state during disconnect, so the result transitions it to "complete". No duplicate tool card appears.

If the tool card had been fully rendered and acknowledged before the drop, but the result arrives during replay, the same mechanism applies — the result updates the existing tool card by `call_id`.

## Scaling to 50 Concurrent Agent Streams

### What Would Change

1. **Virtualisation in the Chat Panel.** Currently, all messages are rendered unconditionally. For 50 streams, I would use `react-window` to virtualise the message list and lazy-load older messages.

2. **Stream Aggregation per Stream.** Instead of a single flat chat, each stream would get its own `StreamState` — which we already have (`Map<string, StreamState>`). The UI would show a sidebar listing active streams and a focused view for one stream at a time.

3. **Rate-Limited State Updates.** With 50 streams at 30 tokens/sec each = 1500 state updates/sec. I would batch updates using `unstable_batchedUpdates` or a scheduler that coalesces per-stream updates into 60fps frames.

4. **Separate WebSocket per Stream?** Depends on the server architecture. If one connection handles multiple streams, the SequenceBuffer already works. If each stream needs its own connection, we'd have a `ConnectionManager` per stream.

5. **Memory Bounds.** The timeline would need a cap (last 10,000 events per stream) with oldest entries evicted. The context snapshot history would cap at 20 snapshots per context.

## Scaling to 100x Longer Responses

### What Would Change

1. **Incremental Rendering with Virtual Scrolling.** For a full document (100K+ tokens), rendering every token as a block would create 1000+ DOM nodes. I would render only the visible window using IntersectionObserver, with placeholders above/below.

2. **Lazy Token Loading.** The timeline's token batch expansion would cap at a preview (first 500 chars) and load the full text on demand.

3. **Buffered Diffing for Context.** For a 50MB context snapshot, computing a diff on every change would block the main thread. I would:
   - Use Web Workers for diff computation.
   - Use structural sharing (Immer-style) to compare only modified paths.
   - Display only the diff, not the full snapshot, by default.

4. **Streaming to Disk (in Browser).** For extremely long responses, the full text could be streamed to IndexedDB or the File System Access API, with only the tail rendered.

## Additional Failure Mode Identified

**PING/PONG Race on Reconnect:** If the server sends a PING immediately after the client reconnects, but before the client sends RESUME, the PING's seq may be ambiguous. Our SequenceBuffer handles this because the PING has a seq; if it arrives out of order, it is buffered. The RESUME is sent synchronously in `ws.onopen`, before any server messages are processed, so the server has the resume position before reacting to PONGs.

**Empty Context Snapshot in Chaos Mode:** Chaos mode can send `CONTEXT_SNAPSHOT` with `data: {}` or massive payloads. We handled the large case (lazy JSON tree with depth/width limits). The empty case is fine — the diff shows "No changes" and the tree renders `{}`.

## State Machine

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    v                                              │
          ┌─────────────────┐                                      │
    ┌────>│   DISCONNECTED  │                                      │
    │     └────────┬────────┘                                      │
    │              │ connect()                                     │
    │              v                                               │
    │     ┌─────────────────┐     ws.open      ┌──────────────┐    │
    │     │   CONNECTING    │──────────────────>│  CONNECTED   │    │
    │     └─────────────────┘                   └──────┬───────┘    │
    │                                                  │            │
    │     ┌─────────────────┐     ws.close             │            │
    │     │  RECONNECTING   │<─────────────────────────┘            │
    │     └────────┬────────┘     (with seq > 0 → send RESUME)      │
    │              │                                                │
    │              └────────────────────────────────────────────────┘
    │              exponential backoff
    │              500ms → 1s → 2s → 4s → 8s → 10s (cap)
    └──────────────┘

    CONNECTED substates:

    ┌───────────┐     TOKEN        ┌───────────┐     TOOL_CALL
    │ STREAMING │────────────────>│ TOOL_PEND │────────────────>│
    │  (idle)   │<────────────────│   -ING    │     TOOL_RESULT │
    └───────────┘     TOOL_RESULT └───────────┘<────────────────┘
         │                                                │
         │      STREAM_END                                │
         v                                                v
    ┌───────────┐                                   ┌───────────┐
    │  COMPLETE │                                   │   IDLE    │
    └───────────┘                                   └───────────┘
```

## File Structure

```
src/
├── lib/
│   ├── types.ts               # All TypeScript types (no `any` escape hatch needed)
│   ├── sequence-buffer.ts     # Seq-based ordering, dedup, flush
│   ├── useAgentWebSocket.ts   # WebSocket lifecycle, message routing, reconnect
│   └── contextDiff.ts         # Depth-limited JSON diff (safe for 500KB+ payloads)
├── components/
│   ├── ChatPanel.tsx          # Streaming chat with block-based rendering
│   ├── ToolCallCard.tsx       # Tool call card (waiting → complete states)
│   ├── TimelinePanel.tsx      # Protocol event timeline with filtering
│   ├── ContextPanel.tsx       # Context inspector with LazyJsonTree + scrubber
│   └── ConnectionStatus.tsx   # Non-blocking reconnection indicator
├── app/
│   ├── page.tsx               # Main layout (3-panel: chat + timeline + context)
│   ├── layout.tsx             # Root layout
│   └── globals.css            # Tailwind imports
tests/
└── sequence-buffer.test.ts    # 13 tests: ordering, dedup, gaps, reset, interleaving
```
