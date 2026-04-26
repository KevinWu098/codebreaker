import { useEffect, useMemo, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { CopyTextButton } from "@/components/copy-text-button";
import { JsonView } from "@/components/json-view";
import type { MessagePart } from "@/components/tool-call-part";
import { formatDuration } from "@/lib/format";

interface MessagePartRendererProps {
  jsonMaxHeight?: number;
  part: MessagePart;
  partKey: string;
  role?: string;
  showTransientParts?: boolean;
  startedAt?: Date | null;
  variant: "live" | "static";
}

const TRANSIENT_PART_TYPES = new Set(["step-start"]);
const RUNNING_TOOL_STATES = new Set<string>([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
]);
const TOOL_RUNTIME_TICK_MS = 1000;
const TIME_FORMAT_OPTIONS = {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
} as const satisfies Intl.DateTimeFormatOptions;

export const isRenderableMessagePart = (
  part: MessagePart,
  showTransientParts = false
): boolean =>
  typeof part.type !== "string" ||
  !TRANSIENT_PART_TYPES.has(part.type) ||
  showTransientParts;

const isToolState = (state: string | undefined): state is ToolPart["state"] =>
  state === "input-streaming" ||
  state === "input-available" ||
  state === "approval-requested" ||
  state === "approval-responded" ||
  state === "output-available" ||
  state === "output-error" ||
  state === "output-denied";

const toolStateFor = (part: MessagePart): ToolPart["state"] => {
  if (isToolState(part.state)) {
    return part.state;
  }

  if (part.state === "result" || part.output !== undefined) {
    return "output-available";
  }

  if (part.state === "error") {
    return "output-error";
  }

  return part.input === undefined ? "input-streaming" : "input-available";
};

const serializeForClipboard = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
};

const toolCallClipboardText = (part: MessagePart): string =>
  serializeForClipboard({
    type: part.type,
    ...(part.toolName ? { toolName: part.toolName } : {}),
    ...(part.state ? { state: part.state } : {}),
    ...(part.input === undefined ? {} : { input: part.input }),
    ...(part.output === undefined ? {} : { output: part.output }),
    ...(part.errorText === undefined ? {} : { errorText: part.errorText }),
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const numberField = (
  source: Record<string, unknown>,
  keys: readonly string[]
): number | null => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const dateField = (
  source: Record<string, unknown>,
  keys: readonly string[]
): Date | null => {
  for (const key of keys) {
    const value = source[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return null;
};

const toolDurationMs = (part: MessagePart): number | null => {
  const sources = [part, part.output].filter(isRecord);
  for (const source of sources) {
    const duration = numberField(source, [
      "durationMs",
      "duration_ms",
      "elapsedMs",
      "elapsed_ms",
    ]);
    if (duration !== null) {
      return Math.max(0, duration);
    }
  }

  for (const source of sources) {
    const start = dateField(source, ["startedAt", "started_at", "createdAt"]);
    const end = dateField(source, [
      "finishedAt",
      "finished_at",
      "completedAt",
      "completed_at",
      "endedAt",
      "ended_at",
    ]);
    if (start && end) {
      return Math.max(0, end.getTime() - start.getTime());
    }
  }

  return null;
};

const ToolRuntime = ({
  part,
  startedAt,
  state,
}: {
  part: MessagePart;
  startedAt?: Date | null | undefined;
  state: ToolPart["state"];
}): React.JSX.Element | null => {
  const completedDurationMs = useMemo(() => toolDurationMs(part), [part]);
  const running = RUNNING_TOOL_STATES.has(state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!(running && completedDurationMs === null && startedAt)) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), TOOL_RUNTIME_TICK_MS);
    return () => clearInterval(timer);
  }, [completedDurationMs, running, startedAt]);

  const elapsedMs =
    completedDurationMs ??
    (running && startedAt ? Math.max(0, now - startedAt.getTime()) : null);

  if (elapsedMs === null) {
    return null;
  }

  const startedLabel = startedAt
    ? `started ${startedAt.toLocaleTimeString(undefined, TIME_FORMAT_OPTIONS)}`
    : null;
  const runtimeLabel = `${completedDurationMs === null ? "running" : "ran"} ${formatDuration(elapsedMs)}`;
  const label = startedLabel
    ? `${startedLabel} · ${runtimeLabel}`
    : runtimeLabel;

  return (
    <span
      className="font-mono text-muted-foreground text-xs"
      title={
        completedDurationMs === null && startedAt
          ? `started ${startedAt.toLocaleString()}`
          : undefined
      }
    >
      {label}
    </span>
  );
};

export const MessagePartRenderer = ({
  part,
  partKey: key,
  role,
  showTransientParts = false,
  startedAt,
  variant,
}: MessagePartRendererProps): React.ReactNode => {
  if (!isRenderableMessagePart(part, showTransientParts)) {
    return null;
  }

  if (part.type === "text" && typeof part.text === "string") {
    if (variant === "live" && role !== "user") {
      return <MessageResponse key={key}>{part.text}</MessageResponse>;
    }

    return (
      <div className="relative" key={key}>
        <div className="absolute inset-e-0 top-0 z-10">
          <CopyTextButton text={part.text} title="copy text" />
        </div>
        <p className="whitespace-pre-wrap pe-7 text-fg text-sm leading-relaxed">
          {part.text}
        </p>
      </div>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    const state = toolStateFor(part);
    return (
      <Tool className="relative" defaultOpen={variant === "live"} key={key}>
        <ToolHeader
          metadata={
            <ToolRuntime part={part} startedAt={startedAt} state={state} />
          }
          {...(part.toolName ? { title: part.toolName } : {})}
          state={state}
          type={part.type as `tool-${string}`}
        />
        <CopyTextButton
          className="absolute top-2.5 right-10 z-10 opacity-70 transition-opacity group-hover:opacity-100"
          text={toolCallClipboardText(part)}
          title="copy tool call"
        />
        <ToolContent>
          {part.input !== undefined && <ToolInput input={part.input} />}
          <ToolOutput
            errorText={
              typeof part.errorText === "string" ? part.errorText : undefined
            }
            output={part.output}
          />
        </ToolContent>
      </Tool>
    );
  }

  return <JsonView key={key} maxHeight={160} value={part} />;
};
