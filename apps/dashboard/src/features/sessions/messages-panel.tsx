import { ClipboardCopy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import {
  isRenderableMessagePart,
  MessagePartRenderer,
} from "@/components/message-part-renderer";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import type { MessagePart } from "@/components/tool-call-part";
import { useSessionMessagesQuery } from "@/hooks/queries";
import { formatRelativeTime } from "@/lib/format";

const parseSentAt = (value: string | number | undefined): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

interface MessagesPanelProps {
  sessionId: string;
}

interface Message {
  createdAt?: string | number;
  id?: string;
  parts?: readonly MessagePart[];
  role?: string;
}

const isMessage = (value: unknown): value is Message =>
  typeof value === "object" && value !== null;

const partKey = (
  message: Message,
  fallbackId: string,
  partIndex: number
): string => {
  const baseId = message.id ?? fallbackId;
  return `${baseId}:p${partIndex}`;
};

const messageKey = (message: Message, fallbackId: string): string =>
  message.id ?? fallbackId;

const renderPart = (
  part: MessagePart,
  key: string,
  startedAt: Date | null
): React.JSX.Element => (
  <MessagePartRenderer
    key={key}
    part={part}
    partKey={key}
    startedAt={startedAt}
    variant="static"
  />
);

const formatPartForClipboard = (part: MessagePart): string => {
  if (part.type === "text" && typeof part.text === "string") {
    return part.text;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    const name = part.toolName ?? "unknown_tool";
    const lines = [`[tool: ${name}]`];
    if (part.input !== undefined) {
      try {
        lines.push(`  input: ${JSON.stringify(part.input, null, 2)}`);
      } catch {
        lines.push(`  input: ${String(part.input)}`);
      }
    }
    if (part.output !== undefined) {
      try {
        lines.push(`  output: ${JSON.stringify(part.output, null, 2)}`);
      } catch {
        lines.push(`  output: ${String(part.output)}`);
      }
    }
    return lines.join("\n");
  }
  try {
    return JSON.stringify(part, null, 2);
  } catch {
    return String(part);
  }
};

const formatMessagesForClipboard = (messages: unknown[]): string => {
  const lines: string[] = [];
  for (const [idx, raw] of messages.entries()) {
    if (!isMessage(raw)) {
      lines.push(`--- message ${idx + 1} (unparsed) ---`);
      try {
        lines.push(JSON.stringify(raw, null, 2));
      } catch {
        lines.push(String(raw));
      }
      lines.push("");
      continue;
    }
    const role = raw.role ?? "assistant";
    lines.push(`--- ${role} ---`);
    if (raw.parts) {
      for (const part of raw.parts) {
        lines.push(formatPartForClipboard(part));
      }
    }
    lines.push("");
  }
  return lines.join("\n");
};

const CLIPBOARD_RESET_MS = 2000;

const useClipboardCopy = (
  getText: () => string
): { copied: boolean; copy: () => void } => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const copy = useCallback(() => {
    const text = getText();
    if (!text) {
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          setCopied(false);
          timerRef.current = undefined;
        }, CLIPBOARD_RESET_MS);
      },
      () => {
        /* clipboard unavailable */
      }
    );
  }, [getText]);

  return { copied, copy };
};

export const MessagesPanel = ({
  sessionId,
}: MessagesPanelProps): React.JSX.Element => {
  const messages = useSessionMessagesQuery(sessionId);

  const list = messages.data?.messages ?? [];
  const titleText =
    messages.data === undefined ? "messages" : `messages · ${list.length}`;

  const getClipboardText = useCallback(
    () => formatMessagesForClipboard(list),
    [list]
  );
  const { copied, copy } = useClipboardCopy(getClipboardText);

  return (
    <Card
      actions={
        <div className="flex items-center gap-2">
          {list.length > 0 && (
            <Button
              onClick={copy}
              title="copy full message log for LLM debugging"
            >
              <ClipboardCopy aria-hidden="true" size={12} />
              <span>{copied ? "copied!" : "copy log"}</span>
            </Button>
          )}
          <RefreshButton
            loading={messages.isFetching}
            onClick={() => messages.refetch()}
          />
        </div>
      }
      title={titleText}
    >
      <ErrorState error={messages.error} title="messages unavailable" />

      {messages.isLoading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {messages.data && list.length === 0 && (
        <EmptyState hint="no turns recorded yet." title="empty transcript" />
      )}

      <div className="space-y-3">
        {list.map((raw, idx) => {
          const fallbackId = `m${idx}`;

          if (!isMessage(raw)) {
            return <JsonView key={fallbackId} maxHeight={200} value={raw} />;
          }

          const role = raw.role ?? "assistant";
          const isUser = role === "user";
          const renderableParts = raw.parts?.filter((part) =>
            isRenderableMessagePart(part)
          );
          const sentAt = parseSentAt(raw.createdAt);

          return (
            <article
              className={
                isUser
                  ? "border-accent border-l-2 pl-3"
                  : "border-border border-l-2 pl-3"
              }
              key={messageKey(raw, fallbackId)}
            >
              <header className="flex items-center gap-2 text-[10px] text-fg-muted uppercase tracking-wider">
                <span className={isUser ? "text-accent" : "text-fg"}>
                  {role}
                </span>
                {raw.id ? (
                  <span className="font-mono text-fg-subtle">{raw.id}</span>
                ) : null}
              </header>
              <div className="mt-1 space-y-2">
                {renderableParts?.map((part, partIndex) =>
                  renderPart(part, partKey(raw, fallbackId, partIndex), sentAt)
                )}
              </div>
              {sentAt ? (
                <time
                  className="mt-1 block text-[10px] text-fg-subtle"
                  dateTime={sentAt.toISOString()}
                  title={sentAt.toLocaleString()}
                >
                  {formatRelativeTime(sentAt)}
                </time>
              ) : null}
            </article>
          );
        })}
      </div>
    </Card>
  );
};
