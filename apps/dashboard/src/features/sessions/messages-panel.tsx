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

export const MessagesPanel = ({
  sessionId,
}: MessagesPanelProps): React.JSX.Element => {
  const messages = useSessionMessagesQuery(sessionId);

  const list = messages.data?.messages ?? [];
  const titleText =
    messages.data === undefined ? "messages" : `messages · ${list.length}`;

  return (
    <Card
      actions={
        <RefreshButton
          loading={messages.isFetching}
          onClick={() => messages.refetch()}
        />
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
