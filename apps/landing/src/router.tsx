import { useEffect, useState } from "react";
import { BenchmarkAnimationPage } from "@/animations/benchmark/page";
import { SplashPage } from "@/pages/splash";
import { BenchmarkVizPage } from "@/viz/benchmark/page";
import { HarnessVizPage } from "@/viz/harness/page";

const VIZ_BENCHMARK_PATH = "/viz/benchmark";
const VIZ_HARNESS_PATH = "/viz/harness";
const ANIMATION_BENCHMARK_PATH = "/animations/benchmark";
const TRAILING_SLASH_RE = /\/+$/;

function normalizePath(path: string): string {
  if (path.length <= 1) {
    return path;
  }
  return path.replace(TRAILING_SLASH_RE, "");
}

export function Router() {
  const [path, setPath] = useState(() =>
    normalizePath(window.location.pathname)
  );

  useEffect(() => {
    const onPopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === VIZ_BENCHMARK_PATH) {
    return <BenchmarkVizPage />;
  }
  if (path === VIZ_HARNESS_PATH) {
    return <HarnessVizPage />;
  }
  if (path === ANIMATION_BENCHMARK_PATH) {
    return <BenchmarkAnimationPage />;
  }
  return <SplashPage />;
}
