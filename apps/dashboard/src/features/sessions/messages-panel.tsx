import { Card } from "../../components/card";
import { ErrorBanner } from "../../components/error-banner";
import { JsonView } from "../../components/json-view";
import { RefreshButton } from "../../components/refresh-button";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { useConnection } from "../../lib/connection";

interface Props {
  sessionId: string;
}

interface MessagePart {
  input?: unknown;
  output?: unknown;
  text?: string;
  toolName?: string;
  type?: string;
}

interface Message {
  createdAt?: string | number;
  id?: string;
  parts?: MessagePart[];
  role?: string;
}

const isMessage = (value: unknown): value is Message =>
  typeof value === "object" && value !== null;

const renderPart = (part: MessagePart, index: number): React.JSX.Element => {
  if (part.type === "text" && typeof part.text === "string") {
    return (
      <div className="message-body" key={index}>
        {part.text}
      </div>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    return (
      <div className="tool-call" key={index}>
        <div className="tool-call-name">{part.toolName ?? part.type}</div>
        {part.input !== undefined && (
          <div className="dim text-xs" style={{ marginTop: 4 }}>
            input
          </div>
        )}
        {part.input !== undefined && (
          <JsonView maxHeight={160} value={part.input} />
        )}
        {part.output !== undefined && (
          <div className="dim text-xs" style={{ marginTop: 4 }}>
            output
          </div>
        )}
        {part.output !== undefined && (
          <JsonView maxHeight={160} value={part.output} />
        )}
      </div>
    );
  }

  return <JsonView key={index} maxHeight={160} value={part} />;
};

export const MessagesPanel = ({ sessionId }: Props): React.JSX.Element => {
  const connection = useConnection();
  const messages = useAsync(
    () => api.getMessages(sessionId),
    [sessionId, connection.baseUrl, connection.token],
    { enabled: connection.token.length > 0, pollMs: 5000 }
  );
  const title = `Messages (${messages.data?.messages.length ?? "—"})`;

  return (
    <Card
      actions={<RefreshButton onClick={() => messages.refresh()} />}
      title={title}
    >
      <ErrorBanner error={messages.error} title="Messages unavailable" />
      {!messages.data && <span className="dim">Loading…</span>}
      {messages.data?.messages.length === 0 && (
        <div className="empty">No messages yet</div>
      )}
      <div className="message-list">
        {messages.data?.messages.map((raw, idx) => {
          if (!isMessage(raw)) {
            return <JsonView key={idx} maxHeight={160} value={raw} />;
          }

          const role = raw.role ?? "assistant";

          return (
            <div
              className={`message${role === "user" ? "user" : ""}`}
              key={raw.id ?? idx}
            >
              <div className="message-meta">
                <span>{role}</span>
                <span>{raw.id ?? ""}</span>
              </div>
              {raw.parts?.map((part, partIndex) => renderPart(part, partIndex))}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
