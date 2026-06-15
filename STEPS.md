Project structure:
agent-console/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main layout
│   │   ├── globals.css       # Tailwind styles
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ChatPanel.tsx     # Streaming chat with tool calls
│   │   ├── ToolCallCard.tsx  # Tool call display with status
│   │   ├── TimelinePanel.tsx # Agent trace timeline
│   │   ├── ContextPanel.tsx  # Context inspector with scrubber
│   │   └── ConnectionStatus.tsx
│   └── lib/
│       ├── types.ts          # TypeScript types for protocol
│       └── useAgentWebSocket.ts  # WebSocket hook with reconnection

Key features implemented:
- WebSocket connection with exponential backoff reconnection
- RESUME message on reconnect with last_seq
- PONG response to PING (handles empty challenge)
- TOOL_ACK sent for each TOOL_CALL
- Deduplication by seq number
- Out-of-order message buffering
- Streaming token rendering
- Tool call cards with wait/complete states
- Timeline panel showing all protocol events
- Context inspector with history scrubber

To run:
# Start agent server
docker build -t agent-server ./agent-server
docker run -p 4747:4747 agent-server

# Run Next.js app
cd agent-console
npm run dev
