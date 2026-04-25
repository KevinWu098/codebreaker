import { RotateCw } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  title?: string;
}

export const RefreshButton = ({
  className,
  disabled,
  loading,
  onClick,
  title = "refresh",
}: RefreshButtonProps): React.JSX.Element => (
  <Button
    aria-label={title}
    className={cn("btn-icon", className)}
    disabled={disabled}
    onClick={onClick}
    title={title}
    variant="ghost"
  >
    <RotateCw
      aria-hidden="true"
      className={loading ? "animate-spin" : undefined}
      size={12}
    />
  </Button>
);
