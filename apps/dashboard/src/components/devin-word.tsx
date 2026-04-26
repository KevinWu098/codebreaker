import devinIconUrl from "@/assets/devin-icon.png?url";
import { cn } from "@/lib/utils";

/**
 * Inline Devin logo + “Devin”. Icon uses `1em` (not `lh`) so it matches the
 * label font size in tight `text-[10px] leading-5` fields as well as body copy.
 */
export const DevinWord = ({
  className,
}: {
  className?: string;
}): React.JSX.Element => (
  <span
    className={cn(
      "inline-flex items-center gap-0.5 whitespace-nowrap bg-transparent",
      className
    )}
    title="Devin"
  >
    {/* biome-ignore lint/performance/noImgElement: Vite (no next/image); 1em-tall mark */}
    <img
      alt=""
      aria-hidden
      className="inline-block size-[1em] shrink-0 bg-transparent object-contain"
      height={16}
      src={devinIconUrl}
      width={16}
    />
    <span>Devin</span>
  </span>
);
