# Agent Console

A real-time AI agent monitoring interface built for the Alchemyst AI Full Stack Engineer assignment. Connects to a WebSocket-based mock agent backend, streams token-by-token responses with mid-stream tool call interruptions, renders a live protocol trace timeline, and survives chaos mode without crashing or losing state.

## Architecture

The app treats every server message as a node in a **globally ordered sequence**. A `SequenceBuffer` (separate testable class) handles out-of-order delivery, deduplication, and gap filling. The render layer uses **block-based streaming** — the response is a sequence of `TextBlock | ToolCallBlock` elements, so tool call interruptions freeze text in place without layout shift or flicker.

State flow: `WebSocket → SequenceBuffer → State Updates → React Reconciliation`

## Quick Start

```bash
# 1. Start the agent server
cd ../agent-server
docker build -t agent-server .
docker run -p 4747:4747 agent-server

# 2. In another terminal, start the app
cd ../agent-console
npm install
npm run dev

# 3. Open http://localhost:3000
```

### Chaos Mode

```bash
docker run -p 4747:4747 agent-server --mode chaos
```

### Running Tests

```bash
npm test
```

## Features

- **Streaming Chat** — Tokens render incrementally as they arrive. Tool calls interrupt mid-stream and resume seamlessly.
- **Tool Call Cards** — Visual cards showing tool name, arguments, and results with waiting/complete states.
- **Agent Trace Timeline** — Every protocol event logged in real time. Token batches are grouped. Filter by type or search by content. Bidirectional linking with chat elements.
- **Context Inspector** — JSON tree view of context snapshots with computed diffs between consecutive snapshots. History scrubber to step through snapshots. Handles 500KB+ payloads via lazy rendering and depth-limited diffing.
- **Chaos Survival** — Exponential backoff reconnection (500ms → 10s), out-of-order message buffering, deduplication, corrupt heartbeat handling, and oversized payload handling.

## Technical Choices

- **Framework:** Next.js 16 (App Router)
- **State:** React `useState` with refs for the SequenceBuffer (no external state library — the buffer is a pure data structure, not UI state)
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest (13 tests for SequenceBuffer covering ordering, dedup, gaps, resets, and interleaved tool calls)
- **Protocol:** Native WebSocket — no SDK, no chat library, no `ai` helpers

## Screenshots

Take these screenshots with the agent-server running in **normal mode** and the app open at `http://localhost:3000`:

1. Send a message like "Summarise the Q3 report" — screenshot the chat panel showing a tool call card mid-stream
2. Open the timeline panel — screenshot showing the filter bar, batch-grouped tokens, and linked TOOL_CALL / TOOL_RESULT rows
3. After the response completes, click through context snapshots in the context inspector — screenshot showing the diff view

| Streaming with Tool Call | Trace Timeline | Context Inspector |
|---|---|---|
| _(add screenshot)_ | _(add screenshot)_ | _(add screenshot)_ |

## State Machine

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    v                                      │
          ┌─────────────────┐                              │
    ┌────>│   DISCONNECTED  │                              │
    │     └────────┬────────┘                              │
    │              │ connect()                             │
    │              v                                       │
    │     ┌─────────────────┐     ws.open   ┌───────────┐  │
    │     │   CONNECTING    │──────────────>│ CONNECTED  │  │
    │     └─────────────────┘               └─────┬─────┘  │
    │                                              │        │
    │     ┌─────────────────┐     ws.close         │        │
    │     │  RECONNECTING   │<─────────────────────┘        │
    │     └────────┬────────┘   (send RESUME last_seq)      │
    │              │                                        │
    │              └────────────────────────────────────────┘
    │              exponential backoff (500ms → 10s cap)
    └──────────────┘
```

## Chaos Mode Screen Recording

**Required for submission.** Record 3–5 minutes of the app running against `--mode chaos`.

Capture these five scenarios, labelled as they happen:

1. **Connection drop mid-stream** — The agent is streaming tokens, the connection dies, the app reconnects, and the response continues seamlessly.
2. **Out-of-order messages** — Tokens arrive with shuffled `seq` values. Verify text renders correctly despite the shuffle.
3. **Rapid tool calls** — Two tool calls fire in quick succession. Both cards appear, both results land, and streaming resumes without duplication.
4. **Oversized context snapshot** — A 500KB+ context snapshot arrives. The context panel renders without freezing the chat.
5. **Corrupt heartbeat** — A PING with an empty challenge arrives. The app does not crash or disconnect.

Upload to YouTube (unlisted) or Loom and include the link in your submission email.

**Recording link:** _(paste link here)_
