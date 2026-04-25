import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { ArrowDownIcon, Send, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState } from "@/components/error-state";
import { MessagePartRenderer } from "@/components/message-part-renderer";
import type { MessagePart } from "@/components/tool-call-part";
import { useConnection } from "@/lib/connection";

interface ChatPanelProps {
  sessionId: string;
}

interface AgentHost {
  host: string;
  secure: boolean;
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

const TRANSIENT_PART_TYPES = new Set(["step-start"]);

const isRenderablePart = (
  part: MessagePart,
  showTransientParts: boolean
): boolean =>
  typeof part.type !== "string" ||
  !TRANSIENT_PART_TYPES.has(part.type) ||
  showTransientParts;

const renderPart = (
  part: MessagePart,
  messageId: string,
  partIndex: number
): React.JSX.Element => (
  <MessagePartRenderer
    jsonMaxHeight={140}
    key={partKey(messageId, partIndex, part.type)}
    part={part}
    partKey={partKey(messageId, partIndex, part.type)}
    variant="live"
  />
);

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
    ...(connection.token
      ? { query: { token: connection.token }, queryDeps: [connection.token] }
      : {}),
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

        <Conversation className="max-h-[520px] overflow-y-auto">
          <ConversationContent>
            {chat.messages.length === 0 && (
              <div className="py-6 text-center text-fg-muted text-xs">
                no messages yet — say something below.
              </div>
            )}
            {chat.messages.map((message) => {
              const isUser = message.role === "user";
              const isLatestMessage = message.id === chat.messages.at(-1)?.id;
              const showTransientParts =
                isStreaming && !isUser && isLatestMessage;
              const renderableParts = message.parts.filter((part) =>
                isRenderablePart(part as MessagePart, showTransientParts)
              );

              return (
                <Message from={message.role} key={message.id}>
                  <header className="mb-1 flex items-center gap-2 text-[10px] text-fg-muted uppercase tracking-wider">
                    <span className={isUser ? "text-accent" : "text-fg"}>
                      {message.role}
                    </span>
                    <span className="font-mono text-fg-subtle">
                      {message.id}
                    </span>
                  </header>
                  <MessageContent>
                    {renderableParts.map((part, partIndex) =>
                      renderPart(part as MessagePart, message.id, partIndex)
                    )}
                  </MessageContent>
                </Message>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton>
            <ArrowDownIcon aria-hidden="true" size={14} />
          </ConversationScrollButton>
        </Conversation>

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
            websocket auth uses the configured token via ?token= query (the only
            way to authenticate a browser WS upgrade).
          </span>
        </div>
      </div>
    </Card>
  );
};
