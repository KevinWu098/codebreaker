import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";
import { AUDIT_SHARDS, ROLES } from "@/viz/harness/data";

const SUBAGENT_LABELS = AUDIT_SHARDS.filter((s) => s.isDefault).map(
  (s) => s.id
);
const VISIBLE_SUBAGENTS = SUBAGENT_LABELS.slice(0, 6);
const REMAINING_SUBAGENT_COUNT =
  SUBAGENT_LABELS.length - VISIBLE_SUBAGENTS.length;

export function ArchitectureSection() {
  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="03" title="How it thinks" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Coordinator plans. Investigators hunt one shard each. Validators get
            veto power.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            This is the audit topology. The coordinator only emits four tool
            calls (<span className="font-mono text-white/90">plan_shards</span>,{" "}
            <span className="font-mono text-white/90">
              dispatch_investigator
            </span>
            ,{" "}
            <span className="font-mono text-white/90">dispatch_validator</span>,{" "}
            <span className="font-mono text-white/90">finalize_audit</span>
            ); investigators only emit{" "}
            <span className="font-mono text-white/90">
              submit_audit_finding
            </span>
            ; validators only emit{" "}
            <span className="font-mono text-white/90">submit_validation</span>.
            Findings only ship if the third stage believes them. (Benchmark mode
            runs a single SessionAgent and skips this fan-out.)
          </p>
        </Reveal>

        <Reveal delayMs={220}>
          <ArchitectureDiagram />
        </Reveal>

        <Reveal delayMs={140}>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {ROLES.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
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

function subagentOpacity(inView: boolean, muted: boolean): number {
  if (!inView) {
    return 0;
  }
  return muted ? 0.55 : 1;
}

function ArchitectureDiagram() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const width = 880;
  const subagentCount = VISIBLE_SUBAGENTS.length + 1; // +1 for the "+N more" lane
  const subagentSpacing = 52;
  const verticalPadding = 60;
  const height = subagentCount * subagentSpacing + verticalPadding * 2;
  const orchestrator = { x: 160, y: height / 2 };
  const verifier = { x: width - 160, y: height / 2 };
  const subagentX = width / 2;
  const subagentTop = height / 2 - ((subagentCount - 1) * subagentSpacing) / 2;

  const subagents = [
    ...VISIBLE_SUBAGENTS.map((label, i) => ({
      label,
      muted: false,
      x: subagentX,
      y: subagentTop + i * subagentSpacing,
    })),
    {
      label:
        REMAINING_SUBAGENT_COUNT > 0
          ? `+${REMAINING_SUBAGENT_COUNT} more shards`
          : "",
      muted: true,
      x: subagentX,
      y: subagentTop + VISIBLE_SUBAGENTS.length * subagentSpacing,
    },
  ];

  return (
    <div
      className="mt-16 overflow-x-auto rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-10"
      ref={ref}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/65 uppercase tracking-[0.16em]">
        <span>
          Audit topology · 1 coordinator · N investigators · N validators
        </span>
        <span className="font-mono text-white/85">
          control-plane/src/audits/
        </span>
      </div>
      <svg
        aria-label="Audit topology"
        className="block w-full"
        role="img"
        style={{ minWidth: 720 }}
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>Audit topology</title>
        <defs>
          <marker
            id="arrow-light"
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

        {subagents.map((s, idx) => {
          if (s.muted) {
            return null;
          }
          const length = Math.hypot(s.x - orchestrator.x, s.y - orchestrator.y);
          return (
            <line
              key={`orch-${s.label}`}
              markerEnd="url(#arrow-light)"
              stroke="rgba(244, 248, 255, 0.55)"
              strokeDasharray="6 6"
              strokeDashoffset={inView ? 0 : length}
              strokeWidth="1.5"
              style={{
                animation: inView
                  ? "flow-dash 1.4s linear infinite"
                  : undefined,
                transition: `stroke-dashoffset 900ms cubic-bezier(0.2, 0.7, 0.2, 1) ${idx * 90}ms`,
              }}
              x1={orchestrator.x + 90}
              x2={s.x - 70}
              y1={orchestrator.y}
              y2={s.y}
            />
          );
        })}

        {subagents.map((s, idx) => {
          if (s.muted) {
            return null;
          }
          const length = Math.hypot(verifier.x - s.x, verifier.y - s.y);
          return (
            <line
              key={`verify-${s.label}`}
              markerEnd="url(#arrow-light)"
              stroke="rgba(244, 248, 255, 0.55)"
              strokeDasharray="6 6"
              strokeDashoffset={inView ? 0 : length}
              strokeWidth="1.5"
              style={{
                animation: inView
                  ? "flow-dash 1.4s linear infinite"
                  : undefined,
                transition: `stroke-dashoffset 900ms cubic-bezier(0.2, 0.7, 0.2, 1) ${500 + idx * 90}ms`,
              }}
              x1={s.x + 70}
              x2={verifier.x - 90}
              y1={s.y}
              y2={verifier.y}
            />
          );
        })}

        <g
          style={{
            opacity: inView ? 1 : 0,
            transition: "opacity 600ms ease-out 0ms",
          }}
          transform={`translate(${orchestrator.x}, ${orchestrator.y})`}
        >
          <rect
            fill="rgba(8, 28, 82, 0.92)"
            height={92}
            rx={12}
            stroke="rgba(244, 248, 255, 0.6)"
            width={180}
            x={-90}
            y={-46}
          />
          <text
            fill="rgba(244, 248, 255, 0.65)"
            fontFamily="var(--font-mono)"
            fontSize="10"
            letterSpacing="2"
            textAnchor="middle"
            y={-22}
          >
            AUDIT_COORDINATOR
          </text>
          <text
            fill="rgb(244, 248, 255)"
            fontFamily="var(--font-sans)"
            fontSize="14"
            fontWeight="500"
            textAnchor="middle"
            y={0}
          >
            Coordinator
          </text>
          <text
            fill="rgba(244, 248, 255, 0.7)"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            textAnchor="middle"
            y={20}
          >
            plan · dispatch · finalize
          </text>
        </g>

        {subagents.map((s, idx) => (
          <g
            key={`box-${s.label}`}
            style={{
              opacity: subagentOpacity(inView, s.muted),
              transition: `opacity 500ms ease-out ${300 + idx * 70}ms`,
            }}
            transform={`translate(${s.x}, ${s.y})`}
          >
            <rect
              fill={
                s.muted
                  ? "rgba(255, 255, 255, 0.03)"
                  : "rgba(255, 255, 255, 0.06)"
              }
              height={36}
              rx={9}
              stroke={
                s.muted
                  ? "rgba(244, 248, 255, 0.2)"
                  : "rgba(244, 248, 255, 0.45)"
              }
              strokeDasharray={s.muted ? "4 4" : undefined}
              width={140}
              x={-70}
              y={-18}
            />
            <text
              fill={s.muted ? "rgba(244, 248, 255, 0.6)" : "rgb(244, 248, 255)"}
              fontFamily="var(--font-mono)"
              fontSize="11.5"
              textAnchor="middle"
              y={4}
            >
              {s.label}
            </text>
          </g>
        ))}

        <g
          style={{
            opacity: inView ? 1 : 0,
            transition: "opacity 600ms ease-out 800ms",
          }}
          transform={`translate(${verifier.x}, ${verifier.y})`}
        >
          <rect
            fill="rgba(8, 28, 82, 0.92)"
            height={92}
            rx={12}
            stroke="rgba(244, 248, 255, 0.85)"
            strokeWidth="1.4"
            width={180}
            x={-90}
            y={-46}
          />
          <text
            fill="rgba(244, 248, 255, 0.65)"
            fontFamily="var(--font-mono)"
            fontSize="10"
            letterSpacing="2"
            textAnchor="middle"
            y={-22}
          >
            AUDIT_VALIDATOR
          </text>
          <text
            fill="rgb(244, 248, 255)"
            fontFamily="var(--font-sans)"
            fontSize="14"
            fontWeight="500"
            textAnchor="middle"
            y={0}
          >
            Validator
          </text>
          <text
            fill="rgba(244, 248, 255, 0.7)"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            textAnchor="middle"
            y={20}
          >
            confirm or dismiss
          </text>
        </g>

        <text
          fill="rgba(244, 248, 255, 0.5)"
          fontFamily="var(--font-mono)"
          fontSize="10"
          letterSpacing="2"
          textAnchor="middle"
          x={subagentX}
          y={28}
        >
          AUDIT_INVESTIGATOR · 1 PER SHARD
        </text>
      </svg>
    </div>
  );
}

function RoleCard({ role }: { role: (typeof ROLES)[number] }) {
  return (
    <div className="group flex h-full min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.06]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
          {role.id}
        </div>
        <div className="font-mono text-[11px] text-white/65 tabular-nums">
          {role.binding}
        </div>
      </div>
      <h3 className="mt-3 break-all font-medium font-mono text-[13px] text-white">
        {role.label}
      </h3>
      <p className="mt-3 text-sm text-white/85 leading-relaxed">
        {role.responsibility}
      </p>
      <div className="mt-6 border-white/15 border-t pt-4">
        <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
          Tools it can call
        </div>
        <ul className="mt-2 space-y-1.5">
          {role.emits.map((o) => (
            <li
              className="flex items-start gap-2 font-mono text-[12px] text-white/85"
              key={o}
            >
              <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-white/55" />
              <span className="break-all">{o}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
