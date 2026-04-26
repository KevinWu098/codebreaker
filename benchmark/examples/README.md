# Examples

Pre-generated examples showing a complete task record and the agent inputs produced at each difficulty level. These files use the `ecvebench-filebrowser-001` task ([GHSA-5gg9-5g7w-hm73](https://github.com/advisories/GHSA-5gg9-5g7w-hm73)) as a reference.

## Files

| File | Description |
| --- | --- |
| [`ecvebench-filebrowser-001.task.json`](ecvebench-filebrowser-001.task.json) | Full task record including all hints and ground truth. This is what lives in `data/tasks/`. |
| [`ecvebench-filebrowser-001-L0.input.json`](ecvebench-filebrowser-001-L0.input.json) | Agent input at L0 (pure discovery). Hint is `null`. |
| [`ecvebench-filebrowser-001-L1.input.json`](ecvebench-filebrowser-001-L1.input.json) | Agent input at L1 (localization hint only). Contains a vague `area` string. |
| [`ecvebench-filebrowser-001-L2.input.json`](ecvebench-filebrowser-001-L2.input.json) | Agent input at L2 (CVE description only). Contains a scrubbed `description` string. |
| [`ecvebench-filebrowser-001-L3.input.json`](ecvebench-filebrowser-001-L3.input.json) | Agent input at L3 (both hints). Contains both `area` and `description`. |

## How They Relate

The **task file** is the canonical record stored in the dataset. The **input files** are what the harness generates at runtime — one per difficulty level. Notice how each input:

- Includes the same `task_id` and `codebase` as the task
- Contains only the hint for its difficulty level (not all four)
- Contains no ground truth (no `ghsa_id`, `ground_truth`, or other hints)

## Regenerating

You can regenerate these inputs from the task file using the harness:

```bash
cd benchmark

for level in L0 L1 L2 L3; do
  uv run python -m harness.generate_input \
    --task-id ecvebench-filebrowser-001 \
    --difficulty $level \
    > examples/ecvebench-filebrowser-001-${level}.input.json
done
```
