import { useAgentChat } from "@cloudflare/ai-chat/react";
import { inferSessionAgentRoleFromSessionId } from "@codebreaker/shared/lib/utils";
import type { SessionAgentRole } from "@codebreaker/shared/schemas/api";
import { useAgent } from "agents/react";
import type { ChatStatus, UIMessage } from "ai";
import {
  Check,
  ClipboardCopy,
  Copy,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
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
import {
  isRenderableMessagePart,
  MessagePartRenderer,
} from "@/components/message-part-renderer";
import type { MessagePart } from "@/components/tool-call-part";
import { Spinner } from "@/components/ui/spinner";
import { useSessionMessagesQuery, useSessionQuery } from "@/hooks/queries";
import { api } from "@/lib/api";
import { useConnection } from "@/lib/connection";
import { formatRelativeTime } from "@/lib/format";

interface ChatPanelProps {
  sessionId: string;
}

interface AgentHost {
  host: string;
  secure: boolean;
}

const DEFAULT_HOST: AgentHost = { host: "localhost:8787", secure: false };
const COPIED_RESET_MS = 2000;
const EMPTY_CHAT_MESSAGES: UIMessage[] = [];

/**
 * WebSocket `/agents/{namespace}/...` segment. `partyserver` keys namespaces from
 * **wrangler binding names** (e.g. `AUDIT_COORDINATOR` → `audit-coordinator`), not
 * from the DO class name (`AuditCoordinatorAgent` → `audit-coordinator-agent`).
 */
const WS_AGENT_SLUG: Record<SessionAgentRole, string> = {
  audit_coordinator: "audit-coordinator",
  audit_investigator: "audit-investigator",
  audit_validator: "audit-validator",
  session: "session-agent",
};

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

const messageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

const hasAssistantText = (message: UIMessage | undefined): boolean =>
  message !== undefined &&
  message.role !== "user" &&
  messageText(message).trim().length > 0;

interface ChatMessageActionsProps {
  text: string;
}

const ChatMessageActions = memo(
  ({ text }: ChatMessageActionsProps): React.JSX.Element => {
    const [copied, setCopied] = useState(false);
    const resetRef = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined
    );

    useEffect(
      () => () => {
        if (resetRef.current) {
          clearTimeout(resetRef.current);
        }
      },
      []
    );

    const copyMessage = useCallback(async (): Promise<void> => {
      if (resetRef.current) {
        clearTimeout(resetRef.current);
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        resetRef.current = setTimeout(() => {
          setCopied(false);
          resetRef.current = undefined;
        }, COPIED_RESET_MS);
      } catch {
        // Clipboard permissions vary by browser/context; keep the action silent.
      }
    }, [text]);

    return (
      <MessageActions className="mt-1 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 group-[.is-user]:ml-auto">
        <MessageAction
          disabled={!text}
          label={copied ? "Copied" : "Copy message"}
          onClick={copyMessage}
          tooltip={copied ? "Copied" : "Copy message"}
        >
          {copied ? (
            <Check aria-hidden="true" className="text-status-completed" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </MessageAction>
      </MessageActions>
    );
  }
);

ChatMessageActions.displayName = "ChatMessageActions";

const ChatLoadingMessage = (): React.JSX.Element => (
  <Message aria-live="polite" from="assistant">
    <MessageContent className="rounded-lg border border-border bg-bg-raised/70 px-3 py-2 text-fg-muted">
      <span className="flex items-center gap-2 text-xs">
        <Spinner className="size-3" />
        <span>agent is working</span>
      </span>
    </MessageContent>
  </Message>
);

interface MessageMetadataWithTimestamp {
  createdAt?: string | number | Date;
}

interface PersistedMessageWithTimestamp {
  createdAt?: string | number;
  id?: string;
  parts?: readonly MessagePart[];
}

const messageTimestamp = (message: UIMessage): Date | null => {
  const metadata = message.metadata as MessageMetadataWithTimestamp | undefined;
  const candidate = metadata?.createdAt;
  if (candidate === undefined || candidate === null) {
    return null;
  }
  const parsed = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseTimestamp = (
  value: Date | string | number | null | undefined | unknown
): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isPersistedMessage = (
  value: unknown
): value is PersistedMessageWithTimestamp =>
  typeof value === "object" && value !== null;

const persistedMessageMap = (
  messages: readonly unknown[]
): Map<string, PersistedMessageWithTimestamp> => {
  const map = new Map<string, PersistedMessageWithTimestamp>();
  for (const raw of messages) {
    if (isPersistedMessage(raw) && typeof raw.id === "string") {
      map.set(raw.id, raw);
    }
  }
  return map;
};

interface ChatMessageItemProps {
  fallbackSentAt: Date | null;
  message: UIMessage;
  persistedMessage?: PersistedMessageWithTimestamp | undefined;
  showTransientParts: boolean;
}

const ChatMessageItem = memo(
  ({
    fallbackSentAt,
    message,
    persistedMessage,
    showTransientParts,
  }: ChatMessageItemProps): React.JSX.Element => {
    const isUser = message.role === "user";
    const text = messageText(message);
    const renderableParts = message.parts.filter((part) =>
      isRenderableMessagePart(part as MessagePart, showTransientParts)
    );
    const sentAt =
      messageTimestamp(message) ??
      parseTimestamp(persistedMessage?.createdAt) ??
      fallbackSentAt;

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
            const persistedPart = persistedMessage?.parts?.[partIndex];
            const persistedStartedAt = parseTimestamp(
              persistedPart?.startedAt ?? persistedPart?.createdAt
            );

            return (
              <MessagePartRenderer
                key={key}
                part={typedPart}
                partKey={key}
                role={message.role}
                showTransientParts={showTransientParts}
                startedAt={persistedStartedAt ?? sentAt}
                variant="live"
              />
            );
          })}
        </MessageContent>
        {sentAt ? (
          <time
            className="mt-1 block text-[10px] text-fg-subtle group-[.is-user]:ml-auto group-[.is-user]:text-right"
            dateTime={sentAt.toISOString()}
            title={sentAt.toLocaleString()}
          >
            {formatRelativeTime(sentAt)}
          </time>
        ) : null}
        {text && <ChatMessageActions text={text} />}
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

const formatUIPartForClipboard = (part: UIMessage["parts"][number]): string => {
  if (part.type === "text") {
    return part.text;
  }
  if (part.type === "tool-invocation") {
    const inv = part.toolInvocation;
    const lines = [`[tool: ${inv.toolName}]`];
    if (inv.args !== undefined) {
      try {
        lines.push(`  input: ${JSON.stringify(inv.args, null, 2)}`);
      } catch {
        lines.push(`  input: ${String(inv.args)}`);
      }
    }
    if ("result" in inv && inv.result !== undefined) {
      try {
        lines.push(`  output: ${JSON.stringify(inv.result, null, 2)}`);
      } catch {
        lines.push(`  output: ${String(inv.result)}`);
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

const formatChatForClipboard = (messages: UIMessage[]): string => {
  const lines: string[] = [];
  for (const message of messages) {
    lines.push(`--- ${message.role} ---`);
    for (const part of message.parts) {
      lines.push(formatUIPartForClipboard(part));
    }
    lines.push("");
  }
  return lines.join("\n");
};

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
        }, COPIED_RESET_MS);
      },
      () => {
        /* clipboard unavailable */
      }
    );
  }, [getText]);

  return { copied, copy };
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
  const sessionRow = useSessionQuery(sessionId);
  const agentRole =
    sessionRow.data?.session?.agentRole ??
    inferSessionAgentRoleFromSessionId(sessionId);
  const wsAgentSlug = WS_AGENT_SLUG[agentRole] ?? WS_AGENT_SLUG.session;
  const { host, secure } = useMemo(
    () => parseHost(connection.baseUrl),
    [connection.baseUrl]
  );
  const [draft, setDraft] = useState("");
  const agentOptions = useMemo<Parameters<typeof useAgent>[0]>(
    () => ({
      agent: wsAgentSlug,
      host,
      name: sessionId,
      protocol: secure ? "wss" : "ws",
      ...(connection.token
        ? { query: { token: connection.token }, queryDeps: [connection.token] }
        : {}),
    }),
    [connection.token, host, secure, sessionId, wsAgentSlug]
  );

  const agent = useAgent(agentOptions);
  const persistedMessages = useSessionMessagesQuery(sessionId);

  /**
   * Seed `useAgentChat` with the persisted transcript from D1 (via the
   * control-plane router, which dispatches to the right DO namespace based
   * on `agentRole`). Without this, the panel would render blank for any
   * session that finished before the WS connected — most visible for audit
   * subagents (coordinators/investigators/validators) which are driven to
   * completion by `dispatch_*` and have no live stream by the time an
   * operator opens the chat tab.
   *
   * The agents framework's default `/get-messages` HTTP handler isn't
   * wired into our auth (it expects a different scheme than the
   * dashboard's Bearer token), so we go through our own API endpoint.
   */
  const fetchInitialMessages = useCallback(async (): Promise<UIMessage[]> => {
    try {
      const response = await api.getMessages(sessionId);
      return (response.messages ?? []) as UIMessage[];
    } catch {
      return [];
    }
  }, [sessionId]);

  const chat = useAgentChat({
    agent,
    getInitialMessages: fetchInitialMessages,
    messages: EMPTY_CHAT_MESSAGES,
  });

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
  const latestMessage = chat.messages.at(-1);
  const latestMessageId = latestMessage?.id;
  const showLoadingMessage = isStreaming && !hasAssistantText(latestMessage);
  const persistedById = useMemo(
    () => persistedMessageMap(persistedMessages.data?.messages ?? []),
    [persistedMessages.data?.messages]
  );

  const chatMessages = chat.messages;
  const getChatLogText = useCallback(
    () => formatChatForClipboard(chatMessages),
    [chatMessages]
  );
  const { copied: logCopied, copy: copyLog } = useClipboardCopy(getChatLogText);

  return (
    <Card
      actions={
        <div className="flex items-center gap-2">
          {chatMessages.length > 0 && (
            <Button
              onClick={copyLog}
              title="copy full chat log for LLM debugging"
            >
              <ClipboardCopy aria-hidden="true" size={12} />
              <span>{logCopied ? "copied!" : "copy log"}</span>
            </Button>
          )}
          <Button
            disabled={isStreaming}
            onClick={() => chat.clearHistory()}
            variant="ghost"
          >
            <Trash2 aria-hidden="true" size={12} />
            <span>clear</span>
          </Button>
        </div>
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
                  fallbackSentAt={null}
                  key={message.id}
                  message={message}
                  persistedMessage={persistedById.get(message.id)}
                  showTransientParts={
                    isStreaming &&
                    message.role !== "user" &&
                    message.id === latestMessageId
                  }
                />
              ))
            )}
            {showLoadingMessage && <ChatLoadingMessage />}
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
