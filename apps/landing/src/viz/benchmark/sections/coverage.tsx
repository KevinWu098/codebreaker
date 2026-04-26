import { LANGUAGE_STATS, VULN_CLASSES } from "@/viz/benchmark/data";
import { AnimatedBar } from "@/viz/components/animated-bar";
import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";

const MEM_TOTAL = VULN_CLASSES.filter((c) => c.memorySafety).reduce(
  (sum, c) => sum + c.count,
  0
);
const ALL_TOTAL = VULN_CLASSES.reduce((sum, c) => sum + c.count, 0);
const MEM_SHARE_PCT = Math.round((MEM_TOTAL / ALL_TOTAL) * 100);

export function CoverageSection() {
  return (
    <section className="relative border-white/15 border-t bg-[rgb(var(--bg-deep))]">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="05" title="Coverage" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Balanced across the bugs that actually ship.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            Stratified sampling on CWE class plus a curation guideline that
            looks for the same vulnerability pattern across sibling files.
            Memory-safety bugs are still here &mdash; they&rsquo;re just{" "}
            <span className="text-white/90">{MEM_SHARE_PCT}%</span> of the
            dataset, not the 90% you get from a C/C++ corpus.
          </p>
        </Reveal>

        <Reveal delayMs={220}>
          <ClassBreakdown />
        </Reveal>

        <Reveal delayMs={120}>
          <div className="mt-20 grid gap-10 md:grid-cols-2">
            <LanguageBars />
            <DifficultyLevels />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-3 text-white/70 text-xs uppercase tracking-[0.2em]">
      <span className="font-mono">{index}</span>
      <span className="inline-block h-px w-8 bg-white/30" />
      <span>{title}</span>
    </div>
  );
}

function ClassBreakdown() {
  const total = VULN_CLASSES.reduce((sum, c) => sum + c.count, 0);
  const maxCount = Math.max(...VULN_CLASSES.map((c) => c.count));
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      className="mt-14 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8"
      ref={ref}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
        <span>Vulnerability class · {total} tasks</span>
        <span className="flex items-center gap-4">
          <Legend color="rgba(244, 248, 255, 0.55)" label="non-memory-safety" />
          <Legend color="rgb(244, 248, 255)" label="memory-safety" />
        </span>
      </div>
      <div className="space-y-1">
        {VULN_CLASSES.map((c, i) => {
          const pct = (c.count / maxCount) * 100;
          const sharePct = (c.count / total) * 100;
          const accent = c.memorySafety
            ? "rgb(244, 248, 255)"
            : "rgba(244, 248, 255, 0.55)";
          return (
            <div
              className="group/row grid cursor-default grid-cols-[120px_1fr_70px] items-center gap-3 rounded-md px-1.5 py-1 transition-colors duration-200 hover:bg-white/[0.04] sm:grid-cols-[160px_1fr_70px] sm:gap-4"
              key={c.id}
              title={`${c.label} · ${c.count} tasks · ${sharePct.toFixed(1)}%`}
            >
              <div className="min-w-0 truncate text-sm text-white/85 transition-colors group-hover/row:text-white">
                {c.label}
              </div>
              <div className="relative h-6 min-w-0 overflow-hidden rounded-md bg-white/[0.06]">
                <div
                  className="h-full rounded-md ease-out"
                  style={{
                    width: inView ? `${pct}%` : "0%",
                    backgroundColor: accent,
                    transition: `width 1000ms cubic-bezier(0.2, 0.7, 0.2, 1) ${i * 60}ms`,
                  }}
                />
              </div>
              <div className="flex items-baseline justify-end gap-1.5 font-mono text-xs tabular-nums">
                <span className="text-white/85">{c.count}</span>
                <span className="text-[10px] text-white/50 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100">
                  {sharePct.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function LanguageBars() {
  const max = Math.max(...LANGUAGE_STATS.map((l) => l.count));
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8">
      <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
        Language distribution
      </div>
      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        {LANGUAGE_STATS.map((l, i) => {
          const pct = (l.count / max) * 100;
          return (
            <div
              className="group/lang grid cursor-default grid-cols-[96px_1fr_36px] items-center gap-3 rounded-md px-1.5 py-1 transition-colors duration-200 hover:bg-white/[0.04]"
              key={l.language}
              title={`${l.language} · ${l.count} tasks`}
            >
              <div className="min-w-0 truncate font-mono text-sm text-white/85 transition-colors group-hover/lang:text-white">
                {l.language}
              </div>
              <div className="min-w-0">
                <AnimatedBar
                  accent="rgb(244, 248, 255)"
                  delayMs={i * 60}
                  pct={pct}
                />
              </div>
              <div className="text-right font-mono text-white/80 text-xs tabular-nums">
                {l.count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DifficultyLevels() {
  const levels: { id: string; tag: string; copy: string }[] = [
    {
      id: "L0",
      tag: "Pure discovery",
      copy: "Repo at pre-patch SHA. No hint. The agent must decide if anything is even wrong.",
    },
    {
      id: "L1",
      tag: "Vague localization",
      copy: "A broad area of the codebase (~10–20 files). No vuln details.",
    },
    {
      id: "L2",
      tag: "Scrubbed CVE",
      copy: "Mechanism and class, with all paths/functions/snippets stripped out.",
    },
    {
      id: "L3",
      tag: "Targeted",
      copy: "A specific subsystem (~3–5 files) plus distinguishing context. Hardest hint, easiest task.",
    },
  ];
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8">
      <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">
        Four difficulty projections per task
      </div>
      <div className="mt-6 space-y-3">
        {levels.map((l) => (
          <div
            className="group flex min-w-0 gap-4 rounded-lg border border-white/15 bg-black/20 p-4 transition-all duration-200 hover:border-white/30 hover:bg-black/30"
            key={l.id}
          >
            <div className="w-10 shrink-0 font-mono font-semibold text-white transition-transform duration-200 group-hover:scale-110">
              {l.id}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
                {l.tag}
              </div>
              <div className="mt-1 text-sm text-white/85 leading-relaxed">
                {l.copy}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
