import certificates002Task from "../../../../benchmark/data/tasks/ecvebench-certificates-002.json" with {
  type: "json",
};
import deno002Task from "../../../../benchmark/data/tasks/ecvebench-deno-002.json" with {
  type: "json",
};
import filebrowserTask from "../../../../benchmark/data/tasks/ecvebench-filebrowser-001.json" with {
  type: "json",
};
import fuxa002Task from "../../../../benchmark/data/tasks/ecvebench-fuxa-002.json" with {
  type: "json",
};
import juju002Task from "../../../../benchmark/data/tasks/ecvebench-juju-002.json" with {
  type: "json",
};
import onefuzz002Task from "../../../../benchmark/data/tasks/ecvebench-onefuzz-002.json" with {
  type: "json",
};
import openclaw003Task from "../../../../benchmark/data/tasks/ecvebench-openclaw-003.json" with {
  type: "json",
};
import openvpn002Task from "../../../../benchmark/data/tasks/ecvebench-openvpn-auth-oauth2-002.json" with {
  type: "json",
};
import xwikiPlatform002Task from "../../../../benchmark/data/tasks/ecvebench-xwiki-platform-002.json" with {
  type: "json",
};
import xwikiPlatform003Task from "../../../../benchmark/data/tasks/ecvebench-xwiki-platform-003.json" with {
  type: "json",
};
import xwikiPlatform004Task from "../../../../benchmark/data/tasks/ecvebench-xwiki-platform-004.json" with {
  type: "json",
};
import meta5gg9 from "../../../../benchmark/internal/metadata/GHSA-5gg9-5g7w-hm73.json" with {
  type: "json",
};
import meta36fm from "../../../../benchmark/internal/metadata/GHSA-36fm-j33w-c25f.json" with {
  type: "json",
};
import meta246w from "../../../../benchmark/internal/metadata/GHSA-246w-jgmq-88fg.json" with {
  type: "json",
};
import meta838h from "../../../../benchmark/internal/metadata/GHSA-838h-jqp6-cf2f.json" with {
  type: "json",
};
import metaH8cp from "../../../../benchmark/internal/metadata/GHSA-h8cp-697h-8c8p.json" with {
  type: "json",
};
import metaQ5vh from "../../../../benchmark/internal/metadata/GHSA-q5vh-6whw-x745.json" with {
  type: "json",
};
import metaQcj3 from "../../../../benchmark/internal/metadata/GHSA-qcj3-wpgm-qpxh.json" with {
  type: "json",
};
import metaRqpp from "../../../../benchmark/internal/metadata/GHSA-rqpp-rjj8-7wv8.json" with {
  type: "json",
};
import metaVwcg from "../../../../benchmark/internal/metadata/GHSA-vwcg-c828-9822.json" with {
  type: "json",
};
import metaW5fq from "../../../../benchmark/internal/metadata/GHSA-w5fq-8965-c969.json" with {
  type: "json",
};

export const benchmarkDatasetFixtures = {
  metadata: [
    meta246w,
    meta36fm,
    meta5gg9,
    meta838h,
    metaH8cp,
    metaQ5vh,
    metaQcj3,
    metaRqpp,
    metaVwcg,
    metaW5fq,
  ],
  tasks: [
    certificates002Task,
    deno002Task,
    filebrowserTask,
    fuxa002Task,
    juju002Task,
    onefuzz002Task,
    openclaw003Task,
    openvpn002Task,
    xwikiPlatform002Task,
    xwikiPlatform003Task,
    xwikiPlatform004Task,
  ],
} as const;
