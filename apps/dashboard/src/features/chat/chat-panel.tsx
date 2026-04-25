import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useMemo, useState } from "react";
import { Card } from "../../components/card";
import { ErrorBanner } from "../../components/error-banner";
import { JsonView } from "../../components/json-view";
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

const parseHost = (baseUrl: string): { host: string; secure: boolean } => {
  try {
    const url = new URL(baseUrl);

    return { host: url.host, secure: url.protocol === "https:" };
  } catch {
    return { host: "localhost:8787", secure: false };
  }
};

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
          <JsonView maxHeight={140} value={part.input} />
        )}
        {part.output !== undefined && (
          <div className="dim text-xs" style={{ marginTop: 4 }}>
            output
          </div>
        )}
        {part.output !== undefined && (
          <JsonView maxHeight={140} value={part.output} />
        )}
      </div>
    );
  }

  return <JsonView key={index} maxHeight={140} value={part} />;
};

const ChatTitle = ({
  identified,
  isStreaming,
}: {
  identified: boolean;
  isStreaming: boolean;
}): React.JSX.Element => (
  <span className="center flex gap-2">
    Live chat
    <span className="tag">{identified ? "connected" : "connecting…"}</span>
    {isStreaming && (
      <span
        className="tag"
        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      >
        streaming
      </span>
    )}
  </span>
);

const ChatActions = ({
  isStreaming,
  onClear,
  onStop,
}: {
  isStreaming: boolean;
  onClear: () => void;
  onStop: () => void;
}): React.JSX.Element => (
  <>
    <button
      className="btn btn-ghost text-xs"
      disabled={isStreaming}
      onClick={onClear}
      type="button"
    >
      Clear
    </button>
    {isStreaming && (
      <button className="btn btn-danger text-xs" onClick={onStop} type="button">
        Stop
      </button>
    )}
  </>
);

export const ChatPanel = ({ sessionId }: Props): React.JSX.Element => {
  const connection = useConnection();
  const { host, secure } = useMemo(
    () => parseHost(connection.baseUrl),
    [connection.baseUrl]
  );
  const [draft, setDraft] = useState("");

  const agent = useAgent({
    agent: "session-agent",
    host,
    name: sessionId,
    protocol: secure ? "wss" : "ws",
  });

  const chat = useAgentChat({ agent });

  const send = (): void => {
    if (!draft.trim()) {
      return;
    }

    chat.sendMessage({ text: draft });
    setDraft("");
  };

  const isStreaming = chat.isStreaming;

  return (
    <Card
      actions={
        <ChatActions
          isStreaming={isStreaming}
          onClear={() => chat.clearHistory()}
          onStop={() => chat.stop()}
        />
      }
      title={
        <ChatTitle identified={agent.identified} isStreaming={isStreaming} />
      }
    >
      <ErrorBanner error={chat.error ?? undefined} title="Chat error" />

      <div
        className="message-list"
        style={{ maxHeight: 520, overflowY: "auto" }}
      >
        {chat.messages.length === 0 && (
          <div className="empty">No messages yet — say something below.</div>
        )}
        {chat.messages.map((message) => (
          <div
            className={`message${message.role === "user" ? "user" : ""}`}
            key={message.id}
          >
            <div className="message-meta">
              <span>{message.role}</span>
              <span>{message.id}</span>
            </div>
            {message.parts.map((part, partIndex) =>
              renderPart(part as MessagePart, partIndex)
            )}
          </div>
        ))}
      </div>

      <div className="composer">
        <textarea
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Send a message to the agent…"
          rows={2}
          value={draft}
        />
        <button
          className="btn btn-primary"
          disabled={isStreaming || !draft.trim()}
          onClick={send}
          type="button"
        >
          Send
        </button>
      </div>
      <div className="dim text-xs" style={{ marginTop: 4 }}>
        ⌘/Ctrl+Enter to send. WebSocket connection bypasses the JWT layer (the
        worker routes agent traffic before middleware) — only safe for trusted
        local dev.
      </div>
    </Card>
  );
};
