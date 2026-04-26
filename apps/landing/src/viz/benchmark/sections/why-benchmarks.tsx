import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";

export function WhyBenchmarksSection() {
  return (
    <section className="relative border-white/15 border-t bg-[rgb(var(--bg-deep))]">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="01" title="Why benchmarks" />
        </Reveal>
        <div className="mt-10 grid gap-12 lg:grid-cols-[5fr_7fr]">
          <Reveal>
            <h2 className="text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
              You can&rsquo;t improve an agent you can&rsquo;t score.
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <div className="space-y-6 text-base text-white/70 leading-relaxed md:text-lg">
              <p>
                Agents are large, opaque systems. The harness around them
                &mdash; tools, sandboxing, prompt scaffolding, planning loops
                &mdash; changes faster than the model itself. Without a frozen,
                reproducible benchmark, every release looks like a vibe shift.
                Regressions ship silently. Wins are unverifiable.
              </p>
              <p>
                A benchmark gives you something stronger than intuition: a
                signed contract with reality. It defines the task, the inputs,
                the success criteria, and the scoring rule. Once you&rsquo;ve
                got that, every change &mdash; a new model, a new tool, a
                different planner &mdash; produces a number you can compare.
              </p>
              <p>
                For a security agent, the stakes are sharper. A regression
                isn&rsquo;t a slower demo &mdash; it&rsquo;s a missed CVE in
                production code. The benchmark has to reflect the actual job.
              </p>
            </div>
          </Reveal>
        </div>
        <Reveal delayMs={240}>
          <BenchmarkLoopDiagram />
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

interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

const DIAGRAM_NODES: DiagramNode[] = [
  { id: "model", label: "Model", x: 80, y: 120 },
  { id: "harness", label: "Harness", x: 280, y: 60 },
  { id: "task", label: "Benchmark task", x: 480, y: 120 },
  { id: "score", label: "Score", x: 680, y: 60 },
  { id: "delta", label: "Δ vs last run", x: 480, y: 200 },
];

const DIAGRAM_EDGES: [string, string][] = [
  ["model", "harness"],
  ["harness", "task"],
  ["task", "score"],
  ["score", "delta"],
  ["delta", "model"],
];

const DIAGRAM_NODE_MAP = new Map(DIAGRAM_NODES.map((n) => [n.id, n]));

function BenchmarkLoopDiagram() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      className="mt-16 overflow-x-auto rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-10"
      ref={ref}
    >
      <svg
        aria-label="Benchmark feedback loop"
        className="w-full max-w-4xl"
        role="img"
        viewBox="0 0 800 280"
      >
        <title>Benchmark feedback loop</title>
        <defs>
          <marker
            id="arrow"
            markerHeight="6"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="3"
            viewBox="0 0 6 6"
          >
            <path d="M0,0 L6,3 L0,6 z" fill="rgba(244, 248, 255, 0.85)" />
          </marker>
        </defs>
        {DIAGRAM_EDGES.map(([from, to], idx) => {
          const a = DIAGRAM_NODE_MAP.get(from);
          const b = DIAGRAM_NODE_MAP.get(to);
          if (!(a && b)) {
            return null;
          }
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          return (
            <line
              key={`${from}->${to}`}
              markerEnd="url(#arrow)"
              stroke="rgba(244, 248, 255, 0.7)"
              strokeDasharray="6 6"
              strokeDashoffset={inView ? 0 : length}
              strokeWidth="1.6"
              style={{
                animation: inView
                  ? "flow-dash 1.4s linear infinite"
                  : undefined,
                transition: `stroke-dashoffset 900ms cubic-bezier(0.2, 0.7, 0.2, 1) ${idx * 180}ms`,
              }}
              x1={a.x}
              x2={b.x}
              y1={a.y}
              y2={b.y}
            />
          );
        })}
        {DIAGRAM_NODES.map((n, idx) => (
          <g
            key={n.id}
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 600ms ease-out ${idx * 140}ms`,
            }}
            transform={`translate(${n.x}, ${n.y})`}
          >
            <rect
              fill="rgba(8, 28, 82, 0.92)"
              height="40"
              rx="10"
              stroke="rgba(244, 248, 255, 0.55)"
              width="160"
              x="-80"
              y="-20"
            />
            <text
              fill="rgb(244, 248, 255)"
              fontFamily="var(--font-mono)"
              fontSize="13"
              textAnchor="middle"
              y="5"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-6 max-w-2xl text-sm text-white/80">
        Without the loop, every change to the harness or model is anecdotal. The
        benchmark is the ground that lets you tell signal from noise.
      </p>
    </div>
  );
}
