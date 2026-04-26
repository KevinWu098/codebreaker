"use client";

import tasksData from "@/lib/tasks-data.json";

interface CountEntry {
  count: number;
  label: string;
}

function countBy(key: "language" | "vuln_class" | "ecosystem"): CountEntry[] {
  const counts = new Map<string, number>();
  for (const task of tasksData) {
    const value = task[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function BarChart({ data, title }: { data: CountEntry[]; title: string }) {
  const max = Math.max(...data.map((d) => d.count));

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-lg">{title}</h3>
      <div className="space-y-1.5">
        {data.map((entry) => (
          <div className="flex items-center gap-3" key={entry.label}>
            <span className="w-40 shrink-0 text-right font-mono text-fd-muted-foreground text-sm">
              {entry.label}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded-sm bg-fd-muted">
              <div
                className="h-full rounded-sm bg-fd-primary transition-all duration-300"
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right font-medium text-sm tabular-nums">
              {entry.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CvssHistogram() {
  const buckets = new Map<string, number>();
  const ranges = [
    { label: "0–2", min: 0, max: 2 },
    { label: "2–4", min: 2, max: 4 },
    { label: "4–6", min: 4, max: 6 },
    { label: "6–8", min: 6, max: 8 },
    { label: "8–10", min: 8, max: 10.1 },
  ];

  for (const r of ranges) {
    buckets.set(r.label, 0);
  }

  for (const task of tasksData) {
    const cvss = task.cvss;
    if (cvss === null) {
      continue;
    }
    for (const r of ranges) {
      if (cvss >= r.min && cvss < r.max) {
        buckets.set(r.label, (buckets.get(r.label) ?? 0) + 1);
        break;
      }
    }
  }

  const data = ranges.map((r) => ({
    label: r.label,
    count: buckets.get(r.label) ?? 0,
  }));

  return <BarChart data={data} title="CVSS Score Distribution" />;
}

function SummaryStats() {
  const languages = new Set(tasksData.map((t) => t.language));
  const classes = new Set(tasksData.map((t) => t.vuln_class));
  const ecosystems = new Set(tasksData.map((t) => t.ecosystem));
  const cvssValues = tasksData
    .map((t) => t.cvss)
    .filter((v): v is number => v !== null);
  const avgCvss = cvssValues.reduce((a, b) => a + b, 0) / cvssValues.length;

  const stats = [
    { label: "Total Tasks", value: tasksData.length.toString() },
    { label: "Languages", value: languages.size.toString() },
    { label: "Vuln Classes", value: classes.size.toString() },
    { label: "Ecosystems", value: ecosystems.size.toString() },
    { label: "Avg CVSS", value: avgCvss.toFixed(1) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {stats.map((s) => (
        <div
          className="rounded-lg border bg-fd-card p-4 text-center"
          key={s.label}
        >
          <div className="font-bold text-2xl tabular-nums">{s.value}</div>
          <div className="mt-1 text-fd-muted-foreground text-xs">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function StatsCharts() {
  const languages = countBy("language");
  const vulnClasses = countBy("vuln_class");
  const ecosystems = countBy("ecosystem");

  return (
    <div className="space-y-8">
      <SummaryStats />
      <BarChart data={languages} title="Language Distribution" />
      <BarChart data={vulnClasses} title="Vulnerability Class Distribution" />
      <BarChart data={ecosystems} title="Ecosystem Distribution" />
      <CvssHistogram />
    </div>
  );
}
