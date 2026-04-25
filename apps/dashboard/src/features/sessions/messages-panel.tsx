import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { type MessagePart, ToolCallPart } from "@/components/tool-call-part";
import { useSessionMessagesQuery } from "@/hooks/queries";

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

const renderPart = (part: MessagePart, key: string): React.JSX.Element => {
  if (part.type === "text" && typeof part.text === "string") {
    return (
      <p
        className="whitespace-pre-wrap text-fg text-sm leading-relaxed"
        key={key}
      >
        {part.text}
      </p>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    return (
      <ToolCallPart
        header={
          <>
            <span className="text-[10px] text-fg-muted uppercase tracking-wider">
              tool
            </span>
            <span className="font-mono text-fg">
              {part.toolName ?? part.type}
            </span>
          </>
        }
        input={part.input}
        key={key}
        output={part.output}
      />
    );
  }

  return <JsonView key={key} maxHeight={160} value={part} />;
};

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
      <ErrorState
        error={messages.error ?? undefined}
        title="messages unavailable"
      />

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
                {raw.parts?.map((part, partIndex) =>
                  renderPart(part, partKey(raw, fallbackId, partIndex))
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
};
