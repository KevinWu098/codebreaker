import { useEffect } from "react";
import { CurationEngine } from "@/animations/benchmark/engine";

export function BenchmarkAnimationPage() {
  useEffect(() => {
    document.body.dataset.page = "animation-benchmark";
    document.title = "ECVEBench · curation engine";
    return () => {
      document.body.removeAttribute("data-page");
    };
  }, []);

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--ink))]">
      <Header />
      <main>
        <div className="mx-auto w-full max-w-6xl px-6 pt-12 pb-8 md:px-10 md:pt-16 md:pb-10">
          <div className="flex items-center gap-3 text-white/65 text-xs uppercase tracking-[0.2em]">
            <span className="font-mono">animation</span>
            <span className="inline-block h-px w-8 bg-white/30" />
            <span>curation engine · looped</span>
          </div>
          <h1 className="mt-6 max-w-3xl text-balance font-semibold text-3xl text-white leading-[1.1] tracking-tight md:text-5xl">
            How a novel cybersecurity dataset is curated &mdash; and why finding
            the bug is the hard part.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-white/75 leading-relaxed md:text-lg">
            A continuous loop showing the full ECVEBench pipeline: 30,000 GitHub
            advisories filtered, transformed, and localized into 138
            schema-validated tasks. The bottom panel shows what the agent has to
            do at evaluation time.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[1640px] px-3 md:px-6">
          <CurationEngine />
        </div>

        <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
          <div className="grid gap-3 text-xs md:grid-cols-3">
            <Note
              label="Input"
              sub="reviewed · linked patch · CWE · CVSS"
              value="GitHub Advisory Database"
            />
            <Note
              label="Curator"
              sub="one PR per task · reviewer in the loop"
              value="Devin agents"
            />
            <Note
              label="Output"
              sub="138 tasks · 13 classes · schema-validated"
              value="ECVEBench v0.1.0"
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-white/15 border-b bg-[rgb(var(--bg))]/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
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
          <a
            className="rounded-full px-3 py-1.5 hover:text-white"
            href="/viz/harness"
          >
            Viz · Harness
          </a>
          <span
            aria-current="page"
            className="rounded-full bg-white/10 px-3 py-1.5 text-white"
          >
            Animation · Curation
          </span>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-white/15 border-t bg-[rgb(var(--bg-deep))]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-10 text-white/60 text-xs md:flex-row md:items-center md:justify-between md:px-10">
        <span>ECVEBench · curation engine animation · looped</span>
        <span className="font-mono">codebreaker · /animations/benchmark</span>
      </div>
    </footer>
  );
}

function Note({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] text-white/55 uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-2 text-sm text-white">{value}</div>
      <div className="mt-1 font-mono text-[11px] text-white/55">{sub}</div>
    </div>
  );
}
