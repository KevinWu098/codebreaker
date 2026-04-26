import { useEffect } from "react";
import { ArchitectureSection } from "@/viz/harness/sections/architecture";
import { InfrastructureSection } from "@/viz/harness/sections/infrastructure";
import { IntroSection } from "@/viz/harness/sections/intro";
import { RunModesSection } from "@/viz/harness/sections/run-modes";
import { ToolkitSection } from "@/viz/harness/sections/toolkit";

export function HarnessVizPage() {
  useEffect(() => {
    document.body.dataset.page = "viz-harness";
    document.title = "Harness · how it runs";
    return () => {
      document.body.removeAttribute("data-page");
    };
  }, []);

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--ink))]">
      <Header />
      <main>
        <IntroSection />
        <InfrastructureSection />
        <ToolkitSection />
        <ArchitectureSection />
        <RunModesSection />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-white/15 border-b bg-[rgb(var(--bg))]/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 md:px-12">
        <a
          aria-label="Codebreaker home"
          className="flex items-center gap-2 font-medium text-sm text-white tracking-tight transition hover:text-white/80"
          href="/"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white" />
          codebreaker
        </a>
        <nav className="hidden items-center gap-1 text-white/80 text-xs uppercase tracking-[0.18em] md:flex">
          <a className="rounded-full px-3 py-1.5 hover:text-white" href="/">
            Home
          </a>
          <a
            className="rounded-full px-3 py-1.5 hover:text-white"
            href="/viz/benchmark"
          >
            Viz · Benchmark
          </a>
          <span
            aria-current="page"
            className="rounded-full bg-white/10 px-3 py-1.5 text-white"
          >
            Viz · Harness
          </span>
          <a
            className="rounded-full px-3 py-1.5 hover:text-white"
            href="/animations/benchmark"
          >
            Animation · Curation
          </a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-white/15 border-t bg-[rgb(var(--bg-deep))]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-10 text-white/60 text-xs md:flex-row md:items-center md:justify-between md:px-12">
        <span>
          Harness · v0.1.0 · snapshot{" "}
          <span className="font-mono">2026-04-26</span>
        </span>
        <span className="font-mono">codebreaker · /viz/harness</span>
      </div>
    </footer>
  );
}
