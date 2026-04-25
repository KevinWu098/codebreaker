import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { ChatStatus, UIMessage } from "ai";
import { MessageSquare, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
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

interface ChatMessageItemProps {
  message: UIMessage;
  showTransientParts: boolean;
}

const ChatMessageItem = memo(
  ({
    message,
    showTransientParts,
  }: ChatMessageItemProps): React.JSX.Element => {
    const isUser = message.role === "user";
    const renderableParts = message.parts.filter((part) =>
      isRenderablePart(part as MessagePart, showTransientParts)
    );

    return (
      <Message from={message.role}>
        <header className="mb-1 flex items-center gap-2 text-[10px] text-fg-muted uppercase tracking-wider">
          <span className={isUser ? "text-accent" : "text-fg"}>
            {message.role}
          </span>
          <span className="font-mono text-fg-subtle">{message.id}</span>
        </header>
        <MessageContent>
          {renderableParts.map((part, partIndex) => {
            const typedPart = part as MessagePart;
            const key = partKey(message.id, partIndex, typedPart.type);

            return (
              <MessagePartRenderer
                key={key}
                part={typedPart}
                partKey={key}
                role={message.role}
                variant="live"
              />
            );
          })}
        </MessageContent>
      </Message>
    );
  }
);

ChatMessageItem.displayName = "ChatMessageItem";

const chatStatusFor = (
  error: Error | undefined,
  isStreaming: boolean
): ChatStatus => {
  if (isStreaming) {
    return "streaming";
  }

  return error ? "error" : "ready";
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
  const agentOptions = useMemo<Parameters<typeof useAgent>[0]>(
    () => ({
      agent: "session-agent",
      host,
      name: sessionId,
      protocol: secure ? "wss" : "ws",
      ...(connection.token
        ? { query: { token: connection.token }, queryDeps: [connection.token] }
        : {}),
    }),
    [connection.token, host, secure, sessionId]
  );

  const agent = useAgent(agentOptions);

  const chat = useAgentChat({ agent });

  const send = useCallback(
    (message: PromptInputMessage): void => {
      const text = message.text.trim();

      if (!text) {
        return;
      }

      chat.sendMessage({ text });
      setDraft("");
    },
    [chat]
  );

  const isStreaming = chat.isStreaming;
  const chatStatus = chatStatusFor(chat.error, isStreaming);
  const latestMessageId = chat.messages.at(-1)?.id;

  return (
    <Card
      actions={
        <Button
          disabled={isStreaming}
          onClick={() => chat.clearHistory()}
          variant="ghost"
        >
          <Trash2 aria-hidden="true" size={12} />
          <span>clear</span>
        </Button>
      }
      title={
        <ChatTitle identified={agent.identified} isStreaming={isStreaming} />
      }
    >
      <div className="space-y-3">
        <ErrorState error={chat.error} title="chat error" />

        <Conversation className="h-[520px] rounded border border-border bg-bg-raised/40">
          <ConversationContent className="gap-3 p-3">
            {chat.messages.length === 0 ? (
              <ConversationEmptyState
                description="say something below to start."
                icon={<MessageSquare className="size-10" />}
                title="no messages yet"
              />
            ) : (
              chat.messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  showTransientParts={
                    isStreaming &&
                    message.role !== "user" &&
                    message.id === latestMessageId
                  }
                />
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput className="mt-3" onSubmit={send}>
          <PromptInputBody>
            <PromptInputTextarea
              className="font-mono text-xs"
              disabled={isStreaming}
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="send a message to the agent..."
              value={draft}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <span className="text-[10px] text-fg-subtle">
                enter to send · shift+enter for newline
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!(draft.trim() || isStreaming)}
              onStop={() => chat.stop()}
              status={chatStatus}
            />
          </PromptInputFooter>
        </PromptInput>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-fg-subtle">
          <span>
            websocket auth uses the configured token via ?token= query (the only
            way to authenticate a browser WS upgrade).
          </span>
        </div>
      </div>
    </Card>
  );
};
