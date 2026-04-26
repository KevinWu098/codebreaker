import { useEffect, useState } from "react";
import { TRANSFORM_EXAMPLE } from "@/viz/benchmark/data";
import { Reveal } from "@/viz/components/reveal";
import { useInView } from "@/viz/components/use-in-view";

interface DiffLine {
  cls: string;
  key: string;
  line: string;
}

function buildDiffLines(raw: string): DiffLine[] {
  const counts = new Map<string, number>();
  return raw.split("\n").map((line) => {
    let cls = "text-white/70";
    if (line.startsWith("+")) {
      cls = "text-emerald-300";
    } else if (line.startsWith("-")) {
      cls = "text-rose-300";
    } else if (line.startsWith("@@") || line.startsWith("diff")) {
      cls = "text-sky-300";
    }
    const seen = counts.get(line) ?? 0;
    counts.set(line, seen + 1);
    return { key: `${line}#${seen}`, line, cls };
  });
}

const DIFF_LINES = buildDiffLines(TRANSFORM_EXAMPLE.rawDiff);

interface Step {
  caption: string;
  id: string;
  label: string;
}

const STEPS: Step[] = [
  {
    id: "advisory",
    label: "Read the GHSA",
    caption: "Pull the reviewed advisory: description, CWE IDs, references.",
  },
  {
    id: "patch",
    label: "Resolve patch + pre-patch SHA",
    caption:
      "From references, find the patch commit. Pre-patch is its first parent.",
  },
  {
    id: "diff",
    label: "Read the diff",
    caption:
      "Distinguish the root cause hunk from refactors and unrelated noise.",
  },
  {
    id: "classify",
    label: "Map CWE \u2192 vuln class",
    caption: "Override if the diff disagrees with the advisory&rsquo;s CWE.",
  },
  {
    id: "localize",
    label: "Localize to file + function",
    caption: "Include sibling files that share the exact unsafe pattern.",
  },
  {
    id: "hints",
    label: "Generate L1 \u00b7 L2 \u00b7 L3 hints",
    caption:
      "Scrub paths, function names, and snippets while preserving meaning.",
  },
  {
    id: "task",
    label: "Emit task JSON",
    caption: "Schema-validated. PR opened. Reviewer in the loop.",
  },
];

const AUTO_ADVANCE_MS = 4200;

export function TransformSection() {
  const [step, setStep] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [hovered, setHovered] = useState(false);
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.25);

  const stop = () => setAutoplay(false);
  const select = (i: number) => {
    setStep(i);
    stop();
  };

  const playing = autoplay && inView && !hovered;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) {
          setAutoplay(false);
          return s;
        }
        return s + 1;
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

  return (
    <section className="relative border-white/15 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="04" title="From CVE to benchmark task" />
        </Reveal>
        <Reveal delayMs={120}>
          <h2 className="mt-8 max-w-5xl text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
            Watch a real GHSA become an agent-ready task.
          </h2>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="mt-6 max-w-4xl text-base text-white/80 md:text-lg">
            Example:{" "}
            <span className="font-mono text-white/85">
              {TRANSFORM_EXAMPLE.ghsaId}
            </span>{" "}
            &mdash; an authorization bypass in{" "}
            <span className="font-mono text-white/85">openclaw/openclaw</span>.
            Severity 10.0. Two locations. One advisory becomes one task with
            four difficulty projections.
          </p>
        </Reveal>

        <Reveal delayMs={220}>
          <div
            className="mt-12 grid gap-6 lg:grid-cols-[280px_1fr]"
            ref={viewRef}
          >
            <StepRail
              autoplayMs={AUTO_ADVANCE_MS}
              current={step}
              onSelect={select}
              playing={playing}
              steps={STEPS}
            />
            <StepPanel step={STEPS[step]?.id ?? "advisory"} />
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/45 hover:bg-white/[0.04] hover:text-white disabled:opacity-30"
              disabled={step === 0}
              onClick={() => {
                stop();
                setStep((s) => Math.max(0, s - 1));
              }}
              type="button"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-3 font-mono text-white/75 text-xs">
              <span>
                Step {String(step + 1).padStart(2, "0")} / {STEPS.length}
              </span>
              {autoplay && inView ? (
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      playing ? "bg-emerald-300" : "bg-white/40"
                    } ${playing ? "animate-pulse" : ""}`}
                  />
                  {playing ? "auto" : "paused"}
                </span>
              ) : null}
            </div>
            <button
              className="rounded-full bg-white px-4 py-2 font-medium text-[rgb(var(--bg-deep))] text-sm transition hover:bg-white/90 disabled:opacity-30"
              disabled={step === STEPS.length - 1}
              onClick={() => {
                stop();
                setStep((s) => Math.min(STEPS.length - 1, s + 1));
              }}
              type="button"
            >
              Next →
            </button>
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

function StepRail({
  steps,
  current,
  onSelect,
  playing,
  autoplayMs,
}: {
  steps: Step[];
  current: number;
  onSelect: (i: number) => void;
  playing: boolean;
  autoplayMs: number;
}) {
  return (
    <ol className="space-y-1">
      {steps.map((s, idx) => {
        const active = idx === current;
        const done = idx < current;
        let pillClass = "bg-white/10 text-white/75";
        if (active) {
          pillClass = "bg-white text-[rgb(var(--bg-deep))]";
        } else if (done) {
          pillClass = "bg-white/35 text-white";
        }
        return (
          <li key={s.id}>
            <button
              className={`group relative flex w-full min-w-0 cursor-pointer items-start gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition-all duration-200 ${
                active
                  ? "border-white/45 bg-white/[0.08]"
                  : "border-white/10 bg-transparent hover:translate-x-[2px] hover:border-white/25 hover:bg-white/[0.04]"
              }`}
              onClick={() => onSelect(idx)}
              type="button"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] transition ${pillClass}`}
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block break-words text-sm ${active ? "text-white" : "text-white/85"}`}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 block break-words text-[11px] text-white/65 leading-snug">
                  {s.caption}
                </span>
              </span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 h-px bg-white/70"
                  key={`${s.id}-${playing ? "play" : "pause"}`}
                  style={{
                    animation: playing
                      ? `step-progress ${autoplayMs}ms linear forwards`
                      : "none",
                    width: playing ? undefined : "100%",
                  }}
                />
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepPanel({ step }: { step: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/30">
      <div className="flex items-center gap-2 border-white/15 border-b bg-black/40 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-3 font-mono text-[11px] text-white/65">
          curation_agent.transform()
        </span>
      </div>
      <div
        className="min-w-0 p-6 md:p-8"
        key={step}
        style={{ animation: "step-fade-in 380ms ease-out both" }}
      >
        {step === "advisory" && <AdvisoryView />}
        {step === "patch" && <PatchView />}
        {step === "diff" && <DiffView />}
        {step === "classify" && <ClassifyView />}
        {step === "localize" && <LocalizeView />}
        {step === "hints" && <HintsView />}
        {step === "task" && <TaskView />}
      </div>
    </div>
  );
}

function AdvisoryView() {
  return (
    <div className="space-y-4">
      <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
        Input · Reviewed advisory
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-black/40 p-4 font-mono text-[12.5px] text-white/80 leading-relaxed">
        {TRANSFORM_EXAMPLE.rawAdvisory}
      </pre>
      <p className="text-sm text-white/70">
        We treat this text as untrusted. It often names files, functions, even
        line numbers &mdash; we&rsquo;ll keep the meaning, but scrub the
        location-revealing details before the agent ever sees it.
      </p>
    </div>
  );
}

function PatchView() {
  return (
    <div className="space-y-5">
      <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
        Resolve commits
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CommitCard
          label="Patch commit"
          sha={TRANSFORM_EXAMPLE.patchCommit}
          tag="contains the fix"
        />
        <CommitCard
          accent
          label="Pre-patch commit"
          sha={TRANSFORM_EXAMPLE.prePatchCommit}
          tag="served to the agent"
        />
      </div>
      <p className="text-sm text-white/70">
        The pre-patch SHA is the first parent of the patch. That&rsquo;s the
        repo state we hand to the agent &mdash; a real codebase, frozen at the
        moment the bug was live in production.
      </p>
    </div>
  );
}

function CommitCard({
  label,
  sha,
  tag,
  accent = false,
}: {
  label: string;
  sha: string;
  tag: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${accent ? "border-white/40 bg-white/[0.05]" : "border-white/15 bg-black/40"}`}
    >
      <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">
        {label}
      </div>
      <div className="mt-2 break-all font-mono text-sm text-white/90">
        {sha.slice(0, 12)}
        <span className="text-white/60">{sha.slice(12)}</span>
      </div>
      <div className="mt-2 text-white/70 text-xs">{tag}</div>
    </div>
  );
}

function DiffView() {
  return (
    <div className="space-y-4">
      <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
        Read the patch diff
      </div>
      <pre className="overflow-x-auto rounded-md bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed">
        {DIFF_LINES.map((entry) => (
          <div className={entry.cls} key={entry.key}>
            {entry.line || " "}
          </div>
        ))}
      </pre>
      <p className="text-sm text-white/70">
        The fix removes a conditional bypass that exempted shared-secret
        connections from scope stripping, and reorders the clearing step to run
        before the trusted-proxy decision. Two surgical changes, one root cause.
      </p>
    </div>
  );
}

function ClassifyView() {
  return (
    <div className="space-y-5">
      <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
        Map CWE to vuln class
      </div>
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-white/15 bg-black/40 p-4">
          <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">
            CWEs in advisory
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TRANSFORM_EXAMPLE.cwes.map((cwe) => (
              <span
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-white/80 text-xs"
                key={cwe}
              >
                {cwe}
              </span>
            ))}
          </div>
        </div>
        <div className="text-center font-mono text-2xl text-white/60">→</div>
        <div className="rounded-lg border border-white/40 bg-white/[0.06] p-4">
          <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">
            ECVEBench class
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 font-mono text-[rgb(var(--bg-deep))] text-xs">
            {TRANSFORM_EXAMPLE.vulnClass}
          </div>
          <div className="mt-3 text-white/80 text-xs leading-relaxed">
            One of 13 canonical classes. Confirmed against the diff &mdash; this
            is structural authorization handling, not crypto, not injection.
          </div>
        </div>
      </div>
    </div>
  );
}

function LocalizeView() {
  return (
    <div className="space-y-5">
      <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
        Locations (ground truth)
      </div>
      <div className="space-y-2">
        {TRANSFORM_EXAMPLE.locations.map((loc) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 bg-black/30 px-4 py-3"
            key={`${loc.file}:${loc.function}`}
          >
            <div className="min-w-0 break-all font-mono text-sm">
              <span className="text-white/70">
                {`${loc.file.split("/").slice(0, -1).join("/")}/`}
              </span>
              <span className="text-white">{loc.file.split("/").pop()}</span>
            </div>
            <div className="font-mono text-white/85 text-xs">
              <span className="text-white/65">fn </span>
              {loc.function}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-white/70">
        We also scan sibling files in the same directory for the same unsafe
        pattern. If they&rsquo;re vulnerable too, they go in the ground truth
        and the scorer awards <span className="text-white">half-credit</span>{" "}
        when the agent finds one of them &mdash; rewarding correct pattern
        detection without losing precision.
      </p>
    </div>
  );
}

function HintsView() {
  const lvl: { key: "L1" | "L2" | "L3"; tag: string; copy: string }[] = [
    { key: "L1", tag: "Vague area", copy: TRANSFORM_EXAMPLE.hints.L1.area },
    {
      key: "L2",
      tag: "Scrubbed CVE",
      copy: TRANSFORM_EXAMPLE.hints.L2.description,
    },
    {
      key: "L3",
      tag: "Targeted",
      copy: `${TRANSFORM_EXAMPLE.hints.L3.area} \u2014 ${TRANSFORM_EXAMPLE.hints.L3.description}`,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
        Difficulty-specific hints
      </div>
      <div className="space-y-3">
        <HintRow caption="No hint. Pure discovery." level="L0" text={null} />
        {lvl.map((h) => (
          <HintRow caption={h.tag} key={h.key} level={h.key} text={h.copy} />
        ))}
      </div>
      <p className="text-sm text-white/70">
        L1, L2, L3 are scrubbed of every file path, function name, line number,
        variable name, and code snippet. They tell the agent <em>what</em> the
        bug is, never <em>where</em>.
      </p>
    </div>
  );
}

function HintRow({
  level,
  caption,
  text,
}: {
  level: string;
  caption: string;
  text: string | null;
}) {
  return (
    <div className="flex min-w-0 gap-4 rounded-lg border border-white/15 bg-black/30 p-4">
      <div className="w-12 shrink-0 font-mono font-semibold text-white text-xs">
        {level}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-white/65 uppercase tracking-[0.16em]">
          {caption}
        </div>
        <div className="mt-2 break-words text-sm text-white/85 leading-relaxed">
          {text ?? <span className="text-white/65 italic">null</span>}
        </div>
      </div>
    </div>
  );
}

function TaskView() {
  const taskJson = {
    task_id: TRANSFORM_EXAMPLE.taskId,
    ghsa_id: TRANSFORM_EXAMPLE.ghsaId,
    codebase: {
      repo: TRANSFORM_EXAMPLE.repo,
      language: TRANSFORM_EXAMPLE.language,
      ecosystem: TRANSFORM_EXAMPLE.ecosystem,
      commit: TRANSFORM_EXAMPLE.prePatchCommit,
    },
    hints: {
      L0: null,
      L1: TRANSFORM_EXAMPLE.hints.L1,
      L2: TRANSFORM_EXAMPLE.hints.L2,
      L3: TRANSFORM_EXAMPLE.hints.L3,
    },
    ground_truth: {
      vulnerable: true,
      vuln_class: TRANSFORM_EXAMPLE.vulnClass,
      cvss: TRANSFORM_EXAMPLE.cvss,
      reason: TRANSFORM_EXAMPLE.reason,
      locations: TRANSFORM_EXAMPLE.locations,
    },
  };
  const json = JSON.stringify(taskJson, null, 2);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-white/60 text-xs uppercase tracking-[0.18em]">
          Output · task.json
        </div>
        <div className="font-mono text-white/60 text-xs">
          benchmark/data/tasks/{TRANSFORM_EXAMPLE.taskId}.json
        </div>
      </div>
      <pre className="max-h-[28rem] overflow-auto rounded-md bg-black/40 p-4 font-mono text-[12px] text-white/80 leading-relaxed">
        {json}
      </pre>
      <p className="text-sm text-white/70">
        Schema-validated against{" "}
        <span className="font-mono text-white/70">task.schema.json</span>.
        Committed to the repo. The harness projects this record into an agent
        input at evaluation time &mdash; the agent never sees ground truth.
      </p>
    </div>
  );
}
