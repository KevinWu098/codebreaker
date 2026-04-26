import type { CSSProperties } from "react";
import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";
import {
  BENCHMARK_FLOW,
  DURABLE_OBJECTS,
  PLATFORM_LAYERS,
} from "@/viz/harness/data";

export function InfrastructureSection() {
  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="01" title="Where it runs" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Stateless edge for orchestration. Sandboxed compute for the agent.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            Routing, run state, and the agent runtime live on Cloudflare. Every
            shell command, file read, and git checkout happens inside a Modal
            sandbox owned by{" "}
            <span className="font-mono text-white/90">
              codebreaker-modal-shim
            </span>
            . The Worker speaks to the shim over HTTP with a bearer secret, with
            idempotency keys on every POST and a 15-second cap on each remote
            tool call.
          </p>
        </Reveal>

        <Reveal delayMs={220}>
          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {PLATFORM_LAYERS.map((layer) => (
              <PlatformCard key={layer.id} layer={layer} />
            ))}
          </div>
        </Reveal>

        <Reveal delayMs={280}>
          <DurableObjectsTable />
        </Reveal>

        <Reveal delayMs={140}>
          <FlowDiagram />
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

const PLATFORM_ACCENT: Record<
  (typeof PLATFORM_LAYERS)[number]["id"],
  { rgb: string; tintBg: string; tintBorder: string; chipBg: string }
> = {
  edge: {
    rgb: "243, 128, 32",
    tintBg: "rgba(243, 128, 32, 0.06)",
    tintBorder: "rgba(243, 128, 32, 0.35)",
    chipBg: "rgba(243, 128, 32, 0.14)",
  },
  compute: {
    rgb: "126, 217, 87",
    tintBg: "rgba(126, 217, 87, 0.06)",
    tintBorder: "rgba(126, 217, 87, 0.35)",
    chipBg: "rgba(126, 217, 87, 0.14)",
  },
};

function PlatformCard({ layer }: { layer: (typeof PLATFORM_LAYERS)[number] }) {
  const accent = PLATFORM_ACCENT[layer.id];
  return (
    <div
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-0.5"
      style={
        {
          "--accent": `rgb(${accent.rgb})`,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ backgroundColor: `rgba(${accent.rgb}, 0.55)` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(120% 80% at 0% 0%, ${accent.tintBg}, transparent 60%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl border border-transparent transition-colors duration-300 group-hover:border-[var(--hover-border)]"
        style={
          {
            "--hover-border": accent.tintBorder,
          } as CSSProperties
        }
      />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
          {layer.id === "edge" ? "Control plane" : "Data plane"}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] tracking-[0.04em]"
          style={{
            backgroundColor: accent.chipBg,
            border: `1px solid ${accent.tintBorder}`,
            color: `rgb(${accent.rgb})`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: `rgb(${accent.rgb})` }}
          />
          {layer.vendor}
        </span>
      </div>
      <div className="relative mt-3 font-medium text-base text-white">
        {layer.name}
      </div>
      <p className="relative mt-3 text-sm text-white/85 leading-relaxed">
        {layer.blurb}
      </p>
      <ul className="relative mt-6 space-y-1.5 border-white/15 border-t pt-4">
        {layer.bullets.map((b) => (
          <li
            className="flex items-start gap-3 font-mono text-[12px] text-white/85 leading-relaxed"
            key={b}
          >
            <span
              className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: `rgb(${accent.rgb})` }}
            />
            <span className="min-w-0 break-words">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DurableObjectsTable() {
  return (
    <div className="mt-12 overflow-x-auto rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8">
      <div className="mb-4 flex items-center justify-between gap-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
        <span>Durable Object bindings</span>
        <span className="font-mono text-white/85">
          control-plane/wrangler.jsonc
        </span>
      </div>
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1fr_1.1fr_1.6fr] gap-4 border-white/15 border-b pb-2 text-[10px] text-white/65 uppercase tracking-[0.16em]">
          <span>Binding</span>
          <span>Class</span>
          <span>Role</span>
        </div>
        {DURABLE_OBJECTS.map((d) => (
          <div
            className="grid grid-cols-[1fr_1.1fr_1.6fr] gap-4 border-white/10 border-b py-3 transition-colors duration-200 last:border-b-0 hover:bg-white/[0.04]"
            key={d.binding}
          >
            <span className="break-all font-mono text-[12px] text-white/85 tabular-nums">
              {d.binding}
            </span>
            <span className="break-all font-mono text-[12px] text-white">
              {d.className}
            </span>
            <span className="text-[12.5px] text-white/85 leading-relaxed">
              <span className="block font-medium text-white">{d.role}</span>
              <span className="block text-white/75">{d.blurb}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FLOW_LANE_LABELS = [
  "Cloudflare Worker",
  "Durable Object",
  "Modal sandbox",
];
const FLOW_LANE_INDEX: Record<
  (typeof BENCHMARK_FLOW)[number]["actor"],
  number
> = {
  edge: 0,
  do: 1,
  modal: 2,
};

function FlowDiagram() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const stepCount = BENCHMARK_FLOW.length;
  const laneHeight = 60;
  const laneGap = 12;
  const laneStride = laneHeight + laneGap;
  const padTop = 28;
  const padLeft = 160;
  const padRight = 24;
  const colWidth = 110;
  const totalWidth = padLeft + padRight + colWidth * (stepCount - 1);
  const totalHeight = padTop + FLOW_LANE_LABELS.length * laneStride + 8;

  const points = BENCHMARK_FLOW.map((step, i) => {
    const lane = FLOW_LANE_INDEX[step.actor];
    const x = padLeft + i * colWidth;
    const y = padTop + laneStride * lane + laneHeight / 2;
    return { step, x, y };
  });

  const pathSegments: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!(a && b)) {
      continue;
    }
    const midX = (a.x + b.x) / 2;
    pathSegments.push(
      `M ${a.x},${a.y} C ${midX},${a.y} ${midX},${b.y} ${b.x},${b.y}`
    );
  }
  const flowPath = pathSegments.join(" ");

  return (
    <div
      className="mt-12 overflow-x-auto rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8"
      ref={ref}
    >
      <div className="mb-4 flex items-center justify-between gap-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
        <span>Benchmark run · BenchmarkRunOrchestrator.start()</span>
        <span className="font-mono text-white/85">
          control-plane/src/benchmarks/orchestrator.ts
        </span>
      </div>
      <svg
        aria-label="Benchmark run lifecycle"
        className="block w-full"
        role="img"
        style={{ minWidth: totalWidth }}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      >
        <title>Benchmark run lifecycle</title>

        {FLOW_LANE_LABELS.map((label, idx) => {
          const y = padTop + laneStride * idx;
          return (
            <g key={label}>
              <rect
                fill="rgba(255, 255, 255, 0.04)"
                height={laneHeight}
                rx="10"
                width={totalWidth - padLeft - padRight}
                x={padLeft - 12}
                y={y}
              />
              <text
                fill="rgba(244, 248, 255, 0.7)"
                fontFamily="var(--font-mono)"
                fontSize="11"
                textAnchor="end"
                x={padLeft - 24}
                y={y + laneHeight / 2 + 4}
              >
                {label}
              </text>
            </g>
          );
        })}

        <path
          d={flowPath}
          fill="none"
          stroke="rgba(244, 248, 255, 0.85)"
          strokeDasharray="6 6"
          strokeLinecap="round"
          strokeWidth="1.6"
          style={{
            animation: inView ? "flow-dash 1.4s linear infinite" : undefined,
            opacity: inView ? 1 : 0,
            transition: "opacity 600ms ease-out 200ms",
          }}
        />

        {points.map(({ step, x, y }, idx) => (
          <g
            key={step.id}
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 500ms ease-out ${idx * 140}ms`,
            }}
          >
            <circle
              cx={x}
              cy={y}
              fill="rgb(8, 28, 82)"
              r={11}
              stroke="rgb(244, 248, 255)"
              strokeWidth="1.6"
            />
            <text
              fill="rgb(244, 248, 255)"
              fontFamily="var(--font-mono)"
              fontSize="10"
              textAnchor="middle"
              y={y + 3}
            >
              {String(idx + 1).padStart(2, "0")}
            </text>
            <text
              fill="rgba(244, 248, 255, 0.85)"
              fontFamily="var(--font-mono)"
              fontSize="11"
              textAnchor="middle"
              x={x}
              y={y - 18}
            >
              {step.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BENCHMARK_FLOW.map((step, idx) => (
          <div
            className="rounded-lg border border-white/10 bg-black/25 p-3 transition-colors duration-200 hover:border-white/25 hover:bg-black/35"
            key={step.id}
          >
            <div className="flex items-center gap-2 text-[10px] text-white/60 uppercase tracking-[0.16em]">
              <span className="font-mono text-white/80">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span>{step.label}</span>
            </div>
            <div className="mt-1.5 text-[12.5px] text-white/85 leading-relaxed">
              {step.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
