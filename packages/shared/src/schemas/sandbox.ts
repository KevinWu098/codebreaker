import { z } from "zod";

export const SandboxProviderSchema = z.enum(["modal"]);
export type SandboxProvider = z.infer<typeof SandboxProviderSchema>;

export const SandboxProfileNameSchema = z.enum([
  "python",
  "node",
  "recon",
  "java",
  "java_stack",
  "go",
  "rust",
  "ruby",
  "fullstack",
]);
export type SandboxProfileName = z.infer<typeof SandboxProfileNameSchema>;

export const SandboxProfileSchema = z.object({
  cpu: z.number().positive(),
  encryptedPorts: z.array(z.number().int().positive()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  idleTimeoutSeconds: z.number().int().positive().optional(),
  image: z.string().min(1),
  installCommands: z.array(z.string().min(1)).default([]),
  memoryMb: z.number().int().positive(),
  name: SandboxProfileNameSchema,
  provider: SandboxProviderSchema,
  timeoutSeconds: z.number().int().positive(),
  workdir: z.string().min(1),
});
export type SandboxProfile = z.infer<typeof SandboxProfileSchema>;

export const ExecResultSchema = z.object({
  command: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int(),
  stderr: z.string(),
  stderrTruncated: z.boolean().default(false),
  stdout: z.string(),
  stdoutTruncated: z.boolean().default(false),
  timedOut: z.boolean().default(false),
});
export type ExecResult = z.infer<typeof ExecResultSchema>;
