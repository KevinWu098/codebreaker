import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LOOP_MS = 16_000;

const PIPELINE_LABELS = [
  "Sources",
  "Filters",
  "Transform",
  "Localize",
  "Dataset",
] as const;

const FUNNEL_COUNTS = [30_000, 12_000, 6100, 494, 138] as const;

const VULN_CLASSES = [
  { id: "auth-bypass", label: "Auth bypass", count: 12 },
  { id: "path-traversal", label: "Path traversal", count: 12 },
  { id: "sql-injection", label: "SQL injection", count: 12 },
  { id: "xss", label: "XSS", count: 11 },
  { id: "use-after-free", label: "Use-after-free", count: 11 },
  { id: "race-condition", label: "Race condition", count: 11 },
  { id: "integer-overflow", label: "Integer overflow", count: 11 },
  { id: "crypto-weakness", label: "Crypto weak", count: 11 },
  { id: "deserialization", label: "Deserialization", count: 10 },
  { id: "xxe", label: "XXE", count: 10 },
  { id: "null-deref", label: "Null deref", count: 10 },
  { id: "buffer-overflow", label: "Buf. overflow", count: 9 },
  { id: "command-injection", label: "Cmd injection", count: 8 },
] as const;

const SOURCE_GHSAS = [
  "GHSA-rqpp-rjj8-7wv8",
  "GHSA-h2x3-vwm5-fc4q",
  "GHSA-7vfm-x36j-pcvg",
  "GHSA-c4f4-32qq-h2gr",
  "GHSA-29gw-9893-fxx2",
  "GHSA-mh7w-pjcp-mc9g",
  "GHSA-2gxq-mwj7-cmfv",
  "GHSA-8w2m-mp2q-q3v3",
  "GHSA-4q6h-pqr5-h6f8",
  "GHSA-vp7w-jx52-vghf",
];

const TRANSFORM_FRAMES = [
  "advisory",
  "diff",
  "classify",
  "localize",
  "emit",
] as const;
type TransformFrame = (typeof TRANSFORM_FRAMES)[number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  if (t < 0.5) {
    return 2 * t * t;
  }
  return 1 - (-2 * t + 2) ** 2 / 2;
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    if (k >= 10) {
      return `${Math.round(k).toLocaleString()}k`;
    }
    return `${k.toFixed(1)}k`;
  }
  return Math.round(n).toLocaleString();
}

export function CurationEngine() {
  const t = useMasterClock(LOOP_MS);
  const [hoveredStation, setHoveredStation] = useState<number | null>(null);
  const effectiveT = useMemo(
    () =>
      hoveredStation === null
        ? t
        : (hoveredStation + 0.5) / PIPELINE_LABELS.length,
    [t, hoveredStation]
  );
  const onStationPointerEnter = useCallback((index: number) => {
    setHoveredStation(index);
  }, []);
  const onPanelPointerLeave = useCallback(() => {
    setHoveredStation(null);
  }, []);
  return (
    <div className="relative isolate w-full overflow-hidden rounded-2xl border border-white/15 bg-[rgb(var(--bg-deep))]">
      <DotGridBackground />
      <HeaderStrip lockedStageIndex={hoveredStation} t={t} />
      <PipelinePanel
        effectiveT={effectiveT}
        onPanelPointerLeave={onPanelPointerLeave}
        onStationPointerEnter={onStationPointerEnter}
      />
      <LocalizePanel t={t} />
      <CaptionStrip lockedStageIndex={hoveredStation} t={t} />
    </div>
  );
}

function useMasterClock(periodMs: number): number {
  const [t, setT] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (startRef.current === null) {
        startRef.current = now;
      }
      const elapsed = (now - startRef.current) % periodMs;
      setT(elapsed / periodMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [periodMs]);
  return t;
}

function DotGridBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}

function HeaderStrip({
  t,
  lockedStageIndex,
}: {
  t: number;
  lockedStageIndex: number | null;
}) {
  const phase = pipelinePhase(t);
  const stageIdx = lockedStageIndex ?? Math.min(4, Math.floor(phase));
  return (
    <div className="relative flex items-center justify-between gap-4 border-white/10 border-b bg-black/20 px-6 py-3.5 md:px-8">
      <div className="flex items-center gap-3 text-sm text-white/75 uppercase tracking-[0.16em]">
        <span className="inline-flex h-1.5 w-1.5 animate-[cb-blink_1.6s_ease-in-out_infinite] rounded-full bg-emerald-300" />
        <span className="font-mono text-white/65">curation_engine</span>
        <span className="hidden text-white/40 md:inline">·</span>
        <span className="hidden md:inline">live loop</span>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        {PIPELINE_LABELS.map((label, i) => {
          const active = i === stageIdx;
          const done = i < stageIdx;
          let cls = "border-white/10 bg-white/[0.02] text-white/55";
          if (active) {
            cls = "border-white/45 bg-white/[0.10] text-white";
          } else if (done) {
            cls = "border-white/20 bg-white/[0.04] text-white/80";
          }
          return (
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors duration-300 ${cls}`}
              key={label}
            >
              <span className="font-mono text-[10px] text-white/55">
                {String(i + 1).padStart(2, "0")}
              </span>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function pipelinePhase(t: number): number {
  return t * PIPELINE_LABELS.length;
}

function PipelinePanel({
  effectiveT,
  onStationPointerEnter,
  onPanelPointerLeave,
}: {
  effectiveT: number;
  onStationPointerEnter: (index: number) => void;
  onPanelPointerLeave: () => void;
}) {
  return (
    <div
      className="relative grid grid-cols-1 gap-4 px-4 py-5 md:grid-cols-[1.1fr_1.2fr_1.6fr_1.4fr_1.2fr] md:gap-3 md:px-8 md:py-6"
      onPointerLeave={onPanelPointerLeave}
    >
      <SourceStation
        onCardPointerEnter={() => onStationPointerEnter(0)}
        t={effectiveT}
      />
      <FilterStation
        onCardPointerEnter={() => onStationPointerEnter(1)}
        t={effectiveT}
      />
      <TransformStation
        onCardPointerEnter={() => onStationPointerEnter(2)}
        t={effectiveT}
      />
      <LocateStation
        onCardPointerEnter={() => onStationPointerEnter(3)}
        t={effectiveT}
      />
      <DatasetStation
        onCardPointerEnter={() => onStationPointerEnter(4)}
        t={effectiveT}
      />
    </div>
  );
}

function StationShell({
  index,
  title,
  active,
  count,
  children,
  onCardPointerEnter,
}: {
  index: number;
  title: string;
  active: boolean;
  count: string;
  children: React.ReactNode;
  onCardPointerEnter?: () => void;
}) {
  return (
    <div
      className={`relative flex h-80 min-w-0 flex-col overflow-hidden rounded-xl border bg-white/[0.03] p-4 transition-colors duration-500 ${
        active
          ? "border-white/35 bg-white/[0.06]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
      onPointerEnter={onCardPointerEnter}
    >
      <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.14em]">
        <span className="flex items-center gap-2 text-white/55">
          <span className="font-mono">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="inline-block h-px w-5 bg-white/25" />
          <span className="text-white/85">{title}</span>
        </span>
        <span
          className={`font-mono text-sm tabular-nums transition-colors duration-300 ${
            active ? "text-white" : "text-white/65"
          }`}
        >
          {count}
        </span>
      </div>
      <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

// ------- Stations -------

const SOURCE_FEED = Array.from({ length: 28 }, (_, i) => {
  const idx = (i * 7) % SOURCE_GHSAS.length;
  return SOURCE_GHSAS[idx] ?? "GHSA-xxxx-xxxx-xxxx";
});

function SourceStation({
  t,
  onCardPointerEnter,
}: {
  t: number;
  onCardPointerEnter: () => void;
}) {
  const phase = pipelinePhase(t);
  const active = phase < 1;
  const count = formatCount(FUNNEL_COUNTS[0]);
  const duped = [...SOURCE_FEED, ...SOURCE_FEED];
  return (
    <StationShell
      active={active}
      count={count}
      index={0}
      onCardPointerEnter={onCardPointerEnter}
      title="GHSA stream"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/40">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-black/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-black/80 to-transparent" />
        <div
          className="flex flex-col gap-1 py-1 will-change-transform"
          style={{ animation: "cb-vertical-marquee 18s linear infinite" }}
        >
          {duped.map((id, i) => {
            const half = duped.length / 2;
            const lap = i < half ? "a" : "b";
            const seedSeverity = (i * 73) % 100;
            let dotCls = "bg-emerald-300/70";
            if (seedSeverity > 50) {
              dotCls = "bg-amber-300/80";
            }
            if (seedSeverity > 80) {
              dotCls = "bg-rose-300/85";
            }
            return (
              <div
                className="flex items-center gap-2 px-2 font-mono text-white/65 text-xs"
                key={`${lap}-${i.toString()}-${id}`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`}
                />
                <span className="truncate">{id}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-white/55 text-xs">
        <span>github advisory db</span>
        <span className="font-mono">reviewed · linked patch</span>
      </div>
    </StationShell>
  );
}

function FilterStation({
  t,
  onCardPointerEnter,
}: {
  t: number;
  onCardPointerEnter: () => void;
}) {
  const phase = pipelinePhase(t);
  const active = phase >= 1 && phase < 2;
  const local = Math.max(0, Math.min(1, phase - 0.6));
  const count = formatCount(
    Math.round(lerp(FUNNEL_COUNTS[0], FUNNEL_COUNTS[2], easeInOut(local)))
  );
  const filters = [
    { label: "metadata", target: 0.4 },
    { label: "cwe + cvss \u2265 4", target: 0.51 },
    { label: "stratified sample", target: 0.06 },
  ];
  return (
    <StationShell
      active={active}
      count={count}
      index={1}
      onCardPointerEnter={onCardPointerEnter}
      title="Funnel"
    >
      <div className="flex h-full flex-col justify-between gap-3">
        {filters.map((f, i) => {
          const start = 0.65 + i * 0.1;
          const end = start + 0.16;
          const tt = clamp01((phase - start) / (end - start));
          const w = lerp(100, f.target * 100, easeInOut(tt));
          return (
            <div className="min-w-0" key={f.label}>
              <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.12em]">
                <span className="text-white/65">{f.label}</span>
                <span className="font-mono text-white/55">
                  {Math.round(w)}%
                </span>
              </div>
              <div className="relative h-3.5 overflow-hidden rounded-sm bg-white/[0.06]">
                <div
                  className="absolute inset-y-0 left-0 bg-white/85"
                  style={{
                    width: `${w}%`,
                    transition: "width 240ms cubic-bezier(0.2,0.7,0.2,1)",
                  }}
                />
                <div
                  className="absolute inset-y-0 right-0 bg-rose-300/30"
                  style={{
                    width: `${100 - w}%`,
                    transition: "width 240ms cubic-bezier(0.2,0.7,0.2,1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </StationShell>
  );
}

function clamp01(x: number): number {
  if (x < 0) {
    return 0;
  }
  if (x > 1) {
    return 1;
  }
  return x;
}

function TransformStation({
  t,
  onCardPointerEnter,
}: {
  t: number;
  onCardPointerEnter: () => void;
}) {
  const phase = pipelinePhase(t);
  const active = phase >= 2 && phase < 3;
  const frameIdx =
    Math.floor(t * TRANSFORM_FRAMES.length) % TRANSFORM_FRAMES.length;
  const frame = TRANSFORM_FRAMES[frameIdx] ?? "advisory";
  const count = formatCount(FUNNEL_COUNTS[3]);
  return (
    <StationShell
      active={active}
      count={count}
      index={2}
      onCardPointerEnter={onCardPointerEnter}
      title="Devin · transform"
    >
      <div className="relative flex h-full min-h-[200px] flex-col overflow-hidden rounded-md border border-white/10 bg-black/40">
        <div className="flex items-center gap-2 border-white/10 border-b bg-black/40 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="ml-2 font-mono text-white/55 text-xs">
            transform.frame · {frame}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {TRANSFORM_FRAMES.map((f, i) => (
              <span
                className={`h-1 w-3 rounded-full transition-colors duration-300 ${
                  i === frameIdx ? "bg-white" : "bg-white/20"
                }`}
                key={f}
              />
            ))}
          </span>
        </div>
        <div className="relative flex-1 p-3" key={frame}>
          <div
            className="h-full"
            style={{ animation: "step-fade-in 360ms ease-out both" }}
          >
            <TransformFrameView frame={frame} />
          </div>
        </div>
      </div>
    </StationShell>
  );
}

function TransformFrameView({ frame }: { frame: TransformFrame }) {
  if (frame === "advisory") {
    return (
      <pre className="overflow-hidden whitespace-pre-wrap font-mono text-sm text-white/75 leading-snug">
        {`GHSA-rqpp-rjj8-7wv8
Auth Bypass in OpenClaw Gateway
Severity: Critical (CVSS 10.0)
CWE-269 · CWE-862

WebSocket handler did not strip
client-declared scopes…`}
      </pre>
    );
  }
  if (frame === "diff") {
    return (
      <pre className="overflow-hidden font-mono text-sm leading-snug">
        <div className="text-sky-300">@@ message-handler.ts @@</div>
        <div className="text-rose-300">
          - if (auth === "shared-token") return;
        </div>
        <div className="text-rose-300">- if (auth === "shared-pw") return;</div>
        <div className="text-white/65">
          {"  "}if (deviceId === null) {"{"}
        </div>
        <div className="text-white/65">
          {"    "}scopes = scopes.filter(SAFE);
        </div>
        <div className="text-white/65">
          {"  "}
          {"}"}
        </div>
        <div className="text-emerald-300">+ clearUnboundScopes(ctx);</div>
      </pre>
    );
  }
  if (frame === "classify") {
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-white/75 text-xs">
            CWE-269
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 font-mono text-white/75 text-xs">
            CWE-862
          </span>
          <span className="font-mono text-white/55">→</span>
          <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[rgb(var(--bg-deep))] text-xs">
            auth-bypass
          </span>
        </div>
        <div className="text-sm text-white/65 leading-relaxed">
          <span className="font-mono text-white">13</span> canonical classes;
          verified on diff: structural authz, not crypto/injection.
        </div>
      </div>
    );
  }
  if (frame === "localize") {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="rounded border border-white/10 bg-black/30 px-2.5 py-2">
          <div className="break-all font-mono text-sm text-white/85">
            <span className="text-white/55">
              src/gateway/server/ws-connection/
            </span>
            message-handler.ts
          </div>
          <div className="font-mono text-emerald-300/85 text-xs">
            fn clearUnboundScopes
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/30 px-2.5 py-2">
          <div className="break-all font-mono text-sm text-white/85">
            <span className="text-white/55">
              src/gateway/server/ws-connection/
            </span>
            message-handler.ts
          </div>
          <div className="font-mono text-emerald-300/85 text-xs">
            fn handleMissingDeviceIdentity
          </div>
        </div>
        <div className="text-white/55 text-xs leading-snug">
          Paths, symbols, and lines: scrubbed from hints, kept as ground truth.
        </div>
      </div>
    );
  }
  return (
    <pre className="overflow-hidden whitespace-pre-wrap break-words font-mono text-sm text-white/80 leading-snug">
      {`{
  "task_id": "ecvebench-openclaw-003",
  "ghsa_id": "GHSA-rqpp-rjj8-7wv8",
  "codebase": {
    "repo": "openclaw/openclaw",
    "commit": "55f47e5c",
    "lang": "typescript"
  },
  "ground_truth": {
    "vuln_class": "auth-bypass",
    "cvss": 10.0,
    "locations": [/* 2 */]
  }
}`}
    </pre>
  );
}

function LocateStation({
  t,
  onCardPointerEnter,
}: {
  t: number;
  onCardPointerEnter: () => void;
}) {
  const phase = pipelinePhase(t);
  const active = phase >= 3 && phase < 4;
  const count = formatCount(FUNNEL_COUNTS[3]);
  return (
    <StationShell
      active={active}
      count={count}
      index={3}
      onCardPointerEnter={onCardPointerEnter}
      title="Locate · scrub"
    >
      <div className="relative flex h-full min-h-[200px] flex-col gap-2 overflow-hidden rounded-md bg-black/30 p-3">
        <div className="font-mono text-white/55 text-xs">
          openclaw/openclaw @ 55f47e5c
        </div>
        <MiniRepoTree highlight={active} />
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs">
            <div className="text-white/55">paths kept</div>
            <div className="font-mono text-emerald-300">2 in ground truth</div>
          </div>
          <div className="rounded border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs">
            <div className="text-white/55">hint redaction</div>
            <div className="font-mono text-rose-300">strict</div>
          </div>
        </div>
      </div>
    </StationShell>
  );
}

const TREE_LINES: { indent: number; name: string; pin?: "ok" | "miss" }[] = [
  { indent: 0, name: "src/" },
  { indent: 1, name: "gateway/" },
  { indent: 2, name: "server/" },
  { indent: 3, name: "ws-connection/" },
  { indent: 4, name: "message-handler.ts", pin: "ok" },
  { indent: 4, name: "auth-handler.ts" },
  { indent: 4, name: "frame-codec.ts" },
  { indent: 3, name: "scopes.ts" },
];

function MiniRepoTree({ highlight }: { highlight: boolean }) {
  return (
    <div className="rounded border border-white/10 bg-black/40 p-2.5 font-mono text-xs">
      {TREE_LINES.map((line) => {
        let cls = "text-white/65";
        if (line.pin === "ok") {
          cls = highlight ? "text-emerald-300" : "text-emerald-300/70";
        }
        return (
          <div
            className={`flex min-w-0 items-center gap-2 ${cls}`}
            key={`${line.indent}-${line.name}`}
          >
            <span
              className="min-w-0 flex-1 truncate"
              style={{ paddingLeft: `${line.indent * 7}px` }}
            >
              {line.name}
            </span>
            {line.pin === "ok" && (
              <span className="shrink-0 rounded bg-emerald-300/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                2 fns
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DatasetStation({
  t,
  onCardPointerEnter,
}: {
  t: number;
  onCardPointerEnter: () => void;
}) {
  const phase = pipelinePhase(t);
  const active = phase >= 4;
  const local = clamp01(phase - 4);
  const count = formatCount(
    Math.round(lerp(FUNNEL_COUNTS[3], FUNNEL_COUNTS[4], easeInOut(local)))
  );
  return (
    <StationShell
      active={active}
      count={count}
      index={4}
      onCardPointerEnter={onCardPointerEnter}
      title="ECVEBench"
    >
      <div className="flex h-full min-h-[200px] flex-col gap-2 overflow-hidden rounded-md bg-black/30 p-3">
        <div className="text-white/55 text-xs uppercase tracking-[0.12em]">
          138 tasks · 13 classes
        </div>
        <ClassBars t={t} />
        <div className="mt-auto flex items-center justify-between rounded border border-white/10 bg-black/40 px-2.5 py-2">
          <span className="font-mono text-white/65 text-xs">
            schema-validated
          </span>
          <span className="flex items-center gap-1.5 font-mono text-emerald-300 text-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
            PR open
          </span>
        </div>
      </div>
    </StationShell>
  );
}

function ClassBars({ t }: { t: number }) {
  const max = Math.max(...VULN_CLASSES.map((v) => v.count));
  return (
    <div className="flex h-20 items-end gap-[3px]">
      {VULN_CLASSES.map((v, i) => {
        const h = (v.count / max) * 100;
        const wavePos = i / VULN_CLASSES.length;
        const distance = Math.abs(t - wavePos);
        const wrapped = Math.min(distance, 1 - distance);
        const intensity = Math.max(0, 1 - wrapped * 8);
        const opacity = 0.55 + intensity * 0.4;
        return (
          <div
            className="group relative flex-1"
            key={v.id}
            style={{
              height: `${h}%`,
              backgroundColor: `rgba(244,248,255,${opacity})`,
              borderRadius: "1.5px",
              transition: "background-color 120ms linear",
            }}
            title={`${v.label} · ${v.count}`}
          />
        );
      })}
    </div>
  );
}

// ---------- Localize panel ----------

const REPO_COLS = 36;
const REPO_ROWS = 10;
const REPO_TOTAL = REPO_COLS * REPO_ROWS;

interface RepoCell {
  col: number;
  fpDelay: number;
  fpDuration: number;
  isHit: boolean;
  row: number;
}

function buildRepoCells(): RepoCell[] {
  const cells: RepoCell[] = [];
  const hits = new Set<number>([
    Math.floor(REPO_COLS * 0.34) + Math.floor(REPO_ROWS * 0.4) * REPO_COLS,
    Math.floor(REPO_COLS * 0.36) + Math.floor(REPO_ROWS * 0.4) * REPO_COLS,
  ]);
  for (let r = 0; r < REPO_ROWS; r += 1) {
    for (let c = 0; c < REPO_COLS; c += 1) {
      const idx = r * REPO_COLS + c;
      const seed = (r * 13 + c * 7) % 100;
      cells.push({
        col: c,
        row: r,
        isHit: hits.has(idx),
        fpDelay: ((seed * 137) % 6000) / 1000,
        fpDuration: 1.6 + ((seed * 31) % 1400) / 1000,
      });
    }
  }
  return cells;
}

function LocalizePanel({ t }: { t: number }) {
  const cells = useMemo(buildRepoCells, []);
  const sweepX = (t * 100) % 100;
  return (
    <div className="relative grid grid-cols-1 gap-4 border-white/10 border-t bg-black/15 px-4 py-5 md:grid-cols-[1fr_2.4fr] md:gap-5 md:px-8 md:py-6">
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-center gap-3 text-white/65 text-xs uppercase tracking-[0.14em]">
          <span className="font-mono">06</span>
          <span className="inline-block h-px w-5 bg-white/25" />
          <span>The hard problem</span>
        </div>
        <h3 className="text-balance font-semibold text-2xl text-white leading-tight tracking-tight md:text-[1.75rem]">
          Find <span className="text-rose-300">2 vulnerable functions</span> in{" "}
          <span className="font-mono text-white">{REPO_TOTAL}</span> files.
        </h3>
        <p className="max-w-md text-base text-white/70 leading-snug">
          L2 is the bottleneck:{" "}
          <span className="font-mono text-white">~0.4</span> with a scrubbed
          CVE—worse with no hint.
        </p>
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <Stat label="files" value={REPO_TOTAL.toString()} />
          <Stat label="vuln" tone="rose" value="2" />
          <Stat label="signal" tone="muted" value="0.6%" />
        </div>
        <div className="space-y-1.5 text-sm">
          <Legend color="rose" label="ground truth (vuln)" />
          <Legend color="amber" label="false positive" />
          <Legend color="muted" label="benign" />
        </div>
      </div>

      <div
        className="relative min-h-[220px] overflow-hidden rounded-xl border border-white/15 bg-black/40 p-4"
        style={{ aspectRatio: `${REPO_COLS} / ${REPO_ROWS + 3}` }}
      >
        <div className="mb-2 flex items-center justify-between font-mono text-white/55 text-xs">
          <span>repo · openclaw/openclaw @ 55f47e5c</span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-[cb-blink_1.4s_ease-in-out_infinite] rounded-full bg-amber-300" />
            agent scanning
          </span>
        </div>
        <div className="relative h-[calc(100%-1.5rem)] w-full">
          <div
            className="grid h-full w-full gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${REPO_COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${REPO_ROWS}, minmax(0, 1fr))`,
            }}
          >
            {cells.map((cell) => (
              <RepoDot cell={cell} key={`${cell.row}-${cell.col}`} />
            ))}
          </div>
          <SweepBeam x={sweepX} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-1 pb-0.5 font-mono text-[10px] text-white/45 sm:text-xs">
            <span>main.ts</span>
            <span>tests/</span>
            <span>vendor/</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RepoDot({ cell }: { cell: RepoCell }) {
  if (cell.isHit) {
    return (
      <div
        aria-hidden="true"
        className="rounded-[2px]"
        style={{
          animation: "cb-tp-glow 1.6s ease-in-out infinite",
        }}
      />
    );
  }
  return (
    <div aria-hidden="true" className="relative rounded-[2px] bg-white/[0.04]">
      <div
        className="absolute inset-0 rounded-[2px] bg-amber-300/80"
        style={{
          animation: `cb-fp-flash ${cell.fpDuration}s ease-in-out ${cell.fpDelay}s infinite`,
        }}
      />
    </div>
  );
}

function SweepBeam({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-y-0 w-24"
        style={{
          left: `${x}%`,
          transform: "translateX(-90%)",
          background:
            "linear-gradient(90deg, rgba(110,231,255,0) 0%, rgba(110,231,255,0.18) 60%, rgba(110,231,255,0.55) 96%, rgba(255,255,255,0.85) 100%)",
        }}
      />
      <div
        className="absolute inset-y-0 w-px"
        style={{
          left: `${x}%`,
          background: "rgba(255,255,255,0.85)",
          boxShadow:
            "0 0 8px rgba(110,231,255,0.85), 0 0 18px rgba(110,231,255,0.45)",
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "rose" | "muted";
}) {
  let valueCls = "text-white";
  if (tone === "rose") {
    valueCls = "text-rose-300";
  } else if (tone === "muted") {
    valueCls = "text-white/65";
  }
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <div className="text-[10px] text-white/55 uppercase tracking-[0.14em] sm:text-xs">
        {label}
      </div>
      <div className={`font-mono text-lg tabular-nums ${valueCls}`}>
        {value}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
}: {
  color: "rose" | "amber" | "muted";
  label: string;
}) {
  let dot = "bg-white/30";
  if (color === "rose") {
    dot = "bg-rose-300";
  } else if (color === "amber") {
    dot = "bg-amber-300";
  }
  return (
    <div className="flex items-center gap-2.5 text-white/75">
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ${dot}`}
      />
      <span>{label}</span>
    </div>
  );
}

// ---------- Caption ----------

const CAPTIONS: { from: number; to: number; line: string }[] = [
  {
    from: 0,
    to: 0.2,
    line: "30,000 reviewed advisories enter the pipeline · linked patches, CWEs, CVSS.",
  },
  {
    from: 0.2,
    to: 0.4,
    line: "Filters cut 96% · we keep what's CWE-mapped, CVSS \u2265 4, single-repo, English.",
  },
  {
    from: 0.4,
    to: 0.6,
    line: "Devin reads each diff · classifies, locates, and scrubs the hint.",
  },
  {
    from: 0.6,
    to: 0.8,
    line: "Locations stay as ground truth. The hint never names a file or function.",
  },
  {
    from: 0.8,
    to: 1.01,
    line: "138 tasks across 13 classes \u2192 the agent must find the needle in the repo.",
  },
];

const FALLBACK_CAPTION = CAPTIONS[0] ?? {
  from: 0,
  to: 1,
  line: "",
};

function CaptionStrip({
  t,
  lockedStageIndex,
}: {
  t: number;
  lockedStageIndex: number | null;
}) {
  const activeCaption =
    lockedStageIndex === null
      ? (CAPTIONS.find((c) => t >= c.from && t < c.to) ?? FALLBACK_CAPTION)
      : (CAPTIONS[lockedStageIndex] ?? FALLBACK_CAPTION);
  const progressT =
    lockedStageIndex === null
      ? t
      : (lockedStageIndex + 0.5) / PIPELINE_LABELS.length;
  return (
    <div className="relative flex items-center gap-3 border-white/10 border-t bg-black/25 px-6 py-3.5 md:px-8">
      <span className="shrink-0 font-mono text-white/55 text-xs uppercase tracking-[0.14em]">
        narrative
      </span>
      <span className="inline-block h-px w-6 bg-white/25" />
      <div className="relative h-7 min-w-0 flex-1 overflow-hidden md:h-6">
        <div
          className="absolute inset-0 truncate text-base text-white/85"
          key={activeCaption.line + String(lockedStageIndex)}
          style={{ animation: "step-fade-in 360ms ease-out both" }}
        >
          {activeCaption.line}
        </div>
      </div>
      <span className="hidden shrink-0 font-mono text-white/45 text-xs md:inline">
        {Math.round(progressT * 100)
          .toString()
          .padStart(2, "0")}{" "}
        / 100
      </span>
    </div>
  );
}
