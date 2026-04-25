import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/lib/cn";

const COPIED_RESET_MS = 2000;

interface CopyTextButtonProps {
  className?: string;
  text: string;
  title?: string;
}

export const CopyTextButton = ({
  className,
  text,
  title = "copy to clipboard",
}: CopyTextButtonProps): React.JSX.Element => {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetRef.current) {
        clearTimeout(resetRef.current);
      }
    },
    []
  );

  const copy = useCallback(async () => {
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
      // clipboard may be unavailable; leave UI unchanged
    }
  }, [text]);

  return (
    <Button
      aria-label={copied ? "copied" : title}
      className={cn("btn-icon h-6 min-h-0 shrink-0 px-1.5 py-0", className)}
      onClick={copy}
      title={copied ? "copied" : title}
      type="button"
      variant="ghost"
    >
      {copied ? (
        <Check aria-hidden="true" className="text-status-completed" size={12} />
      ) : (
        <Copy aria-hidden="true" size={12} />
      )}
    </Button>
  );
};
