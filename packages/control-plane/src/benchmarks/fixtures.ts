import denoTask from "../../../../benchmark/data/tasks/ecvebench-deno-001.json" with {
  type: "json",
};
import electermTask from "../../../../benchmark/data/tasks/ecvebench-electerm-001.json" with {
  type: "json",
};
import jujuTask from "../../../../benchmark/data/tasks/ecvebench-juju-001.json" with {
  type: "json",
};
import xwikiPlatformTask from "../../../../benchmark/data/tasks/ecvebench-xwiki-platform-001.json" with {
  type: "json",
};
import electermMetadata from "../../../../benchmark/internal/metadata/GHSA-8x35-hph8-37hq.json" with {
  type: "json",
};
import xwikiPlatformMetadata from "../../../../benchmark/internal/metadata/GHSA-36fm-j33w-c25f.json" with {
  type: "json",
};
import denoMetadata from "../../../../benchmark/internal/metadata/GHSA-838h-jqp6-cf2f.json" with {
  type: "json",
};
import jujuMetadata from "../../../../benchmark/internal/metadata/GHSA-w5fq-8965-c969.json" with {
  type: "json",
};

export const benchmarkDatasetFixtures = {
  metadata: [
    denoMetadata,
    electermMetadata,
    jujuMetadata,
    xwikiPlatformMetadata,
  ],
  tasks: [denoTask, electermTask, jujuTask, xwikiPlatformTask],
} as const;
