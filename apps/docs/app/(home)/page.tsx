import Link from "next/link";

const STATS = [
  { value: "138", label: "Curated Tasks" },
  { value: "11", label: "Languages" },
  { value: "13", label: "Vuln Classes" },
  { value: "115", label: "Real-World Repos" },
];

const FEATURES = [
  {
    title: "Multi-Language Coverage",
    description:
      "Go, Java, Python, Rust, PHP, TypeScript, JavaScript, C, C++, C#, and Ruby — spanning 8 package ecosystems.",
    icon: (
      <svg
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.528.38-2.968 1.05-4.228"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Gated Scoring",
    description:
      "Vulnerability detection gates the score. 30% weight on classification, 70% on file-level location recall.",
    icon: (
      <svg
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Four Difficulty Levels",
    description:
      "L0 (pure discovery) through L3 (full hints). Difficulty is a runtime parameter — one task, four evaluations.",
    icon: (
      <svg
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="M6 13.5V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 9.75V10.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Real Advisories",
    description:
      "Every task is derived from a reviewed GitHub Security Advisory with a known patch commit and CWE mapping.",
    icon: (
      <svg
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "AI-Curated Pipeline",
    description:
      "Three-stage pipeline: script-based filtering and selection, then Devin AI agents for full curation at scale.",
    icon: (
      <svg
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Interactive Explorer",
    description:
      "Browse, search, and filter all tasks by language, vulnerability class, ecosystem, and CVSS score.",
    icon: (
      <svg
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const VULN_CLASSES = [
  "command-injection",
  "sql-injection",
  "xss",
  "buffer-overflow",
  "use-after-free",
  "path-traversal",
  "auth-bypass",
  "xxe",
  "insecure-deserialization",
  "crypto-weakness",
  "race-condition",
  "integer-overflow",
  "null-deref",
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-b from-fd-primary/5 to-transparent" />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-24 text-center sm:py-32">
          <div className="inline-flex items-center gap-2 rounded-full border bg-fd-card px-4 py-1.5 font-medium text-fd-muted-foreground text-xs">
            <span className="size-1.5 rounded-full bg-green-500" />
            v0.1.0 — 138 tasks across 11 languages
          </div>

          <div className="flex flex-col gap-4">
            <h1 className="font-bold text-5xl tracking-tight sm:text-7xl">
              ECVEBench
            </h1>
            <p className="mx-auto max-w-2xl text-fd-muted-foreground text-lg leading-relaxed sm:text-xl">
              A large-scale, multi-language cybersecurity benchmark for
              evaluating AI agents on real-world vulnerability detection and
              localization.
            </p>
          </div>

          <div className="flex flex-row gap-3">
            <Link
              className="rounded-lg bg-fd-primary px-8 py-3 font-semibold text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
              href="/docs"
            >
              Read the Docs
            </Link>
            <Link
              className="rounded-lg border bg-fd-background px-8 py-3 font-semibold text-sm transition-colors hover:bg-fd-accent"
              href="/docs/data/explorer"
            >
              Explore Tasks
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x sm:grid-cols-4">
          {STATS.map((stat) => (
            <div
              className="flex flex-col items-center gap-1 px-6 py-10"
              key={stat.label}
            >
              <span className="font-bold text-3xl tabular-nums sm:text-4xl">
                {stat.value}
              </span>
              <span className="text-fd-muted-foreground text-sm">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-b py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-bold text-3xl tracking-tight">
              Built for Rigorous Evaluation
            </h2>
            <p className="mt-3 text-fd-muted-foreground text-lg">
              Every design decision is grounded in real vulnerability triage
              workflows.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                className="group rounded-xl border bg-fd-card p-6 transition-colors hover:bg-fd-accent/50"
                key={feature.title}
              >
                <div className="mb-3 inline-flex rounded-lg border bg-fd-background p-2.5 text-fd-primary">
                  {feature.icon}
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-fd-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vulnerability Classes */}
      <section className="border-b py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-8 text-center">
            <h2 className="font-bold text-3xl tracking-tight">
              13 Vulnerability Classes
            </h2>
            <p className="mt-3 text-fd-muted-foreground text-lg">
              Derived from the MITRE CWE Top 25, covering the most impactful
              attack vectors.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {VULN_CLASSES.map((cls) => (
              <span
                className="rounded-full border bg-fd-card px-4 py-2 font-mono text-sm transition-colors hover:bg-fd-accent"
                key={cls}
              >
                {cls}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
          <h2 className="font-bold text-3xl tracking-tight">
            Ready to Evaluate Your Agent?
          </h2>
          <p className="text-fd-muted-foreground text-lg">
            Read the documentation, explore the dataset, and run the scorer
            against your agent&apos;s output.
          </p>
          <div className="flex flex-row gap-3">
            <Link
              className="rounded-lg bg-fd-primary px-8 py-3 font-semibold text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
              href="/docs"
            >
              Get Started
            </Link>
            <a
              className="rounded-lg border px-8 py-3 font-semibold text-sm transition-colors hover:bg-fd-accent"
              href="https://github.com/KevinWu098/codebreaker"
              rel="noopener noreferrer"
              target="_blank"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
