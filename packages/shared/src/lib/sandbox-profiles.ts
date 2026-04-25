import {
  type SandboxProfile,
  type SandboxProfileName,
  SandboxProfileNameSchema,
  SandboxProfileSchema,
} from "@codebreaker/shared/schemas/sandbox";
import { z } from "zod";

export const SandboxProfileRegistrySchema = z.record(
  SandboxProfileNameSchema,
  SandboxProfileSchema
);
export type SandboxProfileRegistry = z.infer<
  typeof SandboxProfileRegistrySchema
>;

export const sandboxProfiles = {
  node: {
    cpu: 1,
    encryptedPorts: [],
    env: {},
    image: "debian_slim",
    installCommands: [
      "apt-get update",
      "apt-get install -y nodejs npm git ca-certificates",
    ],
    memoryMb: 1024,
    name: "node",
    provider: "modal",
    timeoutSeconds: 300,
    workdir: "/workspace",
  },
  python: {
    cpu: 1,
    encryptedPorts: [],
    env: {},
    image: "debian_slim",
    installCommands: [
      "apt-get update",
      "apt-get install -y python3 python3-pip git ca-certificates",
    ],
    memoryMb: 1024,
    name: "python",
    provider: "modal",
    timeoutSeconds: 300,
    workdir: "/workspace",
  },
  recon: {
    cpu: 2,
    encryptedPorts: [],
    env: {},
    image: "debian_slim",
    installCommands: [
      "apt-get update",
      "apt-get install -y curl dnsutils iproute2 nmap python3 python3-pip whois",
    ],
    memoryMb: 2048,
    name: "recon",
    provider: "modal",
    timeoutSeconds: 600,
    workdir: "/workspace",
  },
} as const satisfies SandboxProfileRegistry;

export const resolveSandboxProfile = (
  name: SandboxProfileName
): SandboxProfile => SandboxProfileSchema.parse(sandboxProfiles[name]);
