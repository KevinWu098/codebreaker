import { FUNNEL_STAGES, SAMPLE_REPOS } from "@/viz/benchmark/data";
import { AnimatedBar } from "@/viz/components/animated-bar";
import { AnimatedNumber } from "@/viz/components/animated-number";
import { Reveal } from "@/viz/components/reveal";

export function SourcingSection() {
  return (
    <section className="relative border-white/15 border-t bg-[rgb(var(--bg-deep))]">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <Reveal>
          <SectionLabel index="03" title="Sourcing the dataset" />
        </Reveal>
        <div className="mt-10 grid gap-12 lg:grid-cols-[5fr_7fr]">
          <Reveal>
            <h2 className="text-balance font-semibold text-3xl text-white leading-[1.15] tracking-tight md:text-5xl">
              30,000 reviewed advisories, narrowed by Devin into a single honest
              test set.
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <div className="space-y-6 text-base text-white/70 leading-relaxed md:text-lg">
              <p>
                We start at the largest source of structured, ground-truthed
                vulnerability data on the planet: GitHub&rsquo;s Advisory
                Database. We restrict to <em>reviewed</em> advisories &mdash;
                triaged by GitHub&rsquo;s security team, with linked patch
                commits, CWE classifications, and CVSS scores.
              </p>
              <p>
                A scripted pipeline does the cheap work: filter for
                English-language, single-repository advisories with a resolvable
                patch commit; map their CWEs to one of 13 canonical
                vulnerability classes; apply a CVSS floor; then stratify-sample
                so every class is represented.
              </p>
              <p>
                The hard work &mdash; reading the diff, distinguishing root
                cause from refactor, scrubbing location-revealing language out
                of the hint &mdash; is delegated to{" "}
                <span className="text-white">Devin</span>. One agent per
                advisory, one PR per task, every PR reviewed before merge.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delayMs={200}>
          <Funnel />
        </Reveal>

        <Reveal delayMs={120}>
          <div className="mt-24">
            <div className="mb-6 text-white/70 text-xs uppercase tracking-[0.18em]">
              A sample of the projects we drew from
            </div>
            <RepoMarquee />
            <p className="mt-6 max-w-3xl text-sm text-white/70 leading-relaxed">
              115 unique projects across infrastructure, ML, web, and language
              runtimes. Real codebases, real patch commits, real CVEs. Not a
              synthetic corpus.
            </p>
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

function Funnel() {
  const maxCount = FUNNEL_STAGES[0].count;
  return (
    <div className="mt-16 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04]">
      <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-5 md:divide-x md:divide-y-0">
        {FUNNEL_STAGES.map((stage, idx) => {
          const widthPct = Math.max(8, (stage.count / maxCount) * 100);
          return (
            <div
              className="group relative flex min-w-0 flex-col p-6 transition-colors duration-300 hover:bg-white/[0.03]"
              key={stage.label}
            >
              <div className="flex items-center gap-2 text-white/65 text-xs">
                <span className="font-mono">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="uppercase tracking-[0.16em]">
                  {idx === FUNNEL_STAGES.length - 1 ? "Final" : "Stage"}
                </span>
              </div>
              <div className="mt-4 break-words font-mono font-semibold text-3xl text-white tabular-nums leading-tight md:text-4xl">
                <AnimatedNumber value={stage.count} />
              </div>
              <div className="mt-1 text-sm text-white">{stage.label}</div>
              <div className="mt-3">
                <AnimatedBar
                  accent="rgb(244, 248, 255)"
                  delayMs={idx * 140}
                  durationMs={1300}
                  pct={widthPct}
                />
              </div>
              <div className="mt-3 text-white/75 text-xs leading-relaxed">
                {stage.note}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RepoMarquee() {
  const lane1 = SAMPLE_REPOS.slice(0, Math.ceil(SAMPLE_REPOS.length / 2));
  const lane2 = SAMPLE_REPOS.slice(Math.ceil(SAMPLE_REPOS.length / 2));
  return (
    <div className="space-y-3">
      <Lane repos={[...lane1, ...lane1]} />
      <Lane repos={[...lane2, ...lane2]} reverse />
    </div>
  );
}

function Lane({
  repos,
  reverse = false,
}: {
  repos: typeof SAMPLE_REPOS;
  reverse?: boolean;
}) {
  return (
    <div className="group/lane relative overflow-hidden">
      <div
        className="flex w-max gap-3 [animation-play-state:running] group-hover/lane:[animation-play-state:paused]"
        style={{
          animation: `marquee ${reverse ? "65" : "55"}s linear infinite${reverse ? " reverse" : ""}`,
        }}
      >
        {repos.map((repo, i) => {
          const half = repos.length / 2;
          const lap = i < half ? "a" : "b";
          return (
            <div
              className="flex shrink-0 cursor-default items-center gap-3 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 transition-all duration-200 hover:border-white/35 hover:bg-white/[0.08]"
              key={`${repo.org}-${repo.name}-${lap}`}
            >
              <span className="font-mono text-sm text-white/85">
                <span className="text-white/65">{repo.org}/</span>
                {repo.name}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/85 uppercase tracking-[0.12em]">
                {repo.language}
              </span>
              <span className="font-mono text-white/65 text-xs">
                ★ {repo.stars}
              </span>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[rgb(var(--bg-deep))] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[rgb(var(--bg-deep))] to-transparent" />
    </div>
  );
}
