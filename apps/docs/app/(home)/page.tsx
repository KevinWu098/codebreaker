import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">
          ECVEBench
        </h1>
        <p className="max-w-2xl text-fd-muted-foreground text-lg">
          A large-scale, multi-language cybersecurity benchmark for evaluating
          AI agents on real-world vulnerability detection and localization
          tasks.
        </p>
      </div>

      <div className="mt-4 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          className="rounded-xl border bg-fd-card p-6 text-left transition-colors hover:bg-fd-accent"
          href="/docs"
        >
          <h3 className="mb-1 font-semibold">Documentation</h3>
          <p className="text-fd-muted-foreground text-sm">
            Benchmark design, task format, scoring methodology, and schemas.
          </p>
        </Link>
        <Link
          className="rounded-xl border bg-fd-card p-6 text-left transition-colors hover:bg-fd-accent"
          href="/docs/data/statistics"
        >
          <h3 className="mb-1 font-semibold">Statistics</h3>
          <p className="text-fd-muted-foreground text-sm">
            Dataset distribution across languages, vulnerability classes, and
            ecosystems.
          </p>
        </Link>
        <Link
          className="rounded-xl border bg-fd-card p-6 text-left transition-colors hover:bg-fd-accent"
          href="/docs/data/explorer"
        >
          <h3 className="mb-1 font-semibold">Task Explorer</h3>
          <p className="text-fd-muted-foreground text-sm">
            Browse and filter all curated tasks interactively.
          </p>
        </Link>
      </div>

      <div className="mt-2 flex flex-row gap-3">
        <Link
          className="rounded-lg bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
          href="/docs"
        >
          Get Started
        </Link>
        <a
          className="rounded-lg border px-6 py-2.5 font-medium text-sm transition-colors hover:bg-fd-accent"
          href="https://github.com/KevinWu098/codebreaker"
          rel="noopener noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
