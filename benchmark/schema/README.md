# JSON Schemas

Formal [JSON Schema (draft-07)](http://json-schema.org/draft-07/schema#) definitions for all ECVEBench data formats. These schemas are the machine-readable contracts that all task files, agent inputs, and agent outputs must conform to.

## Schemas

| Schema | Title | Description |
| --- | --- | --- |
| [`task.schema.json`](task.schema.json) | TaskInstance | Canonical record for one GHSA. Contains codebase pointer, hints at all four difficulty levels, and ground truth (vulnerability class, locations, CVSS). One file per unique vulnerability. |
| [`agent_input.schema.json`](agent_input.schema.json) | AgentInput | Runtime projection of a task at a specific difficulty. Produced by the harness and fed to the agent. Contains exactly one hint and no ground truth. |
| [`output.schema.json`](output.schema.json) | AgentOutput | The format agents must return: verdict, confidence, vulnerability class, locations, and reasoning. Consumed by the scorer. |
| [`metadata.schema.json`](metadata.schema.json) | InternalMetadata | Internal curation data not exposed to agents: post-patch commit SHA, curation notes, dataset version. Used for negative validation and auditing. |

## Usage

These schemas can be used for validation with any JSON Schema–compatible tool:

```bash
# Example with ajv-cli
npx ajv validate -s schema/task.schema.json -d data/tasks/ecvebench-filebrowser-001.json
```

```python
# Example with jsonschema (Python)
import json
from jsonschema import validate

with open("schema/task.schema.json") as f:
    schema = json.load(f)
with open("data/tasks/ecvebench-filebrowser-001.json") as f:
    task = json.load(f)
validate(instance=task, schema=schema)
```

## Field Reference

For a human-readable field-level reference, see [`docs/task-format.md`](../docs/task-format.md).
