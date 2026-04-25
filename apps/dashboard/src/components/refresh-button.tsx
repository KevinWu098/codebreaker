interface Props {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}

export const RefreshButton = ({
  onClick,
  label = "↻",
  disabled,
}: Props): React.JSX.Element => (
  <button
    className="btn btn-ghost text-xs"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {label}
  </button>
);
