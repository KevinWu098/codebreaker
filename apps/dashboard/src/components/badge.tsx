import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "archived";

const KNOWN_STATUSES: readonly BadgeStatus[] = [
  "idle",
  "running",
  "completed",
  "failed",
  "paused",
  "archived",
];

const isKnownStatus = (value: string): value is BadgeStatus =>
  (KNOWN_STATUSES as readonly string[]).includes(value);

const STATUS_CLASS: Record<BadgeStatus, string> = {
  archived: "badge-archived",
  completed: "badge-completed",
  failed: "badge-failed",
  idle: "badge-idle",
  paused: "badge-paused",
  running: "badge-running",
};

interface BadgeProps {
  children?: ReactNode;
  className?: string;
  status: BadgeStatus | string;
  withDot?: boolean;
}

export const Badge = ({
  children,
  className,
  status,
  withDot = true,
}: BadgeProps): React.JSX.Element => {
  const resolved: BadgeStatus = isKnownStatus(status) ? status : "idle";

  return (
    <span className={cn("badge", STATUS_CLASS[resolved], className)}>
      {withDot && (
        <span className={cn("status-dot", `bg-status-${resolved}`)} />
      )}
      {children ?? status}
    </span>
  );
};
