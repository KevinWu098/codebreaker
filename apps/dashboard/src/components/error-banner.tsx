import { ApiClientError } from "../lib/api";

interface Props {
  error: Error | undefined;
  title?: string;
}

export const ErrorBanner = ({
  error,
  title,
}: Props): React.JSX.Element | null => {
  if (!error) {
    return null;
  }

  const code = error instanceof ApiClientError ? error.code : "error";
  const status = error instanceof ApiClientError ? ` ${error.status}` : "";

  return (
    <div className="banner banner-error">
      <strong>
        {title ?? "Error"}
        {status}
      </strong>
      <span className="dim mono"> · {code}</span>
      <div className="mono text-xs" style={{ marginTop: 4 }}>
        {error.message}
      </div>
    </div>
  );
};
