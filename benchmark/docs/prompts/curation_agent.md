# ECVEBench Task Curation

You are curating a vulnerability task for the ECVEBench benchmark. You have been given a GitHub Security Advisory (GHSA). Your job is to produce two JSON files and open a PR adding them to this repository.

## Advisory to curate

- **GHSA ID**: {{GHSA_ID}}
- **Advisory URL**: https://github.com/advisories/{{GHSA_ID}}

## Step 1: Read the advisory

Go to the advisory URL above. Read the full description and extract:
- **CVSS score**: Look for the CVSS score on the advisory page (e.g., "9.8" or "7.5"). GitHub advisories almost always display this. Record the numeric value (0.0–10.0). Only use `null` if the advisory genuinely has no CVSS score listed.
- **CWE IDs**: Note all CWE identifiers (e.g., CWE-78, CWE-79).
- **CVE ID**: If a CVE is linked, note it.
- **References**: Collect all commit links, PR links, and release tag links.

## Step 2: Find the patch commit

Look through the advisory's references for a link to the patch commit. It may be:
- A direct commit URL: `github.com/{owner}/{repo}/commit/{sha}`
- A pull request URL: `github.com/{owner}/{repo}/pull/{number}` — find the merge commit
- A release tag URL: `github.com/{owner}/{repo}/releases/tag/{tag}` — resolve the tag to a commit

If you cannot find a resolvable patch commit, STOP and report that this advisory cannot be curated.

## Step 3: Identify the pre-patch commit

The pre-patch commit is the parent of the patch commit. Use `git log` or the GitHub API to find the first parent SHA of the patch commit. This is the commit that will be served to the agent — it contains the vulnerability.

## Step 4: Examine the patch diff

Look at what the patch commit changed. Identify:
- Which files were modified (excluding test files, docs, configs, changelogs)
- Which functions were modified in those source files
- Whether the patch is "noisy" — if more than 3 non-test source files were changed, it is noisy

## Step 5: Classify the vulnerability

Based on the advisory description and CWE IDs, classify the vulnerability into exactly ONE of these classes:

- `command-injection` — unsanitized input passed to shell exec calls
- `sql-injection` — unsanitized input in SQL queries
- `xss` — unescaped user input rendered in HTML
- `buffer-overflow` — out-of-bounds memory read or write
- `use-after-free` — memory accessed after deallocation
- `path-traversal` — unsanitized file path allows directory escape
- `auth-bypass` — authentication or authorization check circumvented
- `xxe` — XML external entity injection
- `insecure-deserialization` — unsafe deserialization of untrusted input
- `crypto-weakness` — weak or misused cryptographic primitive
- `race-condition` — unsafe concurrent access to shared resource
- `integer-overflow` — integer arithmetic wraps or truncates unsafely
- `null-deref` — null pointer dereferenced without check

If the vulnerability does not clearly fit any of these classes, STOP and report that this advisory cannot be curated.

## Step 6: Derive locations

Locations are the specific file(s) and function(s) where the vulnerability exists in the PRE-PATCH code. Derive them using this priority:

1. **From the advisory description** — if it explicitly names files, functions, or line numbers, use those (highest quality).
2. **From the patch diff** — look at what was changed. The vulnerable code is what was removed or modified. Filter out test files, docs, and config files.
3. If the patch is noisy (many files changed due to refactoring), prefer locations from the advisory description over the diff.

Each location must have:
- `file`: relative path from repo root (e.g., `src/auth/login.py`)
- `function`: the function name where the vulnerability lives, or `null` if you cannot determine it

## Step 7: Write the L1 hint

ECVEBench scores agents on **localization** — identifying the vulnerable file(s) and function(s). The L1 hint must describe the vulnerability without giving away where it lives. Unlike benchmarks that score only on exploit generation (where naming the function is fine), any location-revealing detail in our hint undermines the benchmark.

### What to REMOVE (deny-list)

Strip all of the following from the description:
- File paths or file names (e.g., `src/auth/login.py`, `install.js`)
- Function, method, or class names (e.g., `runLinux()`, `H5S_get_simple_extent_dims`)
- Line numbers or column references
- Variable names, parameter names, or struct/field names
- Code snippets, pseudocode, or regex patterns
- Library or module names that uniquely identify the vulnerable file (e.g., "LibGfx" when there's a single `libgfx/` directory)

### What to KEEP (allow-list)

The hint should still be useful. Include:
- **Vulnerability type**: the class of bug (e.g., "command injection", "buffer overflow")
- **Mechanism**: how the bug works at a conceptual level (e.g., "unsanitized input passed to a shell exec call")
- **Input vector**: where attacker input enters (e.g., "user-controlled string from a remote server", "crafted HTTP header")
- **Impact**: what happens if exploited (e.g., "arbitrary command execution", "out-of-bounds read")

### The grep test

Ask yourself: *could someone use this hint to `grep` the codebase and find the vulnerable code in under a minute?* If yes, it's too specific. Rewrite it.

### Examples

**Too revealing** (names function + file context):
> "The runLinux() function in the install script appends user input to exec()"

**Too revealing** (names library that maps to one directory):
> "LibGfx incorrectly assumes that a scan includes all components for the image."

**Acceptable**:
> "A command injection vulnerability exists where attacker-controlled remote version strings are appended directly into a shell exec() call without sanitization."

**Acceptable**:
> "An image parsing routine incorrectly assumes all components are present in a scan, leading to an out-of-bounds read when processing a crafted file."

**Too vague** (almost useless):
> "A security vulnerability exists in the project."

The hint should narrow the search to a *category of code* (e.g., "image parsing", "authentication middleware", "package installation logic") without naming the specific file or function.

## Step 8: Generate the task ID

Format: `ecvebench-{project}-{NNN}` where:
- `{project}` is the repo name, lowercased, with special characters replaced by hyphens
- `{NNN}` is a zero-padded 3-digit number

Check what task files already exist in `benchmark/data/tasks/` to determine the next available number. If no tasks exist yet for this project, use `001`.

## Step 9: Create the task file

Create `benchmark/data/tasks/{task_id}.json` with this exact structure:

```json
{
  "task_id": "<task_id>",
  "ghsa_id": "<GHSA ID>",
  "codebase": {
    "repo": "https://github.com/<owner>/<repo>",
    "language": "<primary language, lowercase>",
    "commit": "<full 40-char pre-patch SHA>"
  },
  "hints": {
    "L0": null,
    "L1": {
      "description": "<scrubbed description with no file/function references>"
    }
  },
  "ground_truth": {
    "vulnerable": true,
    "vuln_class": "<one of the 13 classes above>",
    "cvss": <CVSS score from the advisory as a number (e.g., 9.8). Use null ONLY if the advisory has no CVSS score listed>,
    "reason": "<1-2 sentence explanation of the vulnerability>",
    "locations": [
      {
        "file": "<relative path from repo root>",
        "function": "<function name or null>"
      }
    ]
  }
}
```

## Step 10: Create the metadata file

Create `benchmark/internal/metadata/{GHSA_ID}.json` with this exact structure:

```json
{
  "ghsa_id": "<GHSA ID>",
  "post_patch_commit": "<full 40-char patch commit SHA>",
  "noisy_patch": "<true if >3 non-test files changed, false otherwise>?",
  "curation_notes": "<explain how you derived the locations and any ambiguities>",
  "dataset_version": "0.1.0",
  "snapshot_date": "<today's date in YYYY-MM-DD format>"
}
```

## Step 11: Open a PR

Open a pull request to this repository with:
- Title: `Add task: {task_id}`
- Branch name: `curate/{task_id}`
- The PR should contain exactly two new files:
  - `benchmark/data/tasks/{task_id}.json`
  - `benchmark/internal/metadata/{GHSA_ID}.json`

## Quality checks before submitting

- [ ] The `commit` field in the task is the PRE-patch SHA (parent of the patch), not the patch itself
- [ ] The `post_patch_commit` in metadata is the actual patch commit SHA
- [ ] Both SHAs are full 40-character hex strings
- [ ] The L1 hint description contains NO file paths, function names, line numbers, or code snippets
- [ ] The `vuln_class` is exactly one of the 13 allowed values
- [ ] The `locations` array has at least one entry
- [ ] The `file` paths in locations are relative from the repo root and exist in the pre-patch commit
- [ ] The JSON is valid and pretty-printed with 2-space indentation
- [ ] The `cvss` field is a number if the advisory lists a CVSS score
