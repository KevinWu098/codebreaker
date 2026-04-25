import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/button";
import { cn } from "@/lib/cn";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({
  className,
  ...props
}: ConversationProps): React.JSX.Element => (
  <StickToBottom
    className={cn("relative flex min-h-0 flex-1 flex-col", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps): React.JSX.Element => (
  <StickToBottom.Content
    className={cn("space-y-3 pr-1", className)}
    {...props}
  />
);

export type ConversationScrollButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children"
> & {
  children?: ReactNode;
};

export const ConversationScrollButton = ({
  children,
  className,
  ...props
}: ConversationScrollButtonProps): React.JSX.Element | null => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) {
    return null;
  }

  return (
    <Button
      aria-label="scroll to bottom"
      className={cn(
        "absolute right-3 bottom-3 h-7 w-7 rounded-full p-0 shadow-lg",
        className
      )}
      onClick={handleScrollToBottom}
      variant="default"
      {...props}
    >
      {children ?? <ArrowDownIcon aria-hidden="true" size={14} />}
    </Button>
  );
};
