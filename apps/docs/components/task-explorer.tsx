"use client";

import { useMemo, useState } from "react";
import tasksData from "@/lib/tasks-data.json";

type Task = (typeof tasksData)[number];

const VULN_CLASSES = [...new Set(tasksData.map((t) => t.vuln_class))].sort();
const LANGUAGES = [...new Set(tasksData.map((t) => t.language))].sort();
const ECOSYSTEMS = [...new Set(tasksData.map((t) => t.ecosystem))].sort();

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      aria-label={placeholder}
      className="rounded-md border bg-fd-background px-3 py-1.5 text-sm"
      onChange={(e) => onChange(e.target.value)}
      value={value}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Badge({
  children,
  variant,
}: {
  children: string;
  variant: "default" | "outline";
}) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  const styles =
    variant === "default"
      ? "bg-fd-primary text-fd-primary-foreground"
      : "border text-fd-muted-foreground";
  return <span className={`${base} ${styles}`}>{children}</span>;
}

function TaskCard({
  task,
  expanded,
  onToggle,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border bg-fd-card">
      <button
        className="w-full p-4 text-left transition-colors hover:bg-fd-accent/50"
        onClick={onToggle}
        type="button"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="truncate font-medium font-mono text-sm">
              {task.task_id}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="default">{task.vuln_class}</Badge>
              <Badge variant="outline">{task.language}</Badge>
              <Badge variant="outline">{task.ecosystem}</Badge>
              {task.cvss !== null && (
                <Badge variant="outline">{`CVSS ${task.cvss}`}</Badge>
              )}
            </div>
          </div>
          <span className="shrink-0 text-fd-muted-foreground text-sm">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-4 text-sm">
          <div>
            <span className="font-medium">GHSA:</span>{" "}
            <a
              className="text-fd-primary underline"
              href={`https://github.com/advisories/${task.ghsa_id}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {task.ghsa_id}
            </a>
          </div>
          <div>
            <span className="font-medium">Repository:</span>{" "}
            <a
              className="text-fd-primary underline"
              href={task.repo}
              rel="noopener noreferrer"
              target="_blank"
            >
              {task.repo.replace("https://github.com/", "")}
            </a>
          </div>
          <div>
            <span className="font-medium">Reason:</span>{" "}
            <span className="text-fd-muted-foreground">{task.reason}</span>
          </div>
          <div>
            <span className="font-medium">Locations:</span>
            <ul className="mt-1 space-y-0.5 font-mono text-xs">
              {task.locations.map((loc) => (
                <li key={`${loc.file}:${loc.function ?? ""}`}>
                  {loc.file}
                  {loc.function ? ` → ${loc.function}` : ""}
                </li>
              ))}
            </ul>
          </div>
          {task.hint_l1 && (
            <div>
              <span className="font-medium">L1 Hint (area):</span>{" "}
              <span className="text-fd-muted-foreground">{task.hint_l1}</span>
            </div>
          )}
          {task.hint_l2 && (
            <div>
              <span className="font-medium">L2 Hint (description):</span>{" "}
              <span className="text-fd-muted-foreground">{task.hint_l2}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskExplorer() {
  const [search, setSearch] = useState("");
  const [vulnClass, setVulnClass] = useState("");
  const [language, setLanguage] = useState("");
  const [ecosystem, setEcosystem] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return tasksData.filter((t) => {
      if (vulnClass && t.vuln_class !== vulnClass) {
        return false;
      }
      if (language && t.language !== language) {
        return false;
      }
      if (ecosystem && t.ecosystem !== ecosystem) {
        return false;
      }
      if (
        query &&
        !t.task_id.toLowerCase().includes(query) &&
        !t.ghsa_id.toLowerCase().includes(query) &&
        !t.repo.toLowerCase().includes(query) &&
        !t.reason.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [search, vulnClass, language, ecosystem]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search tasks"
          className="min-w-48 flex-1 rounded-md border bg-fd-background px-3 py-1.5 text-sm"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          type="text"
          value={search}
        />
        <Select
          onChange={setVulnClass}
          options={VULN_CLASSES}
          placeholder="All classes"
          value={vulnClass}
        />
        <Select
          onChange={setLanguage}
          options={LANGUAGES}
          placeholder="All languages"
          value={language}
        />
        <Select
          onChange={setEcosystem}
          options={ECOSYSTEMS}
          placeholder="All ecosystems"
          value={ecosystem}
        />
      </div>

      <div className="text-fd-muted-foreground text-sm">
        Showing {filtered.length} of {tasksData.length} tasks
      </div>

      <div className="space-y-2">
        {filtered.map((task) => (
          <TaskCard
            expanded={expandedId === task.task_id}
            key={task.task_id}
            onToggle={() =>
              setExpandedId(expandedId === task.task_id ? null : task.task_id)
            }
            task={task}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-fd-muted-foreground">
          No tasks match your filters.
        </div>
      )}
    </div>
  );
}
