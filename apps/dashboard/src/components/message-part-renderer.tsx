import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/badge";
import { CopyTextButton } from "@/components/copy-text-button";
import { JsonView } from "@/components/json-view";
import { type MessagePart, ToolCallPart } from "@/components/tool-call-part";

interface MessagePartRendererProps {
  jsonMaxHeight?: number;
  part: MessagePart;
  partKey: string;
  variant: "live" | "static";
}

export const MessagePartRenderer = ({
  jsonMaxHeight = 160,
  part,
  partKey: key,
  variant,
}: MessagePartRendererProps): React.JSX.Element => {
  if (part.type === "text" && typeof part.text === "string") {
    return (
      <div className="relative" key={key}>
        <div className="absolute inset-e-0 top-0 z-10">
          <CopyTextButton text={part.text} title="copy text" />
        </div>
        {variant === "live" ? (
          <MessageResponse className="pe-8!">{part.text}</MessageResponse>
        ) : (
          <p className="whitespace-pre-wrap pe-7 text-fg text-sm leading-relaxed">
            {part.text}
          </p>
        )}
      </div>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    const name = part.toolName ?? part.type;

    return (
      <ToolCallPart
        header={
          variant === "live" ? (
            <>
              <Badge status={part.state === "result" ? "completed" : "running"}>
                tool · {part.state ?? "running"}
              </Badge>
              <span className="font-mono text-fg">{name}</span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-fg-muted uppercase tracking-wider">
                tool
              </span>
              <span className="font-mono text-fg">{name}</span>
            </>
          )
        }
        input={part.input}
        jsonMaxHeight={jsonMaxHeight}
        key={key}
        output={part.output}
      />
    );
  }

  return <JsonView key={key} maxHeight={jsonMaxHeight} value={part} />;
};
