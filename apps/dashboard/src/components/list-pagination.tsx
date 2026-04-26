import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/button";

export const ListPagination = ({
  className,
  isFetching,
  itemCount,
  onNext,
  onPrevious,
  page,
  pageSize,
  total,
}: {
  className?: string;
  isFetching: boolean;
  itemCount: number;
  onNext: () => void;
  onPrevious: () => void;
  page: number;
  pageSize: number;
  total: number;
}): React.JSX.Element | null => {
  if (total === 0) {
    return null;
  }

  const startIndex = itemCount > 0 ? page * pageSize + 1 : 0;
  const endIndex = page * pageSize + itemCount;
  const hasNext = page * pageSize + itemCount < total;

  return (
    <div
      className={
        className
          ? `flex flex-wrap items-center justify-between gap-2 text-fg-muted text-xs ${className}`
          : "flex flex-wrap items-center justify-between gap-2 text-fg-muted text-xs"
      }
    >
      <span>
        {itemCount > 0 ? (
          <>
            {startIndex}–{endIndex} of {total}
          </>
        ) : (
          <>0 of {total}</>
        )}
        {isFetching ? " · updating…" : null}
      </span>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Previous page"
          disabled={page <= 0 || isFetching}
          onClick={onPrevious}
          type="button"
          variant="default"
        >
          <ChevronLeft aria-hidden="true" size={14} />
          <span>prev</span>
        </Button>
        <span className="px-1 font-mono tabular-nums">p.{page + 1}</span>
        <Button
          aria-label="Next page"
          disabled={!hasNext || isFetching}
          onClick={onNext}
          type="button"
          variant="default"
        >
          <span>next</span>
          <ChevronRight aria-hidden="true" size={14} />
        </Button>
      </div>
    </div>
  );
};
