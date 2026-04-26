import type { ShardKind } from "@codebreaker/shared/schemas/audits";

export interface ShardDefinition {
  description: string;
  /** Hot-spot directory hints; the investigator can search outside these. */
  hotspots: string[];
  /** Compact bullet list of vulnerability classes the investigator should hunt. */
  hunt: string[];
  kind: ShardKind;
  /** Vuln class hints relevant to this shard (must match AuditVulnClass). */
  primaryVulnClasses: string[];
}

export const SHARD_DEFINITIONS: Record<ShardKind, ShardDefinition> = {
  auth: {
    description:
      "Authentication, session management, authorization checks, JWT/cookie handling, role-based access.",
    hunt: [
      "Authentication bypass (missing or skippable verification)",
      "Authorization bypass (missing role/permission checks on protected endpoints)",
      "Session fixation, weak session ids, missing logout invalidation",
      "JWT signature verification skipped or weakened",
      "Privilege escalation through user-controlled role/identity fields",
    ],
    hotspots: [
      "auth",
      "login",
      "session",
      "middleware",
      "guards",
      "permissions",
    ],
    kind: "auth",
    primaryVulnClasses: ["auth-bypass", "csrf"],
  },
  parsing: {
    description:
      "Untrusted input parsing: HTTP request bodies, query strings, file formats, headers, URL parsing.",
    hunt: [
      "XXE in XML parsers configured to resolve external entities",
      "Insecure URL/path parsing leading to open redirects or SSRF",
      "Prototype pollution from merge/clone of untrusted JSON",
      "Regex denial of service in user-controlled patterns",
      "Header injection / log injection via unsanitized headers",
    ],
    hotspots: [
      "parser",
      "router",
      "middleware",
      "request",
      "form",
      "json",
      "xml",
    ],
    kind: "parsing",
    primaryVulnClasses: [
      "xxe",
      "regex-dos",
      "open-redirect",
      "prototype-pollution",
      "log-injection",
    ],
  },
  sql: {
    description:
      "Database access layer: query construction, ORMs, raw SQL, NoSQL injection.",
    hunt: [
      "String concatenation/interpolation into SQL queries",
      "Unsafe ORM raw query usage with user input",
      "Improper escaping in dynamic identifiers (table/column names)",
      "Missing parameterization in stored-procedure calls",
    ],
    hotspots: ["db", "models", "queries", "repository", "dao", "sql"],
    kind: "sql",
    primaryVulnClasses: ["sql-injection"],
  },
  deserialization: {
    description:
      "Serialization formats that can execute code on parse: pickle, YAML.unsafe_load, Java native, PHP unserialize, .NET BinaryFormatter, Marshal.",
    hunt: [
      "Unsafe deserialization of user-controlled bytes",
      "YAML loaders allowing object construction",
      "Pickle/Marshal deserialization of untrusted input",
      "Custom __reduce__ / __setstate__ gadget chains in scope",
    ],
    hotspots: [
      "serializ",
      "deserializ",
      "pickle",
      "marshal",
      "yaml",
      "msgpack",
    ],
    kind: "deserialization",
    primaryVulnClasses: ["insecure-deserialization"],
  },
  crypto: {
    description:
      "Cryptography primitives, key management, hashing, signing, randomness.",
    hunt: [
      "MD5/SHA1 used for security-sensitive hashing",
      "Hard-coded keys / secrets / IVs",
      "ECB mode block ciphers, deterministic IVs in CBC",
      "Math.random() / non-CSPRNG used for tokens",
      "Missing constant-time comparison on secrets",
    ],
    hotspots: ["crypto", "hash", "sign", "token", "jwt", "key", "secret"],
    kind: "crypto",
    primaryVulnClasses: ["crypto-weakness", "secret-exposure"],
  },
  exec: {
    description:
      "Process execution / shelling out: exec, spawn, system, eval, dynamic require/import.",
    hunt: [
      "Command injection from string concatenation into shell commands",
      "child_process.exec with untrusted args",
      "Dynamic eval/require with user-controlled paths or code",
      "Template engines used in unsafe modes (e.g. Jinja autoescape off)",
    ],
    hotspots: ["exec", "spawn", "shell", "subprocess", "system", "eval"],
    kind: "exec",
    primaryVulnClasses: ["command-injection"],
  },
  network: {
    description: "Outbound HTTP/network calls, proxy, webhook, RPC clients.",
    hunt: [
      "TLS verification disabled (rejectUnauthorized=false, verify=False)",
      "User-controlled URL passed to outbound fetch (SSRF)",
      "Missing redirect/host allowlist on outbound clients",
      "Webhook signature verification bypass",
    ],
    hotspots: ["http", "fetch", "request", "webhook", "client", "axios"],
    kind: "network",
    primaryVulnClasses: ["ssrf"],
  },
  fs: {
    description:
      "Filesystem access: file reads/writes, archive extraction, uploads, temp files.",
    hunt: [
      "Path traversal in user-controlled file paths (../)",
      "Zip slip / tar slip during archive extraction",
      "Symlink traversal on extraction or copy",
      "Insecure tempfile creation (predictable names, race conditions)",
    ],
    hotspots: ["upload", "download", "archive", "tar", "zip", "fs", "file"],
    kind: "fs",
    primaryVulnClasses: ["path-traversal"],
  },
  ssrf: {
    description:
      "Server-side request forgery surfaces — URL/host validation around fetchers.",
    hunt: [
      "User-controlled host/URL passed to internal/external fetcher without allowlist",
      "DNS rebinding due to single-resolution validation",
      "Missing IP-range filtering for cloud metadata (169.254.169.254, fd00::, link-local)",
    ],
    hotspots: ["proxy", "fetch", "url", "host", "redirect"],
    kind: "ssrf",
    primaryVulnClasses: ["ssrf"],
  },
  ipc: {
    description:
      "Inter-process communication / RPC / message brokers / WebSocket handlers.",
    hunt: [
      "Unauthenticated RPC endpoints",
      "Trusting message origin without verification",
      "WebSocket origin checks missing or weak",
      "Race conditions in async message handlers",
    ],
    hotspots: ["ipc", "rpc", "socket", "broker", "queue"],
    kind: "ipc",
    primaryVulnClasses: ["auth-bypass", "race-condition"],
  },
  frontend: {
    description:
      "Client-rendered or server-rendered templating: HTML output, DOM, template engines.",
    hunt: [
      "Reflected/stored XSS via unescaped user input in templates",
      "DOM-based XSS in innerHTML / dangerouslySetInnerHTML",
      "Open redirects via user-controlled href/location",
      "CSP bypasses or missing nonce verification",
    ],
    hotspots: ["templates", "views", "components", "render", "html"],
    kind: "frontend",
    primaryVulnClasses: ["xss", "open-redirect"],
  },
  secrets: {
    description:
      "Hard-coded credentials, leaked secrets, sensitive data in logs/errors.",
    hunt: [
      "Hard-coded API keys, passwords, private keys in source",
      "Secrets logged or returned in error responses",
      "Sensitive data sent to third-party telemetry without redaction",
    ],
    hotspots: ["config", "env", "secret", "credential", "log"],
    kind: "secrets",
    primaryVulnClasses: ["secret-exposure"],
  },
  concurrency: {
    description: "Shared mutable state, locks, atomics, async race conditions.",
    hunt: [
      "TOCTOU between auth/permission checks and the protected operation",
      "Shared in-memory caches mutated without locks across requests",
      "Async event handlers racing on critical state",
    ],
    hotspots: ["lock", "mutex", "async", "queue", "cache"],
    kind: "concurrency",
    primaryVulnClasses: ["race-condition"],
  },
  memory: {
    description:
      "Memory safety in native code: C/C++/Rust unsafe / Go cgo / FFI.",
    hunt: [
      "Buffer overflows from missing bounds checks",
      "Use-after-free in manual allocation paths",
      "Integer overflow before allocation/copy",
      "Null-pointer dereference on error paths",
    ],
    hotspots: ["unsafe", "cgo", "ffi", "raw"],
    kind: "memory",
    primaryVulnClasses: [
      "buffer-overflow",
      "use-after-free",
      "integer-overflow",
      "null-deref",
    ],
  },
  other: {
    description:
      "Catch-all for vulnerabilities that don't cleanly fit a specific shard.",
    hunt: [
      "Logic errors with security impact",
      "Business-logic bypasses",
      "Unintended side effects across modules",
    ],
    hotspots: [],
    kind: "other",
    primaryVulnClasses: ["other"],
  },
};

export const DEFAULT_AUDIT_SHARDS: ShardKind[] = [
  "auth",
  "parsing",
  "sql",
  "deserialization",
  "crypto",
  "exec",
  "network",
  "fs",
  "frontend",
  "secrets",
];

export const shardDefinition = (kind: ShardKind): ShardDefinition =>
  SHARD_DEFINITIONS[kind];
