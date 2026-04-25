import type { UIMessage } from "ai";
import type { HTMLAttributes } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/cn";

export type MessageProps = HTMLAttributes<HTMLElement> & {
  from: UIMessage["role"];
};

export const Message = ({
  className,
  from,
  ...props
}: MessageProps): React.JSX.Element => (
  <article
    className={cn(
      "border-l-2 pl-3",
      from === "user" ? "border-accent" : "border-border",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  className,
  ...props
}: MessageContentProps): React.JSX.Element => (
  <div className={cn("space-y-2", className)} {...props} />
);

export type MessageResponseProps = React.ComponentProps<typeof Streamdown>;

export const MessageResponse = ({
  className,
  ...props
}: MessageResponseProps): React.JSX.Element => (
  <Streamdown
    className={cn("md", className)}
    mode="streaming"
    parseIncompleteMarkdown
    {...props}
  />
);
