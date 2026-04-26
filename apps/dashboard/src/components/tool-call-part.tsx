import type { ReactNode } from "react";
import { JsonView } from "@/components/json-view";

export interface MessagePart {
  createdAt?: unknown;
  durationMs?: unknown;
  elapsedMs?: unknown;
  errorText?: unknown;
  finishedAt?: unknown;
  input?: unknown;
  output?: unknown;
  startedAt?: unknown;
  state?: string;
  text?: string;
  toolName?: string;
  type?: string;
}

interface ToolCallPartProps {
  header?: ReactNode;
  input?: unknown;
  jsonMaxHeight?: number;
  output?: unknown;
}

export const ToolCallPart = ({
  header,
  input,
  jsonMaxHeight = 160,
  output,
}: ToolCallPartProps): React.JSX.Element => (
  <div className="rounded border border-border bg-bg-overlay p-2 text-xs">
    {header && <div className="flex items-center gap-2">{header}</div>}
    {input !== undefined && (
      <div className="mt-2 space-y-1">
        <span className="field-label">input</span>
        <JsonView maxHeight={jsonMaxHeight} value={input} />
      </div>
    )}
    {output !== undefined && (
      <div className="mt-2 space-y-1">
        <span className="field-label">output</span>
        <JsonView maxHeight={jsonMaxHeight} value={output} />
      </div>
    )}
  </div>
);
