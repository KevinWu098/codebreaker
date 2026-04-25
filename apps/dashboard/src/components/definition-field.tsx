import { cn } from "@/lib/cn";

interface DefinitionFieldProps {
  children: React.ReactNode;
  label: string;
  mono?: boolean;
  numeric?: boolean;
}

export const DefinitionField = ({
  children,
  label,
  mono,
  numeric,
}: DefinitionFieldProps): React.JSX.Element => (
  <>
    <dt className="text-[10px] text-fg-muted uppercase tracking-wider">
      {label}
    </dt>
    <dd
      className={cn("text-fg", mono && "font-mono", numeric && "tabular-nums")}
    >
      {children}
    </dd>
  </>
);
