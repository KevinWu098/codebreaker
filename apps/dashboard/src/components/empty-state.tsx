import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  hint?: ReactNode;
  title: string;
}

export const EmptyState = ({
  action,
  className,
  hint,
  title,
}: EmptyStateProps): React.JSX.Element => (
  <div className={cn("empty-card", className)}>
    <div className="text-fg text-sm lowercase">{title}</div>
    {hint ? <div className="text-fg-muted text-xs">{hint}</div> : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);
