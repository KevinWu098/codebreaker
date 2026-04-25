import { cn } from "@/lib/utils";

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
    <dt className="m-0 self-baseline text-[10px] text-fg-muted uppercase leading-5 tracking-wider">
      {label}
    </dt>
    <dd
      className={cn(
        "m-0 min-w-0 text-fg leading-5",
        mono && "font-mono",
        numeric && "tabular-nums"
      )}
    >
      {children}
    </dd>
  </>
);
