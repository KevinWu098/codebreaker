import {
  type SandboxProfile,
  type SandboxProfileName,
  SandboxProfileNameSchema,
  SandboxProfileSchema,
} from "@codebreaker/shared/schemas/sandbox";
import { z } from "zod";
import profileData from "../data/sandbox-profiles.json" with { type: "json" };

export const SandboxProfileRegistrySchema = z.record(
  SandboxProfileNameSchema,
  SandboxProfileSchema
);
export type SandboxProfileRegistry = z.infer<
  typeof SandboxProfileRegistrySchema
>;

export const sandboxProfiles = SandboxProfileRegistrySchema.parse(profileData);

export const resolveSandboxProfile = (
  name: SandboxProfileName
): SandboxProfile => SandboxProfileSchema.parse(sandboxProfiles[name]);
