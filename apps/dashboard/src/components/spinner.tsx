import { cn } from "@/lib/cn";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export const Spinner = ({
  className,
  label = "loading",
}: SpinnerProps): React.JSX.Element => (
  <span
    aria-label={label}
    className={cn("inline-flex items-center gap-1.5 text-fg-muted", className)}
    role="status"
  >
    <span className="spinner" />
    <span className="text-[10px] uppercase tracking-wider">{label}</span>
  </span>
);
