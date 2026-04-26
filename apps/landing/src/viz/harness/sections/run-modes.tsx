import { useEffect, useState } from "react";
import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";
import { RUN_MODES, type RunMode } from "@/viz/harness/data";

const METER_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const AUTO_ADVANCE_MS = 4200;

export function RunModesSection() {
  const [active, setActive] = useState<RunMode["id"]>("benchmark");
  const [autoplay, setAutoplay] = useState(true);
  const [hovered, setHovered] = useState(false);
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.25);

  const current = RUN_MODES.find((m) => m.id === active) ?? RUN_MODES[0];
  const playing = autoplay && inView && !hovered;

  const select = (id: RunMode["id"]) => {
    setActive(id);
    setAutoplay(false);
  };

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      setActive((prev) => {
        const idx = RUN_MODES.findIndex((m) => m.id === prev);
        const next = RUN_MODES[(idx + 1) % RUN_MODES.length];
        return next?.id ?? prev;
      });
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const node = viewRef.current;
    if (!node) {
      return;
    }
    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, [viewRef]);

  if (!current) {
    return null;
  }

  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="04" title="What it runs against" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Three orchestrators. Three scopes. One Modal sandbox per session.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            The control plane ships three orchestrators today:{" "}
            <span className="font-mono text-white/90">
              BenchmarkRunOrchestrator
            </span>{" "}
            for one ECVEBench task,{" "}
            <span className="font-mono text-white/90">AuditOrchestrator</span>{" "}
            for whole-repo reviews with subagent fan-out, and{" "}
            <span className="font-mono text-white/90">
              CveFollowupOrchestrator
            </span>{" "}
            for taking a confirmed finding back upstream via Devin. They share
            run state in D1 and the Modal sandbox profile system, but each owns
            its own budget shape.
          </p>
        </Reveal>

        <div ref={viewRef}>
          <Reveal delayMs={220}>
            <div
              aria-label="Run mode selector"
              className="mt-14 inline-flex flex-wrap gap-1 rounded-full border border-white/15 bg-white/[0.04] p-1"
              role="tablist"
            >
              {RUN_MODES.map((m) => {
                const isActive = m.id === active;
                return (
                  <button
                    aria-selected={isActive}
                    className={`relative overflow-hidden rounded-full px-4 py-1.5 font-medium text-sm transition-all duration-200 ${
                      isActive
                        ? "bg-white text-[rgb(var(--bg-deep))]"
                        : "text-white/75 hover:bg-white/[0.06] hover:text-white"
                    }`}
                    key={m.id}
                    onClick={() => select(m.id)}
                    role="tab"
                    type="button"
                  >
                    <span className="relative z-10">{m.label}</span>
                    {isActive && playing ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-0.5 left-1 z-0 h-[2px] rounded-full bg-[rgb(var(--bg-deep))]/35"
                        key={`${m.id}-progress`}
                        style={{
                          animation: `step-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
                          maxWidth: "calc(100% - 0.5rem)",
                        }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Reveal>

          <div
            className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]"
            key={current.id}
            style={{ animation: "step-fade-in 380ms ease-out both" }}
          >
            <ModeDetail mode={current} />
            <ModeStats mode={current} />
          </div>

          <Reveal delayMs={140}>
            <div className="mt-16 grid gap-6 md:grid-cols-3">
              {RUN_MODES.map((m) => (
                <button
                  aria-pressed={m.id === active}
                  className={`group flex h-full min-w-0 flex-col rounded-2xl border bg-white/[0.04] p-6 text-left transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06] ${
                    m.id === active
                      ? "border-white/40 ring-1 ring-white/20 ring-inset"
                      : "border-white/15 hover:border-white/30"
                  }`}
                  key={m.id}
                  onClick={() => select(m.id)}
                  type="button"
                >
                  <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
                    {m.id}
                  </div>
                  <div className="mt-3 font-medium text-base text-white">
                    {m.label}
                  </div>
                  <p className="mt-3 text-sm text-white/85 leading-relaxed">
                    {m.scope}
                  </p>
                </button>
              ))}
            </div>
          </Reveal>
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

function ModeDetail({ mode }: { mode: RunMode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8">
      <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
        {mode.label}
      </div>
      <h3 className="mt-2 text-balance font-semibold text-2xl text-white leading-tight md:text-3xl">
        {mode.scope}
      </h3>

      <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
        <Field label="Orchestrator" mono value={mode.orchestrator} />
        <Field label="Agents" mono value={mode.agents} />
      </div>
      <div className="mt-3 grid gap-3 text-sm">
        <Field label="Budget" mono value={mode.budget} />
      </div>

      <div className="mt-6 border-white/15 border-t pt-5">
        <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
          Triggers
        </div>
        <ul className="mt-3 space-y-1.5">
          {mode.triggers.map((t) => (
            <li
              className="flex items-start gap-2 text-[13px] text-white/85 leading-relaxed"
              key={t}
            >
              <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-white/55" />
              <span className="min-w-0 break-words">{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="text-[10px] text-white/65 uppercase tracking-[0.16em]">
        {label}
      </div>
      <div
        className={`mt-1.5 break-words text-white/90 ${mono ? "font-mono text-[12.5px]" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ModeStats({ mode }: { mode: RunMode }) {
  const fan = fanOutFor(mode);
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/[0.04] p-6 md:p-8">
      <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
        Subagent fan-out
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono font-semibold text-4xl text-white tabular-nums leading-tight md:text-5xl">
          {fan.label}
        </span>
        <span className="text-sm text-white/75">{fan.unit}</span>
      </div>
      <div className="mt-1 text-sm text-white/85">{fan.caption}</div>

      <div className="mt-6 grid gap-3 border-white/15 border-t pt-5">
        <ConcurrencyMeter active={fan.active} mode={mode} />
      </div>
    </div>
  );
}

interface FanOut {
  active: number;
  caption: string;
  label: string;
  unit: string;
}

function fanOutFor(mode: RunMode): FanOut {
  if (mode.id === "benchmark") {
    return {
      active: 1,
      caption: "Single SessionAgent. No subagents in benchmark mode.",
      label: "1",
      unit: "× SessionAgent",
    };
  }
  if (mode.id === "audit") {
    return {
      active: 10,
      caption: "Default 10 shards from DEFAULT_AUDIT_SHARDS.",
      label: "10",
      unit: "investigators (default)",
    };
  }
  return {
    active: 2,
    caption: "Repro stage, then fix stage; sequential.",
    label: "2",
    unit: "Devin stages",
  };
}

function ConcurrencyMeter({ mode, active }: { mode: RunMode; active: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-white/65 uppercase tracking-[0.16em]">
        <span>Concurrent agents</span>
        <span className="font-mono text-white/85 tabular-nums">
          {active} / {METER_SLOTS.length}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {METER_SLOTS.map((slot) => (
          <div
            className="h-2 flex-1 rounded-full"
            key={`${mode.id}-${slot}`}
            style={{
              backgroundColor:
                slot < active
                  ? "rgb(244, 248, 255)"
                  : "rgba(255, 255, 255, 0.12)",
              transform: slot < active ? "scaleY(1)" : "scaleY(0.65)",
              transformOrigin: "center",
              transition: `background-color 400ms ease-out ${slot * 60}ms, transform 400ms ease-out ${slot * 60}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
