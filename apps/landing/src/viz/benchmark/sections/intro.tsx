import { AnimatedNumber } from "@/viz/components/animated-number";
import { Reveal } from "@/viz/components/reveal";

export function IntroSection() {
  return (
    <section className="relative mx-auto w-full max-w-7xl px-6 pt-24 pb-32 md:px-12 md:pt-32">
      <Reveal>
        <div className="mb-6 flex items-center gap-3 text-white/70 text-xs uppercase tracking-[0.2em]">
          <span className="inline-block h-px w-8 bg-white/30" />
          <span>Research notebook · 01 / Benchmark</span>
        </div>
      </Reveal>
      <Reveal delayMs={80}>
        <h1 className="text-balance font-semibold text-5xl text-white leading-[1.05] tracking-tight md:text-7xl">
          A benchmark that actually measures what we want from a
          vulnerability-hunting agent.
        </h1>
      </Reveal>
      <Reveal delayMs={160}>
        <p className="mt-8 max-w-4xl text-balance text-lg text-white/80 leading-relaxed md:text-xl">
          Codebreaker is an autonomous agent that finds and reports software
          vulnerabilities in the wild. Before we tuned a single prompt or wrote
          a single tool, we built the benchmark we wished existed: 138 real
          vulnerabilities, drawn from the GitHub Advisory Database, projected
          into agent-shaped tasks at four levels of difficulty.
        </p>
      </Reveal>
      <Reveal delayMs={240}>
        <div className="mt-14 grid grid-cols-2 gap-6 border-white/15 border-t pt-8 md:grid-cols-4">
          <Stat label="Curated tasks" value={138} />
          <Stat label="Unique projects" value={115} />
          <Stat label="Vulnerability classes" value={13} />
          <Stat label="Languages covered" value={11} />
        </div>
      </Reveal>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="group min-w-0">
      <div className="font-mono font-semibold text-3xl text-white tabular-nums leading-tight transition-colors group-hover:text-white md:text-4xl">
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-2 text-white/70 text-xs uppercase tracking-[0.18em] transition-colors group-hover:text-white/90">
        {label}
      </div>
    </div>
  );
}
