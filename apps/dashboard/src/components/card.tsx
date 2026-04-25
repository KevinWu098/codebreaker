import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  title?: ReactNode;
}

export const Card = ({
  actions,
  bodyClassName,
  children,
  className,
  title,
  ...rest
}: CardProps): React.JSX.Element => {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <section className={cn("card", className)} {...rest}>
      {hasHeader && (
        <header className="card-header">
          <span className="lowercase">{title}</span>
          {actions ? (
            <span className="flex items-center gap-1.5">{actions}</span>
          ) : null}
        </header>
      )}
      <div className={cn("card-body", bodyClassName)}>{children}</div>
    </section>
  );
};
