import { type RefObject, useEffect, useRef, useState } from "react";

interface InViewState<T extends Element> {
  inView: boolean;
  ref: RefObject<T | null>;
}

const DEFAULT_THRESHOLD = 0.2;

export function useInView<T extends Element>(
  threshold: number = DEFAULT_THRESHOLD
): InViewState<T> {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}
