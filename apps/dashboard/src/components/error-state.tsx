import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  className?: string;
  error: Error | null | undefined;
  title?: string;
}

export const ErrorState = ({
  className,
  error,
  title,
}: ErrorStateProps): React.JSX.Element | null => {
  if (!error) {
    return null;
  }

  const code = error instanceof ApiClientError ? error.code : "error";
  const status = error instanceof ApiClientError ? ` ${error.status}` : "";

  return (
    <div className={cn("error-card", className)} role="alert">
      <div className="flex items-center gap-2">
        <span className="font-medium uppercase tracking-wider">
          {title ?? "error"}
          {status}
        </span>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-muted">{code}</span>
      </div>
      <div className="mt-1 break-all">{error.message}</div>
    </div>
  );
};
