import type { ExtensionPolicy } from "@codebreaker/shared/schemas/primitives";
import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";
import type {
  ModelConfig,
  SessionConfig,
} from "@codebreaker/shared/schemas/session";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { ErrorState } from "@/components/error-state";
import { api } from "@/lib/api";

interface CreateSessionDialogProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const PROVIDERS: readonly ModelConfig["provider"][] = ["openai", "anthropic"];
const DEFAULT_MODELS: Record<ModelConfig["provider"], string> = {
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-5-codex",
};
const POLICIES: readonly ExtensionPolicy[] = [
  "readonly",
  "workspace",
  "local",
  "network",
  "sandbox",
  "unrestricted",
];
type ProfileChoice = SandboxProfileName | "none";
const PROFILES: readonly ProfileChoice[] = ["none", "python", "node", "recon"];

export const CreateSessionDialog = ({
  onClose,
  onCreated,
}: CreateSessionDialogProps): React.JSX.Element => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const providerId = useId();
  const modelId = useId();
  const policyId = useId();
  const profileId = useId();
  const turnsId = useId();
  const stepsId = useId();
  const promptId = useId();

  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<ModelConfig["provider"]>("openai");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [policy, setPolicy] = useState<ExtensionPolicy>("readonly");
  const [profile, setProfile] = useState<ProfileChoice>("none");
  const [maxTurns, setMaxTurns] = useState(25);
  const [maxSteps, setMaxSteps] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    dialogRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(undefined);

    try {
      const config: SessionConfig = {
        compaction: {
          enabled: true,
          maxContextTokens: 128_000,
          preserveRecentMessages: 12,
          summarizeAtTokens: 96_000,
        },
        extensionPolicy: policy,
        maxSteps,
        maxTurns,
        model: { id: model, provider },
        timeoutSeconds: 3600,
        ...(title ? { title } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(profile === "none"
          ? {}
          : { sandbox: { profile, provider: "modal" as const } }),
      };

      const result = await api.createSession({ config });
      onCreated(result.session.id);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-bg/80 px-4 py-12 backdrop-blur-sm"
      role="presentation"
    >
      <button
        aria-label="close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="card relative z-10 w-full max-w-xl"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="card-header">
          <span className="lowercase" id={titleId}>
            create session
          </span>
          <button
            aria-label="close"
            className="btn btn-icon"
            onClick={onClose}
            title="close"
            type="button"
          >
            <X aria-hidden="true" size={12} />
          </button>
        </header>

        <div className="space-y-3 p-3">
          <ErrorState error={error} title="create failed" />

          <div className="space-y-1">
            <label className="field-label" htmlFor={`${titleId}-input`}>
              title (optional)
            </label>
            <input
              className="input"
              id={`${titleId}-input`}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="weekend exfil hunt"
              value={title}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="field-label" htmlFor={providerId}>
                provider
              </label>
              <select
                className="input"
                id={providerId}
                onChange={(event) => {
                  const next = event.target.value as ModelConfig["provider"];
                  setProvider(next);
                  setModel(DEFAULT_MODELS[next]);
                }}
                value={provider}
              >
                {PROVIDERS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="field-label" htmlFor={modelId}>
                model id
              </label>
              <input
                className="input font-mono"
                id={modelId}
                onChange={(event) => setModel(event.target.value)}
                value={model}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="field-label" htmlFor={policyId}>
                extension policy
              </label>
              <select
                className="input"
                id={policyId}
                onChange={(event) =>
                  setPolicy(event.target.value as ExtensionPolicy)
                }
                value={policy}
              >
                {POLICIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="field-label" htmlFor={profileId}>
                sandbox profile
              </label>
              <select
                className="input"
                id={profileId}
                onChange={(event) =>
                  setProfile(event.target.value as ProfileChoice)
                }
                value={profile}
              >
                {PROFILES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="field-label" htmlFor={turnsId}>
                max turns
              </label>
              <input
                className="input tabular-nums"
                id={turnsId}
                min={1}
                onChange={(event) => setMaxTurns(Number(event.target.value))}
                type="number"
                value={maxTurns}
              />
            </div>

            <div className="space-y-1">
              <label className="field-label" htmlFor={stepsId}>
                max steps / turn
              </label>
              <input
                className="input tabular-nums"
                id={stepsId}
                min={1}
                onChange={(event) => setMaxSteps(Number(event.target.value))}
                type="number"
                value={maxSteps}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="field-label" htmlFor={promptId}>
              system prompt (optional)
            </label>
            <textarea
              className="input"
              id={promptId}
              onChange={(event) => setSystemPrompt(event.target.value)}
              rows={4}
              value={systemPrompt}
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-border border-t px-3 py-2">
          <Button onClick={onClose} variant="ghost">
            cancel
          </Button>
          <Button
            disabled={submitting || !model}
            onClick={submit}
            variant="primary"
          >
            {submitting ? "creating…" : "create"}
          </Button>
        </footer>
      </div>
    </div>
  );
};
