import type { ReactNode } from "react";

interface PageHeaderProps {
  actions?: ReactNode;
  description?: ReactNode;
  title: string;
}

export const PageHeader = ({
  actions,
  description,
  title,
}: PageHeaderProps): React.JSX.Element => (
  <header className="page-header">
    <div className="space-y-1">
      <h1 className="lowercase">{title}</h1>
      {description ? <div className="subtitle">{description}</div> : null}
    </div>
    {actions ? (
      <div className="flex items-center gap-1.5">{actions}</div>
    ) : null}
  </header>
);
