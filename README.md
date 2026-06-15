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

Taken screenshots with the agent-server running in **normal mode** and the app open at `http://localhost:3000`:

<img width="1918" height="943" alt="image" src="https://github.com/user-attachments/assets/e89750ca-359d-410d-954f-c59f34c8e481" />


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

Scenario 1 — Connection drop mid-stream → "write a long detailed document about database architecture"
- Triggers a long multi-token response; connection drops randomly after 15-45 messages → reconnect + seamless resume shown
Scenario 2 — Out-of-order messages → "give me a detailed summary of Q3 earnings"
- Long token stream; chaos engine shuffles seq values → your reorder buffer renders correctly
Scenario 3 — Rapid tool calls → "analyze and compare the datasets"
- Triggers 2 tool calls (fetch_dataset + compute_correlation) in quick succession → both cards appear, results land, stream resumes
Scenario 4 — Oversized context snapshot → "show me the database schema for the large dataset"
- Triggers a ~550KB context snapshot → context panel renders without freezing
Scenario 5 — Corrupt heartbeat → Let the app sit idle for ~20-30s after any prompt

**Recording link:** _(paste link here)_
