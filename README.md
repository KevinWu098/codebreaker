# ECVEBench

A large-scale cybersecurity benchmark that evaluates how well AI agents detect, classify, and localize real-world vulnerabilities. Built on the GitHub Advisory Database, ECVEBench covers **465+ tasks** spanning 13 vulnerability classes across multiple languages and ecosystems.

## Why ECVEBench

Existing vulnerability benchmarks focus narrowly on memory-safety bugs in C/C++. ECVEBench addresses this gap with diverse, multi-language coverage — from SQL injection and XSS to auth bypass and insecure deserialization — grounded in reviewed GitHub Security Advisories (GHSAs) with known patches, CWE mappings, and CVSS scores.

Each task presents an agent with a repository at a pre-patch commit and asks it to determine **whether** a vulnerability exists, **what** class it belongs to, and **where** the vulnerable code lives — scored via gated recall with partial credit for sibling file matches.

## Architecture

```
apps/
├── dashboard        # React UI — session management, benchmarks, audits
├── docs             # Documentation site (Fumadocs / Next.js)
└── landing          # Landing page

packages/
├── control-plane    # Cloudflare Workers API — orchestration, Durable Objects, D1
├── benchmark-runner # TypeScript agent core — prompts, tool definitions, scoring hooks
├── modal-shim       # Python FastAPI bridge for remote sandboxed execution (Modal)
├── docker-shim      # Python FastAPI bridge for local sandboxed execution (Docker)
├── shared           # Zod schemas and TypeScript types shared across packages
└── shim-shared      # Shared Python utilities for both shim services

benchmark/
├── data/tasks/      # 465+ curated task instances (one JSON per GHSA)
├── schema/          # JSON Schemas — task, agent input, agent output, metadata
├── scorer/          # Python scorer — gated composite scoring, ECE diagnostics
├── harness/         # Generates difficulty-specific agent inputs at runtime
└── pipeline/        # Advisory selection, candidate filtering, session dispatch
```

## Key Modules

| Module | Description |
| --- | --- |
| [`benchmark/data/tasks`](benchmark/data/tasks) | Curated vulnerability tasks derived from GHSAs — each includes codebase metadata, multi-level hints (L0–L3), and ground truth locations. |
| [`benchmark/scorer`](benchmark/scorer) | Standalone Python scorer implementing gated composite scoring: binary vulnerability gate → 30% class match + 70% file-level recall. |
| [`packages/control-plane`](packages/control-plane) | Cloudflare Workers backend managing agent sessions, benchmark runs, CVE follow-ups, and multi-agent audits via Durable Objects and D1. |
| [`packages/benchmark-runner`](packages/benchmark-runner) | Agent runtime — model selection, system prompts, tool capability mapping, and structured output parsing for benchmark submissions. |
| [`packages/modal-shim`](packages/modal-shim) | FastAPI service bridging the control plane to Modal sandboxes for isolated code execution during agent evaluation. |
| [`apps/dashboard`](apps/dashboard) | React dashboard for monitoring sessions, reviewing benchmark results, managing audits, and exploring CVE follow-ups. |
| [`benchmark/schema`](benchmark/schema) | Formal JSON Schemas defining the contract between tasks, agent inputs, and agent outputs. |

## Benchmark Design

**Difficulty is a runtime parameter, not a separate task.** One canonical record exists per GHSA; the harness projects it into a difficulty-specific agent input at evaluation time.

| Level | What the agent sees |
| --- | --- |
| **L0** | Repository only. No hints. Pure discovery. |
| **L1** | Repository + vague area hint. No vulnerability details. |
| **L2** | Repository + scrubbed CVE description. No location info. |
| **L3** | Repository + targeted hint and description. Narrows to ~3–5 files. |

## Getting Started

```bash
# Prerequisites: Node ≥ 24, pnpm
pnpm install

# Development
pnpm dev:dashboard     # Vite dev server for the dashboard
pnpm dev:docs          # Next.js dev server for documentation
pnpm dev:worker        # Cloudflare Workers local dev

# Code quality
pnpm check             # Lint & format check (Biome via Ultracite)
pnpm fix               # Auto-fix lint & format issues
pnpm typecheck         # TypeScript type checking across all packages

# Run the scorer
python benchmark/scorer/score.py \
  --tasks benchmark/data/tasks/ \
  --outputs path/to/outputs.jsonl \
  --results results.json
```
