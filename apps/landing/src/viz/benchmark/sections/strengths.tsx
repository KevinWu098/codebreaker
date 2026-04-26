import { FRONTIER_RESULTS } from "@/viz/benchmark/data";
import { AnimatedBar } from "@/viz/components/animated-bar";
import { Reveal } from "@/viz/components/reveal";

export function StrengthsSection() {
  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="06" title="The benchmark is hard" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Frontier models hover around 40%. There is a long way to go.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            Detection is mostly solved &mdash; current models almost always tell
            you <em>that</em> something is wrong. So we gate on it. The score
            lives in <em>where</em> and <em>what</em>: classifying the vuln,
            then localizing it to file and function. That&rsquo;s the part
            that&rsquo;s actually useful, and that&rsquo;s the part the current
            frontier is bad at.
          </p>
        </Reveal>

        <Reveal delayMs={220}>
          <FrontierBoard />
        </Reveal>

        <Reveal delayMs={120}>
          <div className="mt-20 grid gap-6 lg:grid-cols-3">
            <ScoringCard />
            <StrengthCard
              body="One record per GHSA, projected into four difficulty-specific inputs at runtime. Same ground truth, different amount of help. You can read off how much of an agent's score comes from prompting versus from real capability."
              eyebrow="Why agents care"
              title="Difficulty is a parameter, not a separate task"
            />
            <StrengthCard
              body="An agent may return up to three candidate hypotheses per task. The scorer keeps the oracle-best. Real security review finds multiple suspicious things; we score the one closest to truth, not the one written first."
              eyebrow="Multi-candidate"
              title="Up to three hypotheses, oracle-best wins"
            />
          </div>
        </Reveal>

        <Reveal delayMs={140}>
          <ClosingCallout />
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

function FrontierBoard() {
  return (
    <div className="mt-14 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04]">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(180px,_1.2fr)_1fr_1fr_1fr] gap-4 border-white/15 border-b px-6 py-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
            <span>Model</span>
            <span>L1 score</span>
            <span>L2 score</span>
            <span>L3 score</span>
          </div>
          {FRONTIER_RESULTS.map((row, idx) => (
            <div
              className="group/row grid grid-cols-[minmax(180px,_1.2fr)_1fr_1fr_1fr] items-center gap-4 border-white/10 border-b px-6 py-4 transition-colors duration-200 last:border-b-0 hover:bg-white/[0.05]"
              key={row.model}
            >
              <div className="min-w-0 truncate font-medium text-sm text-white">
                {row.model}
              </div>
              <ScoreCell delayMs={idx * 90} value={row.l1} />
              <ScoreCell delayMs={idx * 90 + 60} value={row.l2} />
              <ScoreCell delayMs={idx * 90 + 120} value={row.l3} />
            </div>
          ))}
        </div>
      </div>
      <div className="border-white/15 border-t bg-white/[0.04] px-6 py-3 text-white/75 text-xs leading-relaxed">
        Score = <span className="font-mono">0</span> if vulnerable verdict
        wrong; otherwise{" "}
        <span className="font-mono text-white">
          0.3 · class_correct + 0.7 · location_recall
        </span>
        . Sibling files in the same directory get half-credit.
      </div>
    </div>
  );
}

function ScoreCell({ value, delayMs }: { value: number; delayMs: number }) {
  const pct = value * 100;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <AnimatedBar accent="rgb(244, 248, 255)" delayMs={delayMs} pct={pct} />
      </div>
      <div className="w-10 shrink-0 text-right font-mono text-white text-xs tabular-nums">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

function ScoringCard() {
  return (
    <div className="group flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.06]">
      <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
        Why gated scoring
      </div>
      <h3 className="mt-3 font-medium text-base text-white">
        Localization is the dominant signal
      </h3>
      <p className="mt-3 text-sm text-white/85 leading-relaxed">
        Detection inflates every score without resolving any agent. We collapse
        it into a binary gate. The remaining 100% is split{" "}
        <span className="font-mono text-white">30 / 70</span> between
        classification and file-level recall &mdash; the parts a security
        reviewer actually needs.
      </p>
      <div className="mt-5 min-w-0 space-y-1.5 overflow-x-auto rounded-md bg-black/40 p-4 font-mono text-[11.5px] leading-relaxed">
        <div className="text-white/85">
          <span className="text-white/65">if</span> !vulnerable_correct{" "}
          <span className="text-white/65">→</span> 0
        </div>
        <div className="text-white/85">
          <span className="text-white/65">else</span>{" "}
          <span className="text-white/65">→</span> 0.3 · class_correct
        </div>
        <div className="pl-[3.25rem] text-white/85">
          + 0.7 · location_recall
        </div>
      </div>
    </div>
  );
}

function StrengthCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="group flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.06]">
      <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
        {eyebrow}
      </div>
      <h3 className="mt-3 font-medium text-base text-white">{title}</h3>
      <p className="mt-3 text-sm text-white/85 leading-relaxed">{body}</p>
    </div>
  );
}

function ClosingCallout() {
  return (
    <div className="mt-24 rounded-2xl border border-white/15 bg-gradient-to-br from-white/[0.06] to-transparent p-8 md:p-12">
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr] lg:items-end">
        <div>
          <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">
            What we use it for
          </div>
          <h3 className="mt-3 font-semibold text-2xl text-white leading-tight md:text-3xl">
            Every change to the Codebreaker harness is backed by our benchmark.
          </h3>
        </div>
      </div>
    </div>
  );
}
