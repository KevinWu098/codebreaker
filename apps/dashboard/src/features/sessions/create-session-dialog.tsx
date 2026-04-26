import {
  DEFAULT_MODEL_IDS,
  MODEL_OPTIONS_BY_PROVIDER,
} from "@codebreaker/shared/lib/models";
import {
  ExtensionPolicySchema,
  ModelProviderSchema,
} from "@codebreaker/shared/schemas/primitives";
import { SandboxProfileNameSchema } from "@codebreaker/shared/schemas/sandbox";
import {
  defaultCompactionConfig,
  defaultSessionRuntimeConfig,
  type ModelConfig,
  type SessionConfig,
} from "@codebreaker/shared/schemas/session";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Close as DialogClose,
  Content as DialogContent,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/button";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { useCreateSessionMutation } from "@/hooks/mutations";

interface CreateSessionDialogProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const ProfileChoiceSchema = z.union([
  SandboxProfileNameSchema,
  z.literal("none"),
]);

const FormSchema = z
  .object({
    extensionPolicy: ExtensionPolicySchema,
    maxSteps: z.number().int().positive(),
    maxTurns: z.number().int().positive(),
    modelId: z.string().min(1, "model is required"),
    profile: ProfileChoiceSchema,
    provider: ModelProviderSchema,
    systemPrompt: z.string(),
    title: z.string(),
  })
  .superRefine((values, context) => {
    const modelIsDefined = MODEL_OPTIONS_BY_PROVIDER[values.provider].some(
      (option) => option.id === values.modelId
    );

    if (!modelIsDefined) {
      context.addIssue({
        code: "custom",
        message: "select a documented model for this provider",
        path: ["modelId"],
      });
    }
  });

type FormValues = z.infer<typeof FormSchema>;

const PROVIDERS = ModelProviderSchema.options;
const POLICIES = ExtensionPolicySchema.options;
const PROFILES = ["none", ...SandboxProfileNameSchema.options] as const;
const DEFAULT_VALUES: FormValues = {
  extensionPolicy: "sandbox",
  maxSteps: defaultSessionRuntimeConfig.maxSteps,
  maxTurns: defaultSessionRuntimeConfig.maxTurns,
  modelId: DEFAULT_MODEL_IDS.openai,
  profile: "python",
  provider: "openai",
  systemPrompt: "",
  title: "",
};

const buildSessionConfig = (values: FormValues): SessionConfig => ({
  budgets: {
    maxInputTokens: defaultSessionRuntimeConfig.maxInputTokens,
    maxOutputTokens: defaultSessionRuntimeConfig.maxOutputTokens,
    maxToolCalls: defaultSessionRuntimeConfig.maxToolCalls,
    maxTotalTokens: defaultSessionRuntimeConfig.maxTotalTokens,
  },
  compaction: defaultCompactionConfig,
  extensionPolicy: values.extensionPolicy,
  maxSteps: values.maxSteps,
  maxTurns: values.maxTurns,
  model: { id: values.modelId.trim(), provider: values.provider },
  timeoutSeconds: defaultSessionRuntimeConfig.timeoutSeconds,
  ...(values.title.trim() ? { title: values.title.trim() } : {}),
  ...(values.systemPrompt.trim()
    ? { systemPrompt: values.systemPrompt.trim() }
    : {}),
  ...(values.profile === "none"
    ? {}
    : {
        sandbox: {
          profile: values.profile,
          provider: "modal" as const,
        },
      }),
});

export const CreateSessionDialog = ({
  onClose,
  onCreated,
}: CreateSessionDialogProps): React.JSX.Element => {
  const titleId = useId();
  const providerId = useId();
  const modelId = useId();
  const policyId = useId();
  const profileId = useId();
  const turnsId = useId();
  const stepsId = useId();
  const promptId = useId();

  const mutation = useCreateSessionMutation();

  const {
    formState: { errors },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<FormValues>({
    defaultValues: DEFAULT_VALUES,
    resolver: zodResolver(FormSchema),
  });

  const provider = watch("provider");
  const providerModels = MODEL_OPTIONS_BY_PROVIDER[provider];

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(
      { config: buildSessionConfig(values) },
      {
        onSuccess: (response) => {
          onCreated(response.session.id);
        },
      }
    );
  });

  return (
    <DialogRoot
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-sm" />
        <DialogContent
          className="card fixed top-1/2 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <header className="card-header">
            <DialogTitle className="lowercase">create session</DialogTitle>
            <DialogClose asChild>
              <button
                aria-label="close"
                className="btn btn-icon"
                title="close"
                type="button"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </DialogClose>
          </header>

          <form className="space-y-3 p-3" onSubmit={onSubmit}>
            <ErrorState error={mutation.error} title="create failed" />

            <FormField
              error={errors.title?.message}
              id={titleId}
              label="title (optional)"
            >
              <input
                className="input"
                id={titleId}
                placeholder="weekend exfil hunt"
                {...register("title")}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                error={errors.provider?.message}
                id={providerId}
                label="provider"
              >
                <select
                  className="input"
                  id={providerId}
                  {...register("provider", {
                    onChange: (event) => {
                      const next = event.target
                        .value as ModelConfig["provider"];
                      const nextModel =
                        MODEL_OPTIONS_BY_PROVIDER[next][0]?.id ??
                        DEFAULT_MODEL_IDS[next];

                      setValue("modelId", nextModel, { shouldDirty: true });
                    },
                  })}
                >
                  {PROVIDERS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                error={errors.modelId?.message}
                id={modelId}
                label="model id"
              >
                <select
                  className="input font-mono"
                  id={modelId}
                  key={provider}
                  {...register("modelId")}
                >
                  {providerModels.map((option) => (
                    <option
                      key={option.id}
                      title={`Documented at ${option.documentationUrl}`}
                      value={option.id}
                    >
                      {option.label} ({option.id})
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                error={errors.extensionPolicy?.message}
                id={policyId}
                label="extension policy"
              >
                <select
                  className="input"
                  id={policyId}
                  {...register("extensionPolicy")}
                >
                  {POLICIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                error={errors.profile?.message}
                id={profileId}
                label="sandbox profile"
              >
                <select
                  className="input"
                  id={profileId}
                  {...register("profile")}
                >
                  {PROFILES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                error={errors.maxTurns?.message}
                id={turnsId}
                label="max turns"
              >
                <input
                  className="input tabular-nums"
                  id={turnsId}
                  min={1}
                  type="number"
                  {...register("maxTurns", { valueAsNumber: true })}
                />
              </FormField>

              <FormField
                error={errors.maxSteps?.message}
                id={stepsId}
                label="max steps / turn"
              >
                <input
                  className="input tabular-nums"
                  id={stepsId}
                  min={1}
                  type="number"
                  {...register("maxSteps", { valueAsNumber: true })}
                />
              </FormField>
            </div>

            <FormField
              error={errors.systemPrompt?.message}
              id={promptId}
              label="system prompt (optional)"
            >
              <textarea
                className="input"
                id={promptId}
                rows={4}
                {...register("systemPrompt")}
              />
            </FormField>

            <footer className="-mx-3 mt-2 -mb-3 flex items-center justify-end gap-2 border-border border-t px-3 py-2">
              <DialogClose asChild>
                <Button variant="ghost">cancel</Button>
              </DialogClose>
              <Button
                disabled={mutation.isPending}
                type="submit"
                variant="primary"
              >
                {mutation.isPending ? "creating…" : "create"}
              </Button>
            </footer>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};
