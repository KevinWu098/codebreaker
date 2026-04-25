interface FormFieldProps {
  children: React.ReactNode;
  error?: string | undefined;
  id: string;
  label: string;
}

export const FormField = ({
  children,
  error,
  id,
  label,
}: FormFieldProps): React.JSX.Element => (
  <div className="space-y-1">
    <label className="field-label" htmlFor={id}>
      {label}
    </label>
    {children}
    {error ? <p className="text-[10px] text-status-failed">{error}</p> : null}
  </div>
);
