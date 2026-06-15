'use client';

interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'connected') return null;

  const statusConfig = {
    connecting: { color: 'bg-yellow-500', text: 'Connecting...' },
    connected: { color: 'bg-green-500', text: 'Connected' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected' },
    reconnecting: { color: 'bg-yellow-500', text: 'Reconnecting...' },
  };

  const config = statusConfig[status];

  return (
    <div className="absolute top-2 right-2 z-50 flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700 shadow-lg">
      <div className={`w-2 h-2 rounded-full ${config.color} animate-pulse`} />
      <span className="text-xs text-gray-400">{config.text}</span>
    </div>
  );
}
