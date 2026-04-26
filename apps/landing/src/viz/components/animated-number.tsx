import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  durationMs?: number;
  format?: (value: number) => string;
  value: number;
}

const DEFAULT_DURATION_MS = 1400;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function defaultFormat(value: number): string {
  return Math.round(value).toLocaleString();
}

export function AnimatedNumber({
  value,
  durationMs = DEFAULT_DURATION_MS,
  format = defaultFormat,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const startTs = performance.now();
          let raf = 0;
          const tick = (now: number) => {
            const elapsed = now - startTs;
            const t = Math.min(1, elapsed / durationMs);
            setDisplay(value * easeOutCubic(t));
            if (t < 1) {
              raf = requestAnimationFrame(tick);
            }
          };
          raf = requestAnimationFrame(tick);
          observer.disconnect();
          return () => cancelAnimationFrame(raf);
        }
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span className="tabular-nums" ref={ref}>
      {format(display)}
    </span>
  );
}
