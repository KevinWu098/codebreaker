import { AnimatedNumber } from "@/viz/components/animated-number";
import { Reveal } from "@/viz/components/reveal";
import { TOOLKIT_STATS } from "@/viz/harness/data";

export function IntroSection() {
  return (
    <section className="relative mx-auto w-full max-w-7xl px-6 pt-24 pb-32 md:px-12 md:pt-32">
      <Reveal>
        <div className="mb-6 flex items-center gap-3 text-white/70 text-xs uppercase tracking-[0.2em]">
          <span className="inline-block h-px w-8 bg-white/30" />
          <span>Research notebook · 02 / Harness</span>
        </div>
      </Reveal>
      <Reveal delayMs={80}>
        <h1 className="text-balance font-semibold text-5xl text-white leading-[1.05] tracking-tight md:text-7xl">
          One Worker, four agent classes, and a Modal sandbox doing the hands-on
          work.
        </h1>
      </Reveal>
      <Reveal delayMs={160}>
        <p className="mt-8 max-w-4xl text-balance text-lg text-white/80 leading-relaxed md:text-xl">
          Codebreaker&rsquo;s harness lives in two places: a single Cloudflare
          Worker (
          <span className="font-mono text-white/90">
            codebreaker-control-plane
          </span>
          ) that owns run state in D1 and four Durable Object classes for live
          agents, and a Python FastAPI shim deployed on Modal (
          <span className="font-mono text-white/90">
            codebreaker-modal-shim
          </span>
          ) that owns sandboxed exec, file IO, and git checkout.
        </p>
      </Reveal>
      <Reveal delayMs={240}>
        <div className="mt-14 grid grid-cols-2 gap-6 border-white/15 border-t pt-8 md:grid-cols-4">
          {TOOLKIT_STATS.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="group min-w-0">
      <div className="font-mono font-semibold text-3xl text-white tabular-nums leading-tight transition-colors md:text-4xl">
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-2 text-white/70 text-xs uppercase tracking-[0.18em] transition-colors group-hover:text-white/90">
        {label}
      </div>
    </div>
  );
}
