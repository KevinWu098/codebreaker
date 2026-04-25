import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { Send, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { cn } from "@/lib/cn";
import { useConnection } from "@/lib/connection";

interface ChatPanelProps {
  sessionId: string;
}

interface AgentHost {
  host: string;
  secure: boolean;
}

interface MessagePart {
  input?: unknown;
  output?: unknown;
  state?: string;
  text?: string;
  toolName?: string;
  type?: string;
}

const DEFAULT_HOST: AgentHost = { host: "localhost:8787", secure: false };

const parseHost = (baseUrl: string): AgentHost => {
  try {
    const url = new URL(baseUrl);
    return { host: url.host, secure: url.protocol === "https:" };
  } catch {
    return DEFAULT_HOST;
  }
};

const partKey = (
  messageId: string,
  partIndex: number,
  type: string | undefined
): string => `${messageId}:${type ?? "unknown"}:${partIndex}`;

const renderPart = (
  part: MessagePart,
  messageId: string,
  partIndex: number
): React.JSX.Element => {
  const key = partKey(messageId, partIndex, part.type);

  if (part.type === "text" && typeof part.text === "string") {
    return (
      <Streamdown
        className="md"
        key={key}
        mode="streaming"
        parseIncompleteMarkdown
      >
        {part.text}
      </Streamdown>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    const name = part.toolName ?? part.type;
    const state = part.state ?? "running";

    return (
      <div
        className="rounded border border-border bg-bg-overlay p-2 text-xs"
        key={key}
      >
        <div className="flex items-center gap-2">
          <Badge status={state === "result" ? "completed" : "running"}>
            tool · {state}
          </Badge>
          <span className="font-mono text-fg">{name}</span>
        </div>
        {part.input !== undefined && (
          <div className="mt-2 space-y-1">
            <span className="field-label">input</span>
            <JsonView maxHeight={140} value={part.input} />
          </div>
        )}
        {part.output !== undefined && (
          <div className="mt-2 space-y-1">
            <span className="field-label">output</span>
            <JsonView maxHeight={140} value={part.output} />
          </div>
        )}
      </div>
    );
  }

  return <JsonView key={key} maxHeight={140} value={part} />;
};

const ChatTitle = ({
  identified,
  isStreaming,
}: {
  identified: boolean;
  isStreaming: boolean;
}): React.JSX.Element => (
  <span className="flex items-center gap-2">
    live chat
    <Badge status={identified ? "completed" : "idle"}>
      {identified ? "ws connected" : "connecting"}
    </Badge>
    {isStreaming && <Badge status="running">streaming</Badge>}
  </span>
);

export const ChatPanel = ({ sessionId }: ChatPanelProps): React.JSX.Element => {
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
    const text = draft.trim();

    if (!text) {
      return;
    }

    chat.sendMessage({ text });
    setDraft("");
  };

  const isStreaming = chat.isStreaming;

  return (
    <Card
      actions={
        <>
          <Button
            disabled={isStreaming}
            onClick={() => chat.clearHistory()}
            variant="ghost"
          >
            <Trash2 aria-hidden="true" size={12} />
            <span>clear</span>
          </Button>
          {isStreaming && (
            <Button onClick={() => chat.stop()} variant="danger">
              <Square aria-hidden="true" size={12} />
              <span>stop</span>
            </Button>
          )}
        </>
      }
      title={
        <ChatTitle identified={agent.identified} isStreaming={isStreaming} />
      }
    >
      <div className="space-y-3">
        <ErrorState error={chat.error ?? undefined} title="chat error" />

        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {chat.messages.length === 0 && (
            <div className="py-6 text-center text-fg-muted text-xs">
              no messages yet — say something below.
            </div>
          )}
          {chat.messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <article
                className={cn(
                  "border-l-2 pl-3",
                  isUser ? "border-accent" : "border-border"
                )}
                key={message.id}
              >
                <header className="mb-1 flex items-center gap-2 text-[10px] text-fg-muted uppercase tracking-wider">
                  <span className={isUser ? "text-accent" : "text-fg"}>
                    {message.role}
                  </span>
                  <span className="font-mono text-fg-subtle">{message.id}</span>
                </header>
                <div className="space-y-2">
                  {message.parts.map((part, partIndex) =>
                    renderPart(part as MessagePart, message.id, partIndex)
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="composer">
          <textarea
            className="input"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="send a message to the agent…"
            rows={2}
            value={draft}
          />
          <Button
            disabled={isStreaming || !draft.trim()}
            onClick={send}
            variant="primary"
          >
            <Send aria-hidden="true" size={12} />
            <span>send</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-fg-subtle">
          <span>
            <kbd className="kbd">⌘</kbd>
            <span className="mx-0.5">/</span>
            <kbd className="kbd">ctrl</kbd>
            <span className="mx-0.5">+</span>
            <kbd className="kbd">enter</kbd>
            <span> to send</span>
          </span>
          <span>·</span>
          <span>
            websocket connection bypasses the jwt middleware — only safe for
            trusted local dev.
          </span>
        </div>
      </div>
    </Card>
  );
};
