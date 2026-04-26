import devinIconUrl from "@/assets/devin-icon.png?url";
import { cn } from "@/lib/utils";

/**
 * Inline Devin logo + “Devin” at the current text size (icon height matches cap height).
 */
export const DevinWord = ({
  className,
}: {
  className?: string;
}): React.JSX.Element => (
  <span
    className={cn(
      "inline-flex items-baseline gap-0.5 whitespace-nowrap bg-transparent",
      className
    )}
    title="Devin"
  >
    {/* biome-ignore lint/performance/noImgElement: Vite (no next/image); inline 1em-tall mark */}
    <img
      alt=""
      aria-hidden
      className="inline-block h-[1em] w-[1em] shrink-0 self-baseline bg-transparent object-contain [vertical-align:-0.12em]"
      height={16}
      src={devinIconUrl}
      width={16}
    />
    <span>Devin</span>
  </span>
);
