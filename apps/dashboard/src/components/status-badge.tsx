import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeStatus =
  | SessionStatus
  | "cancelled"
  | "cleaned"
  | "cleaning_up"
  | "paused";

const KNOWN_STATUSES: readonly BadgeStatus[] = [
  "pending",
  "idle",
  "running",
  "completed",
  "failed",
  "paused",
  "archived",
  "cancelled",
  "cleaned",
  "cleaning_up",
];

const isKnownStatus = (value: string): value is BadgeStatus =>
  (KNOWN_STATUSES as readonly string[]).includes(value);

const STATUS_CLASS: Record<BadgeStatus, string> = {
  archived: "badge-archived",
  cancelled: "badge-paused",
  cleaned: "badge-completed",
  cleaning_up: "badge-running",
  completed: "badge-completed",
  failed: "badge-failed",
  idle: "badge-idle",
  paused: "badge-paused",
  pending: "badge-pending",
  running: "badge-running",
};

const STATUS_DOT_CLASS: Record<BadgeStatus, string> = {
  archived: "bg-status-archived",
  cancelled: "bg-status-paused",
  cleaned: "bg-status-completed",
  cleaning_up: "bg-status-running",
  completed: "bg-status-completed",
  failed: "bg-status-failed",
  idle: "bg-status-idle",
  paused: "bg-status-paused",
  pending: "bg-status-pending",
  running: "bg-status-running",
};

interface BadgeProps {
  children?: ReactNode;
  className?: string;
  status: BadgeStatus | string;
  withDot?: boolean;
}

export const StatusBadge = ({
  children,
  className,
  status,
  withDot = true,
}: BadgeProps): React.JSX.Element => {
  const resolved: BadgeStatus = isKnownStatus(status) ? status : "idle";

  return (
    <span className={cn("badge", STATUS_CLASS[resolved], className)}>
      {withDot && (
        <span className={cn("status-dot", STATUS_DOT_CLASS[resolved])} />
      )}
      {children ?? status}
    </span>
  );
};
