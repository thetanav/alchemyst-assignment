Project structure:
agent-console/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main 3-panel layout (Chat | Timeline | Context)
│   │   ├── globals.css       # Tailwind v4 styles
│   │   └── layout.tsx        # Root layout with Geist fonts
│   ├── components/
│   │   ├── ChatPanel.tsx     # Streaming chat with block-based rendering
│   │   ├── ToolCallCard.tsx  # Tool call display with waiting/complete states
│   │   ├── TimelinePanel.tsx # Agent trace timeline with filtering
│   │   ├── ContextPanel.tsx  # Context inspector with diff, scrubber, lazy tree
│   │   └── ConnectionStatus.tsx # Non-blocking reconnection badge
│   └── lib/
│       ├── types.ts          # TypeScript types for protocol (no `any`)
│       ├── sequence-buffer.ts # Seq-based ordering, dedup, gap filling
│       ├── useAgentWebSocket.ts # WebSocket hook with reconnection, heartbeat, state recovery
│       └── contextDiff.ts    # Depth-limited JSON diff engine (safe for 500KB+)
├── tests/
│   └── sequence-buffer.test.ts # 13 unit tests (ordering, dedup, gaps, reset, interleaving)
├── vitest.config.ts
├── next.config.ts
├── package.json
├── README.md                 # App documentation with state machine diagram
├── DECISIONS.md              # Architecture decisions and design rationale
├── AGENTS.md                 # Next.js version warning
└── CLAUDE.md                 # Points to AGENTS.md

Key features implemented:
- WebSocket connection with exponential backoff reconnection (500ms → 10s cap)
- DOM-consumed seq tracking for accurate RESUME.last_seq
- PONG response to every PING (handles empty/corrupt challenge)
- TOOL_ACK sent for each TOOL_CALL
- SequenceBuffer for out-of-order delivery, deduplication, and gap filling
- Block-based streaming rendering (no layout shift on tool call interruptions)
- Tool call cards with waiting (animate-pulse) and complete states
- Timeline panel with batch-grouped tokens, filter by type, search by content
- Bidirectional highlighting between timeline and chat
- Context inspector with depth-limited JSON tree, history scrubber, and computed diffs
- Chaos survival: connection drops, reordering, duplicates, oversized payloads, corrupt heartbeats

To run:
# Start agent server (normal mode)
docker build -t agent-server ./agent-server
docker run -p 4747:4747 agent-server

# Start agent server (chaos mode)
docker run -p 4747:4747 agent-server --mode chaos

# Run Next.js app
cd agent-console
npm run dev

# Run tests
npm test
