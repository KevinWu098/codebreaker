# ECVEBench Task Curation

You are curating a vulnerability task for the ECVEBench benchmark. You have been given a GitHub Security Advisory (GHSA). Your job is to produce two JSON files and open a PR adding them to this repository.

## Advisory to curate

- **GHSA ID**: {{GHSA_ID}}
- **Advisory URL**: https://github.com/advisories/{{GHSA_ID}}

### Pre-computed fields

These values have been extracted by the selection pipeline. Use them as-is in the output files **unless** Step 5 directs you to override the vulnerability class.

- **Vulnerability class**: `{{VULN_CLASS}}` (verify in Step 5 — override if the diff clearly shows a different class)
- **CVSS score**: {{CVSS}}
- **CVE ID**: {{CVE_ID}}
- **CWE IDs**: {{CWE_IDS}}
- **Ecosystem**: {{ECOSYSTEM}}
- **Snapshot date**: {{SNAPSHOT_DATE}}

## Step 1: Read the advisory

Go to the advisory URL above. Read the full description and extract:
- **Description**: The full vulnerability description (needed for hint writing in Steps 7 and 8).
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

## Step 5: Verify and potentially correct the vulnerability class

The vulnerability class has been pre-assigned as **`{{VULN_CLASS}}`** based on an automated CWE-to-class mapping. After reading the advisory description and the patch diff, critically evaluate whether this classification is correct.

Valid classes:

| Class | What it means |
| --- | --- |
| `command-injection` | Unsanitized input passed to a shell or OS command execution call (e.g., `exec`, `system`, `subprocess`) |
| `sql-injection` | Unsanitized input interpolated into SQL queries, allowing query manipulation |
| `xss` | User input rendered in HTML/JS output without escaping, enabling script injection |
| `buffer-overflow` | Write or read beyond allocated memory bounds (stack or heap) |
| `use-after-free` | Memory accessed after it has been freed/deallocated |
| `path-traversal` | Unsanitized file path input allows escaping the intended directory (e.g., `../`) |
| `auth-bypass` | Authentication or authorization checks can be circumvented, granting unauthorized access |
| `xxe` | XML parser processes external entity declarations, enabling file read or SSRF |
| `insecure-deserialization` | Untrusted data deserialized without validation, enabling object injection or RCE |
| `crypto-weakness` | Weak, broken, or misused cryptographic algorithm or configuration (e.g., hardcoded keys, weak hashes, bad RNG) |
| `race-condition` | Concurrent access to shared state without proper synchronization (TOCTOU, double-fetch, etc.) |
| `integer-overflow` | Integer arithmetic wraps, truncates, or overflows, leading to incorrect sizes, offsets, or allocations |
| `null-deref` | Null/nil pointer dereference due to a missing null check |

### Evaluation criteria

1. **Check the CWE IDs against the assigned class.** Sometimes a CWE maps to a broad category but the actual vulnerability is more specific or belongs to a different class entirely.
2. **Check the patch diff.** The code change is ground truth — if the fix clearly addresses a different vulnerability type than what the CWE suggests, the diff wins.
3. **Check the advisory description.** It often states the vulnerability type explicitly (e.g., "SQL injection", "path traversal").

### Decision

- If the pre-assigned class **`{{VULN_CLASS}}`** is correct, use it as-is.
- If you have **strong evidence** (from the diff and/or description) that a different class from the list above is more accurate, **switch to that class**. Use the corrected class in both `vuln_class` fields (task file and this step's output). In the metadata file's `curation_notes`, explain why you overrode the pre-assigned class (e.g., "Pre-assigned as `auth-bypass` from CWE-287, but the patch fixes an unsanitized SQL query — reclassified to `sql-injection`").
- If the vulnerability does not fit **any** of the 13 classes, STOP and report that this advisory cannot be curated.

## Step 6: Derive locations

Locations are the specific file(s) and function(s) where the vulnerability exists in the PRE-PATCH code.

### 6a. Primary locations (from the CVE patch)

Derive the primary locations using this priority:

1. **From the advisory description** — if it explicitly names files, functions, or line numbers, use those (highest quality).
2. **From the patch diff** — look at what was changed. The vulnerable code is what was removed or modified. Filter out test files, docs, and config files.
3. If the patch is noisy (many files changed due to refactoring), prefer locations from the advisory description over the diff.

### 6b. Sibling locations (same pattern, related files)

After identifying the primary locations, check whether **sibling files** contain the **exact same vulnerability pattern**. Siblings are files that:

- Live in the **same directory** (or an immediately adjacent module directory) as the patched file
- Serve the **same architectural role** (e.g., other database driver files, other protocol handlers, other serializer implementations)
- Contain a **code-level match**: the same vulnerable function name, the same unsafe API call, or the same unsanitized input flow — not just a superficial resemblance

**Do:**
- List the directory of the patched file and scan filenames for obvious siblings (e.g., if the patch is in `drivers/adodb-sqlite3.inc.php`, check `drivers/adodb-mysqli.inc.php`, `drivers/adodb-postgres64.inc.php`, etc.)
- Open a sibling only if its name strongly suggests the same role. Spot-check 2–3 siblings maximum — do not exhaustively audit the entire directory.
- If a sibling has the same vulnerable function with the same unsafe pattern (e.g., same `$table` interpolation into SQL), add it to `locations`.

**Do not:**
- Search the entire codebase for the pattern. Only check siblings of the patched file.
- Add a sibling just because it *uses* a similar API. The sibling must have the **same unpatched vulnerability** — the same missing sanitization, the same missing bounds check, etc.
- Add locations from test files, documentation, or configuration files.

### Location format

Each location must have:
- `file`: relative path from repo root (e.g., `src/auth/login.py`)
- `function`: the function name where the vulnerability lives, or `null` if you cannot determine it

## Step 7: Write the L1 localization hint

ECVEBench uses four difficulty levels. The L1 hint gives the agent a vague sense of *where* to look without describing *what* the vulnerability is. The goal is to scope down the search area while keeping the task difficult — the agent still has to figure out the vulnerability type and the exact location on its own.

### What to REMOVE (deny-list)

Strip all of the following:
- File paths or file names (e.g., `src/auth/login.py`, `install.js`)
- Function, method, or class names (e.g., `runLinux()`, `VerifyGet`)
- Line numbers or column references
- Variable names, parameter names, or struct/field names
- Code snippets, pseudocode, or regex patterns
- Library or module names that uniquely identify the vulnerable file (e.g., "LibGfx" when there's a single `libgfx/` directory)
- The vulnerability type or class (e.g., "command injection", "XSS", "buffer overflow")
- The mechanism of the bug (e.g., "unsanitized input passed to exec", "missing bounds check")
- The impact (e.g., "arbitrary code execution", "authentication bypass")

### What to KEEP (allow-list)

The hint should point at a broad region of the codebase:
- **Architectural layer**: e.g., "authentication middleware", "REST API request handling", "package installation logic"
- **Subsystem or feature area**: e.g., "user session management", "file upload processing", "backup and restore functionality"
- **General component type**: e.g., "the URL routing layer", "input validation pipeline", "data serialization layer"

### The scope test

Ask yourself: *does this hint narrow the codebase to fewer than ~10-20 source files?* If yes, it's too specific. Broaden it. The hint should cover a general area that contains many files, only some of which are relevant.

### Examples

**Too specific** (maps to one directory/file):
> "The request verification endpoint handler"

**Too specific** (reveals vulnerability type):
> "The authentication bypass in the API middleware"

**Acceptable**:
> "Authentication and authorization middleware"

**Acceptable**:
> "Package installation and setup scripts"

**Acceptable**:
> "REST API endpoint handlers"

**Too vague** (almost useless):
> "The backend code"

The hint should identify a *feature area or architectural layer* — broad enough to contain dozens of files, but specific enough that the agent doesn't have to search the entire codebase.

## Step 8: Write the L2 CVE hint

The L2 hint describes *what* the vulnerability is without revealing *where* it lives. This is a scrubbed version of the advisory description. Unlike benchmarks that score only on exploit generation (where naming the function is fine), any location-revealing detail in our hint undermines the benchmark.

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

## Step 9: Write the L3 targeted hints

L3 is the easiest difficulty level — it should give the agent enough information to narrow down to a small handful of files. Unlike L1 and L2, L3 hints are allowed to be **more specific**. You will write a targeted `area` and a targeted `description` that are tighter than their L1/L2 counterparts.

### L3 `area` (targeted localization)

Start from your L1 `area` and make it more specific. You may include:

- **The specific subsystem, module, or driver name** (e.g., "SQLite database driver" instead of "database driver layer")
- **The specific feature or protocol** (e.g., "SAML authentication middleware" instead of "authentication middleware")
- **A qualifier that distinguishes it from siblings** (e.g., "WebSocket transport handler" instead of "network transport layer")

You may **not** include:
- Exact file paths or file names
- Function or method names
- Line numbers

### The L3 scope test

Ask yourself: *does this hint narrow the codebase to ~3-5 source files?* That is the target. If it still covers 10+ files, it's too broad — add a qualifier. If it maps to a single file, it's too specific — broaden it slightly.

### L3 `description` (targeted CVE description)

Start from your L2 `description` and add **distinguishing context from the advisory**. You may include:

- **The specific technology, backend, or protocol** (e.g., "when the application connects to a SQLite database" or "when processing SAML assertions")
- **The specific input surface** (e.g., "via the table name argument to schema introspection methods")
- **Conditions that narrow the scenario** (e.g., "when running in multi-tenant mode", "when TLS client certificates are used")

You may **not** include:
- File paths, function names, or class names
- Code snippets, variable names, or line numbers

### Examples

**L1 area** (broad):
> "Database driver layer and schema introspection logic"

**L3 area** (targeted):
> "SQLite database driver and its schema introspection logic"

**L2 description** (generic):
> "A SQL injection vulnerability exists where a crafted table name is interpolated directly into SQL query strings used by schema metadata retrieval methods."

**L3 description** (targeted):
> "A SQL injection vulnerability exists where a crafted table name is interpolated directly into SQL query strings used by schema metadata retrieval methods when the application connects to a SQLite database."

## Step 10: Check for duplicates and generate the task ID


**Before creating anything**, check whether a task for this GHSA already exists:

1. Search `benchmark/data/tasks/` for any JSON file containing `"ghsa_id": "{{GHSA_ID}}"`.
2. Also check `benchmark/internal/metadata/` for a file named `{{GHSA_ID}}.json`.

If a task for this GHSA already exists, **STOP — do not create a duplicate task.** Report that this GHSA has already been curated and go to sleep.

If no existing task is found, generate the task ID. Format: `ecvebench-{project}-{NNN}` where:
- `{project}` is the repo name, lowercased, with special characters replaced by hyphens
- `{NNN}` is a zero-padded 3-digit number

Check what task files already exist in `benchmark/data/tasks/` to determine the next available number. If no tasks exist yet for this project, use `001`.

## Step 11: Create the task file

Create `benchmark/data/tasks/{task_id}.json` with this exact structure:

```json
{
  "task_id": "<task_id>",
  "ghsa_id": "<GHSA ID>",
  "codebase": {
    "repo": "https://github.com/<owner>/<repo>",
    "language": "<primary language, lowercase>",
    "ecosystem": "{{ECOSYSTEM}}",
    "commit": "<full 40-char pre-patch SHA>"
  },
  "hints": {
    "L0": null,
    "L1": {
      "area": "<broad codebase area hint from Step 7>"
    },
    "L2": {
      "description": "<scrubbed CVE description from Step 8>"
    },
    "L3": {
      "area": "<targeted area hint from Step 9>",
      "description": "<targeted CVE description from Step 9>"
    }
  },
  "ground_truth": {
    "vulnerable": true,
    "vuln_class": "<the vulnerability class from Step 5 (pre-assigned or corrected)>",
    "cvss": {{CVSS}},
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

## Step 12: Create the metadata file

Create `benchmark/internal/metadata/{GHSA_ID}.json` with this exact structure:

```json
{
  "ghsa_id": "<GHSA ID>",
  "post_patch_commit": "<full 40-char patch commit SHA>",
  "noisy_patch": "<true if >3 non-test files changed, false otherwise>",
  "curation_notes": "<explain how you derived the locations and any ambiguities>",
  "dataset_version": "0.1.0",
  "snapshot_date": "{{SNAPSHOT_DATE}}"
}
```

## Step 13: Open a PR

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
- [ ] The L1 hint `area` field contains NO file paths, function names, vulnerability types, or mechanism details
- [ ] The L2 hint `description` field contains NO file paths, function names, line numbers, or code snippets
- [ ] The L3 `area` is more specific than L1 — names the subsystem/module/driver but NOT exact file paths or function names
- [ ] The L3 `description` is more specific than L2 — includes distinguishing context from the advisory but NOT file paths, function names, or code snippets
- [ ] The L3 hint narrows the search to ~3-5 source files (not 1, not 10+)
- [ ] The `vuln_class` is one of the 13 valid classes (matches Step 5 decision — pre-assigned or corrected with justification in `curation_notes`)
- [ ] The `cvss` is `{{CVSS}}` (the pre-computed value)
- [ ] The `locations` array has at least one entry
- [ ] The `file` paths in locations are relative from the repo root and exist in the pre-patch commit
- [ ] The JSON is valid and pretty-printed with 2-space indentation

## Step 14: Sleep

Once you have opened the PR and verified the quality checks above, you are done. **Go to sleep immediately.** Do not continue working, do not start another task, and do not wait for a review. Your session is complete.
