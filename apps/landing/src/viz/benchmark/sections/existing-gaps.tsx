import { EXISTING_BENCHMARKS } from "@/viz/benchmark/data";
import { AnimatedBar } from "@/viz/components/animated-bar";
import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";

export function ExistingGapsSection() {
  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="02" title="Why existing benchmarks fall short" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Most vulnerability benchmarks were not built for agents &mdash; and
            they show it.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <GapCard
            chartLabel="Pass rate, frontier models"
            description="When the top of the leaderboard is at 90%+, the benchmark stops resolving the differences between systems. Headline numbers go up, real-world capability barely budges."
            number="84–91%"
            title="Saturated"
            visual={<SaturationCurve />}
          />
          <GapCard
            chartLabel="Share of memory-safety bugs"
            description="CyberGYM and friends inherit NVD's C/C++ bias. Buffer overflows and use-after-free are real, but they're a tiny slice of what shows up in modern web, ML, and infrastructure code."
            number="≈90%"
            title="Memory-bug heavy"
            visual={<MemoryBiasChart />}
          />
          <GapCard
            chartLabel="Designed for"
            description="Function-level snippets and labeled patches were built for static classifiers. An agent works on a repo, with tools, over many turns. The interface mismatch loses information."
            number="Not agents"
            title="Wrong shape"
            visual={<ShapeMismatch />}
          />
        </div>

        <Reveal delayMs={240}>
          <ComparisonTable />
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

interface GapCardProps {
  chartLabel: string;
  description: string;
  number: string;
  title: string;
  visual: React.ReactNode;
}

function GapCard({
  title,
  number,
  description,
  chartLabel,
  visual,
}: GapCardProps) {
  return (
    <Reveal>
      <div className="group flex h-full min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.06]">
        <div className="break-words font-mono font-semibold text-3xl text-white tabular-nums leading-tight md:text-4xl">
          {number}
        </div>
        <div className="mt-1 font-medium text-base text-white">{title}</div>
        <div className="mt-6 min-w-0 rounded-xl border border-white/15 bg-black/25 p-4 transition-colors duration-300 group-hover:border-white/25">
          {visual}
          <div className="mt-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
            {chartLabel}
          </div>
        </div>
        <p className="mt-6 text-sm text-white/80 leading-relaxed">
          {description}
        </p>
      </div>
    </Reveal>
  );
}

const SAT_POINTS: [number, number][] = [
  [0, 60],
  [12, 50],
  [25, 38],
  [40, 22],
  [60, 12],
  [80, 8],
  [100, 6],
];
const SAT_PATH = SAT_POINTS.map(
  ([x, y], i) => `${i === 0 ? "M" : "L"} ${x},${y}`
).join(" ");
const SAT_PATH_LENGTH = 220;

function SaturationCurve() {
  const { ref, inView } = useInView<SVGSVGElement>();
  return (
    <svg
      aria-hidden="true"
      className="h-24 w-full"
      preserveAspectRatio="none"
      ref={ref}
      viewBox="0 0 100 70"
    >
      <line
        stroke="rgba(255,255,255,0.18)"
        strokeDasharray="2 2"
        x1="0"
        x2="100"
        y1="6"
        y2="6"
      />
      <path
        d={SAT_PATH}
        fill="none"
        stroke="rgba(244, 248, 255, 0.95)"
        strokeDasharray={SAT_PATH_LENGTH}
        strokeDashoffset={inView ? 0 : SAT_PATH_LENGTH}
        strokeLinecap="round"
        strokeWidth="2"
        style={{
          transition: "stroke-dashoffset 1600ms cubic-bezier(0.2, 0.7, 0.2, 1)",
        }}
      />
      {SAT_POINTS.map(([x, y], i) => (
        <circle
          cx={x}
          cy={y}
          fill="rgba(244, 248, 255, 0.95)"
          key={`${x}-${y}`}
          r={x === 100 ? 3 : 1.5}
          style={{
            opacity: inView ? 1 : 0,
            transition: `opacity 400ms ease-out ${600 + i * 120}ms`,
          }}
        />
      ))}
      <text
        fill="rgba(255,255,255,0.65)"
        fontFamily="var(--font-mono)"
        fontSize="6"
        x="0"
        y="68"
      >
        2018
      </text>
      <text
        fill="rgba(255,255,255,0.65)"
        fontFamily="var(--font-mono)"
        fontSize="6"
        textAnchor="end"
        x="100"
        y="68"
      >
        2025
      </text>
    </svg>
  );
}

const MEM_SLICES = [
  { label: "Buffer overflow", value: 38, color: "rgb(244, 248, 255)" },
  { label: "Use-after-free", value: 24, color: "rgb(195, 215, 255)" },
  { label: "Integer overflow", value: 16, color: "rgb(146, 180, 255)" },
  { label: "Null deref", value: 13, color: "rgb(102, 142, 240)" },
  { label: "All other", value: 9, color: "rgba(255,255,255,0.22)" },
];

function MemoryBiasChart() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-white/10">
        {MEM_SLICES.map((s, i) => (
          <div
            key={s.label}
            style={{
              width: inView ? `${s.value}%` : "0%",
              backgroundColor: s.color,
              transition: `width 900ms cubic-bezier(0.2, 0.7, 0.2, 1) ${i * 120}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-1 text-[11px] text-white/80">
        {MEM_SLICES.map((s) => (
          <div className="flex items-center gap-1.5" key={s.label}>
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShapeMismatch() {
  return (
    <div className="space-y-2 font-mono text-[11px]">
      <div className="rounded-md bg-black/30 p-2">
        <div className="text-white/60">benchmark format</div>
        <div className="mt-1 text-white/80">
          <span className="text-white/70">{"{"}</span> code:{" "}
          <span className="text-white/80">"...12 lines..."</span>, label:{" "}
          <span className="text-white/80">CWE-89</span>{" "}
          <span className="text-white/70">{"}"}</span>
        </div>
      </div>
      <div className="text-center text-white/45">vs.</div>
      <div className="rounded-md border border-white/15 bg-black/30 p-2">
        <div className="text-white/60">agent reality</div>
        <div className="mt-1 text-white/80">repo · tools · plan · score</div>
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="mt-16 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04]">
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[minmax(160px,_1.2fr)_minmax(160px,_2fr)_minmax(160px,_2fr)_minmax(96px,_0.8fr)] items-center gap-4 border-white/15 border-b px-6 py-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
            <span>Benchmark</span>
            <span>Saturation</span>
            <span>Memory-safety share</span>
            <span>Agent-native</span>
          </div>
          {EXISTING_BENCHMARKS.map((bench, idx) => {
            const isOurs = bench.name === "ECVEBench";
            const accent = isOurs
              ? "rgb(244, 248, 255)"
              : "rgba(244, 248, 255, 0.55)";
            return (
              <div
                className={`grid grid-cols-[minmax(160px,_1.2fr)_minmax(160px,_2fr)_minmax(160px,_2fr)_minmax(96px,_0.8fr)] items-center gap-4 border-white/10 border-b px-6 py-4 transition-colors duration-200 last:border-b-0 hover:bg-white/[0.05] ${isOurs ? "bg-white/[0.06] ring-1 ring-white/20 ring-inset" : ""}`}
                key={bench.name}
              >
                <div className="min-w-0">
                  <div
                    className={`font-medium text-sm ${isOurs ? "text-white" : "text-white/85"}`}
                  >
                    {bench.name}
                  </div>
                  <div className="mt-0.5 break-words text-[11px] text-white/65 leading-snug">
                    {bench.note}
                  </div>
                </div>
                <BarWithValue
                  accent={accent}
                  delayMs={idx * 90}
                  value={bench.saturation * 100}
                />
                <BarWithValue
                  accent={accent}
                  delayMs={idx * 90 + 40}
                  value={bench.memorySafetyShare * 100}
                />
                <div
                  className={`font-mono text-xs ${isOurs ? "text-white" : "text-white/80"}`}
                >
                  {bench.agentNative ? "yes" : "no"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BarWithValue({
  value,
  accent,
  delayMs,
}: {
  value: number;
  accent: string;
  delayMs: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <AnimatedBar accent={accent} delayMs={delayMs} pct={pct} />
      </div>
      <div className="w-10 shrink-0 text-right font-mono text-white/85 text-xs tabular-nums">
        {Math.round(value)}%
      </div>
    </div>
  );
}
