import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { CopyTextButton } from "@/components/copy-text-button";
import { JsonView } from "@/components/json-view";
import type { MessagePart } from "@/components/tool-call-part";

interface MessagePartRendererProps {
  jsonMaxHeight?: number;
  part: MessagePart;
  partKey: string;
  role?: string;
  variant: "live" | "static";
}

const isToolState = (state: string | undefined): state is ToolPart["state"] =>
  state === "input-streaming" ||
  state === "input-available" ||
  state === "approval-requested" ||
  state === "approval-responded" ||
  state === "output-available" ||
  state === "output-error" ||
  state === "output-denied";

const toolStateFor = (part: MessagePart): ToolPart["state"] => {
  if (isToolState(part.state)) {
    return part.state;
  }

  if (part.state === "result" || part.output !== undefined) {
    return "output-available";
  }

  if (part.state === "error") {
    return "output-error";
  }

  return part.input === undefined ? "input-streaming" : "input-available";
};

export const MessagePartRenderer = ({
  part,
  partKey: key,
  role,
  variant,
}: MessagePartRendererProps): React.JSX.Element => {
  if (part.type === "text" && typeof part.text === "string") {
    if (variant === "live" && role !== "user") {
      return <MessageResponse key={key}>{part.text}</MessageResponse>;
    }

    return (
      <div className="relative" key={key}>
        <div className="absolute inset-e-0 top-0 z-10">
          <CopyTextButton text={part.text} title="copy text" />
        </div>
        <p className="whitespace-pre-wrap pe-7 text-fg text-sm leading-relaxed">
          {part.text}
        </p>
      </div>
    );
  }

  if (typeof part.type === "string" && part.type.startsWith("tool")) {
    return (
      <Tool defaultOpen={variant === "live"} key={key}>
        <ToolHeader
          {...(part.toolName ? { title: part.toolName } : {})}
          state={toolStateFor(part)}
          type={part.type as `tool-${string}`}
        />
        <ToolContent>
          {part.input !== undefined && <ToolInput input={part.input} />}
          <ToolOutput
            errorText={
              typeof part.errorText === "string" ? part.errorText : undefined
            }
            output={part.output}
          />
        </ToolContent>
      </Tool>
    );
  }

  return <JsonView key={key} maxHeight={160} value={part} />;
};
