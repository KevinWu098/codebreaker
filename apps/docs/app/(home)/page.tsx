import { ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import Link from "next/link";

const STATS = [
  { value: "138+", label: "Tasks" },
  { value: "11", label: "Languages" },
  { value: "13", label: "Vuln Classes" },
  { value: "8", label: "Ecosystems" },
];

const DIFFERENTIATORS = [
  {
    title: "Beyond C/C++ memory safety",
    description:
      "Existing benchmarks focus narrowly on buffer overflows and use-after-free in C/C++. ECVEBench covers 13 vulnerability classes across 11 languages — injection, XSS, auth bypass, crypto weaknesses, and more.",
  },
  {
    title: "Localization over detection",
    description:
      "Modern models almost always detect that a vulnerability exists. ECVEBench scores on file-level localization recall (70% of the composite) — the hard part that actually matters in triage.",
  },
  {
    title: "Real advisories, not synthetic",
    description:
      "Every task is sourced from a reviewed GitHub Security Advisory with a known patch commit, CWE mapping, and CVSS score. No synthetic injections or CTF puzzles.",
  },
  {
    title: "Difficulty as a runtime parameter",
    description:
      "Four levels (L0–L3) from zero-context discovery to hint-assisted localization. One task, four evaluations — difficulty is not baked into the data.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="border-fd-border border-b">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
          <h1 className="font-extrabold text-4xl tracking-tight sm:text-6xl">
            ECVEBench
          </h1>
          <p className="max-w-xl text-fd-muted-foreground text-lg leading-relaxed">
            A multi-language benchmark for evaluating AI agents on real-world
            vulnerability detection and localization.
          </p>
          <div className="flex items-center gap-3">
            <Link
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2 font-semibold text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
              href="/docs"
            >
              <BookOpen className="size-4" />
              Docs
            </Link>
            <a
              className="inline-flex items-center gap-2 rounded-lg border border-fd-border px-5 py-2 font-semibold text-sm transition-colors hover:bg-fd-accent"
              href="https://github.com/KevinWu098/codebreaker"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-fd-border border-b">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {STATS.map((s) => (
            <div
              className="flex flex-col items-center gap-1 py-8"
              key={s.label}
            >
              <span className="font-bold text-2xl tabular-nums">{s.value}</span>
              <span className="text-fd-muted-foreground text-xs">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Differentiators */}
      <section className="border-fd-border border-b py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="flex flex-col gap-10">
            {DIFFERENTIATORS.map((d) => (
              <div className="flex flex-col gap-2" key={d.title}>
                <h3 className="font-semibold text-fd-foreground">{d.title}</h3>
                <p className="text-fd-muted-foreground text-sm leading-relaxed">
                  {d.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scoring */}
      <section className="border-fd-border border-b py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h3 className="mb-6 font-semibold text-fd-foreground">
            Gated scoring
          </h3>
          <div className="rounded-lg border border-fd-border bg-fd-card font-mono text-sm">
            <div className="border-fd-border border-b px-5 py-3">
              <span className="text-fd-muted-foreground">wrong detection</span>
              {" → "}
              <span className="text-red-500">0</span>
            </div>
            <div className="px-5 py-3">
              <span className="text-fd-muted-foreground">otherwise</span>
              {" → "}
              0.3 × class + 0.7 × location recall
            </div>
          </div>
          <p className="mt-4 text-fd-muted-foreground text-sm">
            Localization recall is the dominant signal. In triage, missing the
            vulnerable file is expensive — flagging an extra file is cheap.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6">
          <p className="text-fd-muted-foreground text-sm">
            Read the docs, explore the dataset, or run the scorer against your
            agent&apos;s output.
          </p>
          <div>
            <Link
              className="inline-flex items-center gap-2 font-medium text-fd-primary text-sm hover:underline"
              href="/docs"
            >
              Get started
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
