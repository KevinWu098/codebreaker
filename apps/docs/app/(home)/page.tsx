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
    <main className="flex flex-col">
      {/* Hero */}
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 pt-24 pb-16 sm:pt-36 sm:pb-20">
        <h1 className="font-semibold text-3xl tracking-tight sm:text-5xl">
          ECVEBench
        </h1>
        <p className="max-w-md text-fd-muted-foreground leading-relaxed">
          A multi-language benchmark for evaluating AI agents on real-world
          vulnerability detection and localization.
        </p>
        <div className="flex items-center gap-4 pt-2">
          <Link
            className="inline-flex items-center gap-2 font-medium text-fd-foreground text-sm underline decoration-fd-border underline-offset-4 transition-colors hover:decoration-fd-foreground"
            href="/docs"
          >
            <BookOpen className="size-3.5" />
            Documentation
          </Link>
          <a
            className="inline-flex items-center gap-1.5 font-medium text-fd-muted-foreground text-sm transition-colors hover:text-fd-foreground"
            href="https://github.com/KevinWu098/codebreaker"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
            <ExternalLink className="size-3" />
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto w-full max-w-2xl px-6 pb-16 sm:pb-20">
        <div className="grid grid-cols-4 border-fd-border border-t">
          {STATS.map((s) => (
            <div className="flex flex-col gap-0.5 pt-5" key={s.label}>
              <span className="font-semibold text-xl tabular-nums sm:text-2xl">
                {s.value}
              </span>
              <span className="text-fd-muted-foreground text-xs">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <hr className="border-fd-border" />

      {/* Differentiators */}
      <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
        <div className="grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2">
          {DIFFERENTIATORS.map((d) => (
            <div className="flex flex-col gap-2" key={d.title}>
              <h3 className="font-medium text-fd-foreground text-sm">
                {d.title}
              </h3>
              <p className="text-[13px] text-fd-muted-foreground leading-relaxed">
                {d.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <hr className="border-fd-border" />

      {/* Scoring */}
      <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
        <h3 className="mb-1 font-medium text-fd-foreground text-sm">
          Gated scoring
        </h3>
        <p className="mb-5 text-[13px] text-fd-muted-foreground">
          A wrong detection verdict gates the entire score to zero.
        </p>
        <div className="font-mono text-[13px] text-fd-muted-foreground leading-loose">
          <span>wrong detection → </span>
          <span className="text-red-500">0</span>
          <br />
          <span>otherwise → </span>
          <span className="text-fd-foreground">
            0.3 × class + 0.7 × location&nbsp;recall
          </span>
        </div>
        <p className="mt-5 text-[13px] text-fd-muted-foreground leading-relaxed">
          Localization recall is the dominant signal. In triage, missing the
          vulnerable file is expensive — flagging an extra file is cheap.
        </p>
      </section>

      <hr className="border-fd-border" />

      {/* CTA */}
      <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
        <Link
          className="inline-flex items-center gap-1.5 font-medium text-fd-foreground text-sm underline decoration-fd-border underline-offset-4 transition-colors hover:decoration-fd-foreground"
          href="/docs"
        >
          Get started
          <ArrowRight className="size-3.5" />
        </Link>
      </section>
    </main>
  );
}
