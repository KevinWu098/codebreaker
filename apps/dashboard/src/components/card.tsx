import type { ReactNode } from "react";

interface Props {
  actions?: ReactNode;
  children: ReactNode;
  title?: ReactNode;
}

export const Card = ({
  title,
  actions,
  children,
}: Props): React.JSX.Element => (
  <section className="card">
    {(title || actions) && (
      <header className="card-title">
        <span>{title}</span>
        {actions ? <span className="flex gap-2">{actions}</span> : null}
      </header>
    )}
    {children}
  </section>
);
