import type { ExtensionPolicy } from "@codebreaker/shared/schemas/primitives";
import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";
import type {
  ModelConfig,
  SessionConfig,
} from "@codebreaker/shared/schemas/session";
import { useState } from "react";
import { ErrorBanner } from "../../components/error-banner";
import { api } from "../../lib/api";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const PROVIDERS: ModelConfig["provider"][] = ["openai", "anthropic"];
const DEFAULT_MODELS: Record<ModelConfig["provider"], string> = {
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-5-codex",
};
const POLICIES: ExtensionPolicy[] = [
  "readonly",
  "workspace",
  "local",
  "network",
  "sandbox",
  "unrestricted",
];
const PROFILES: (SandboxProfileName | "none")[] = [
  "none",
  "python",
  "node",
  "recon",
];

export const CreateSessionDialog = ({
  onClose,
  onCreated,
}: Props): React.JSX.Element => {
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<ModelConfig["provider"]>("openai");
  const [modelId, setModelId] = useState(DEFAULT_MODELS.openai);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [policy, setPolicy] = useState<ExtensionPolicy>("readonly");
  const [profile, setProfile] = useState<(typeof PROFILES)[number]>("none");
  const [maxTurns, setMaxTurns] = useState(25);
  const [maxSteps, setMaxSteps] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

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
        model: { id: modelId, provider },
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
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      role="presentation"
    >
      <div aria-modal="true" className="modal" role="dialog">
        <h3>Create session</h3>

        <ErrorBanner error={error} title="Create failed" />

        <div className="form-row">
          <label htmlFor="cs-title">Title (optional)</label>
          <input
            id="cs-title"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </div>

        <div className="row-grid">
          <div className="form-row">
            <label htmlFor="cs-provider">Provider</label>
            <select
              id="cs-provider"
              onChange={(event) => {
                const next = event.target.value as ModelConfig["provider"];
                setProvider(next);
                setModelId(DEFAULT_MODELS[next]);
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

          <div className="form-row">
            <label htmlFor="cs-model">Model ID</label>
            <input
              id="cs-model"
              onChange={(event) => setModelId(event.target.value)}
              value={modelId}
            />
          </div>
        </div>

        <div className="row-grid">
          <div className="form-row">
            <label htmlFor="cs-policy">Extension policy</label>
            <select
              id="cs-policy"
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

          <div className="form-row">
            <label htmlFor="cs-profile">Sandbox profile</label>
            <select
              id="cs-profile"
              onChange={(event) =>
                setProfile(event.target.value as (typeof PROFILES)[number])
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

        <div className="row-grid">
          <div className="form-row">
            <label htmlFor="cs-turns">Max turns</label>
            <input
              id="cs-turns"
              min={1}
              onChange={(event) => setMaxTurns(Number(event.target.value))}
              type="number"
              value={maxTurns}
            />
          </div>

          <div className="form-row">
            <label htmlFor="cs-steps">Max steps per turn</label>
            <input
              id="cs-steps"
              min={1}
              onChange={(event) => setMaxSteps(Number(event.target.value))}
              type="number"
              value={maxSteps}
            />
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="cs-prompt">System prompt (optional)</label>
          <textarea
            id="cs-prompt"
            onChange={(event) => setSystemPrompt(event.target.value)}
            rows={4}
            value={systemPrompt}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={submitting || !modelId}
            onClick={submit}
            type="button"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};
