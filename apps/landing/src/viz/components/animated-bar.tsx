import { useInView } from "@/viz/components/use-in-view";

interface AnimatedBarProps {
  accent?: string;
  delayMs?: number;
  durationMs?: number;
  height?: string;
  pct: number;
  track?: string;
}

const DEFAULT_DURATION_MS = 1100;

export function AnimatedBar({
  pct,
  accent = "rgb(244 248 255)",
  track = "rgba(255, 255, 255, 0.12)",
  height = "h-1.5",
  durationMs = DEFAULT_DURATION_MS,
  delayMs = 0,
}: AnimatedBarProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={`relative ${height} w-full overflow-hidden rounded-full`}
      ref={ref}
      style={{ backgroundColor: track }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full ease-out"
        style={{
          width: inView ? `${safePct}%` : "0%",
          backgroundColor: accent,
          transition: `width ${durationMs}ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delayMs}ms`,
        }}
      />
    </div>
  );
}
