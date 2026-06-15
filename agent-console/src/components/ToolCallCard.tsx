'use client';

import type { ToolCall } from '@/lib/types';

interface ToolCallCardProps {
  toolCall: ToolCall;
  isSelected: boolean;
  onClick: () => void;
}

export function ToolCallCard({ toolCall, isSelected, onClick }: ToolCallCardProps) {
  const hasResult = toolCall.result !== undefined;

  return (
    <div
      data-element-id={`TOOL_CALL-${toolCall.seq}`}
      onClick={onClick}
      className={`rounded-lg border p-3 cursor-pointer transition-colors min-h-[80px] ${
        isSelected
          ? 'border-blue-500 bg-blue-900/30'
          : 'border-gray-600 bg-gray-800 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-yellow-400 font-mono text-sm">Tool</span>
        <span className="font-medium text-yellow-400">{toolCall.tool_name}</span>
        {hasResult && (
          <span className="text-green-400 text-xs ml-auto">Complete</span>
        )}
        {!hasResult && (
          <span className="text-gray-400 text-xs ml-auto animate-pulse">Waiting...</span>
        )}
      </div>

      <div className="text-xs text-gray-400 mb-2">
        <span className="text-gray-500">Args:</span>{' '}
        <code className="bg-gray-900 px-1 rounded break-all">
          {JSON.stringify(toolCall.args)}
        </code>
      </div>

      {hasResult && (
        <div className="text-xs text-green-300 bg-gray-900 rounded p-2 mt-2">
          <span className="text-gray-500">Result:</span>{' '}
          <code className="break-all">{JSON.stringify(toolCall.result)}</code>
        </div>
      )}
    </div>
  );
}
