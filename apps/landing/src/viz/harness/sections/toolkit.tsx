import { Reveal } from "@/viz/components/reveal";
import { TOOLKIT, type Toolkit } from "@/viz/harness/data";

const KIND_META: Record<
  Toolkit["kind"],
  {
    title: string;
    eyebrow: string;
    blurb: string;
    accent: string;
    source: string;
  }
> = {
  capability: {
    title: "Tool capabilities",
    eyebrow: "11 capabilities",
    blurb:
      "Defined once in the benchmark runner. Filtered per-run by ExtensionPolicy and a 6-tier risk ladder before they reach the agent.",
    accent: "rgb(244, 248, 255)",
    source: "benchmark-runner/src/agent-core/tools.ts",
  },
  skill: {
    title: "Benchmark skills",
    eyebrow: "BENCHMARK_SKILLS_CONTEXT",
    blurb:
      "Inline guidance shipped only in full-harness runs. Baseline frontier-model evaluations get the task and output contract; skills are how the harness adds value.",
    accent: "rgb(195, 215, 255)",
    source: "benchmark-runner/src/agent-core/prompts.ts",
  },
  prompt: {
    title: "System prompts",
    eyebrow: "role contracts",
    blurb:
      "One system prompt per agent role. Each one builds the role-specific output contract and forbids writing JSON outside the dedicated submission tool.",
    accent: "rgb(146, 180, 255)",
    source:
      "control-plane/src/audits/prompts.ts · benchmark-runner/src/agent-core/prompts.ts",
  },
};

const KIND_ORDER: Toolkit["kind"][] = ["capability", "skill", "prompt"];

export function ToolkitSection() {
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: TOOLKIT.filter((t) => t.kind === kind),
  }));

  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="02" title="What it carries" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Capabilities are filtered. Skills are taught. Prompts are versioned.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            Tools are exposed as 11 abstract{" "}
            <em className="font-mono text-white/90 not-italic">
              ToolCapability
            </em>{" "}
            objects with a 6-tier risk ladder (
            <span className="font-mono text-white/85">Read</span> →{" "}
            <span className="font-mono text-white/85">WriteLocal</span> →{" "}
            <span className="font-mono text-white/85">ExecLocal</span> →{" "}
            <span className="font-mono text-white/85">Network</span> →{" "}
            <span className="font-mono text-white/85">ExecRemote</span> →{" "}
            <span className="font-mono text-white/85">Exploit</span>). Each
            run&rsquo;s{" "}
            <span className="font-mono text-white/85">ExtensionPolicy</span>{" "}
            picks a max tier; everything above it is removed before the agent
            sees a tool list.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {grouped.map(({ kind, items }, colIdx) => (
            <Reveal delayMs={180 + colIdx * 80} key={kind}>
              <ToolkitColumn items={items} kind={kind} />
            </Reveal>
          ))}
        </div>
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

function ToolkitColumn({
  kind,
  items,
}: {
  kind: Toolkit["kind"];
  items: Toolkit[];
}) {
  const meta = KIND_META[kind];
  return (
    <div className="group flex h-full min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.06]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
          {meta.eyebrow}
        </div>
        <div className="font-mono text-[11px] text-white/65 tabular-nums">
          {String(items.length).padStart(2, "0")}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ backgroundColor: meta.accent }}
        />
        <h3 className="font-medium text-base text-white">{meta.title}</h3>
      </div>
      <p className="mt-3 text-sm text-white/85 leading-relaxed">{meta.blurb}</p>
      <div className="mt-3 break-all font-mono text-[10.5px] text-white/55">
        {meta.source}
      </div>

      <ul className="mt-6 space-y-2 border-white/15 border-t pt-4">
        {items.map((item, idx) => (
          <ToolkitItem
            accent={meta.accent}
            idx={idx}
            item={item}
            key={item.id}
          />
        ))}
      </ul>
    </div>
  );
}

function ToolkitItem({
  item,
  idx,
  accent,
}: {
  item: Toolkit;
  idx: number;
  accent: string;
}) {
  return (
    <li
      className="group/item rounded-md border border-transparent px-2 py-1.5 transition-colors duration-200 hover:border-white/15 hover:bg-white/[0.04]"
      style={{
        animation: "step-fade-in 380ms ease-out both",
        animationDelay: `${idx * 40}ms`,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="inline-block h-1 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="break-all font-mono text-[12.5px] text-white">
          {item.label}
        </span>
      </div>
      <p className="mt-1 pl-3 text-[12px] text-white/75 leading-relaxed">
        {item.blurb}
      </p>
    </li>
  );
}
