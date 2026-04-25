import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";

interface Props {
  status: SessionStatus | string;
}

export const StatusBadge = ({ status }: Props): React.JSX.Element => (
  <span className="status-badge" data-status={status}>
    {status}
  </span>
);
