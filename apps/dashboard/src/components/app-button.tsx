import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  danger: "btn-danger",
  default: "",
  ghost: "border-transparent bg-transparent hover:bg-bg-hover",
  primary: "btn-primary",
};

export const AppButton = ({
  children,
  className,
  type = "button",
  variant = "default",
  ...rest
}: ButtonProps): React.JSX.Element => (
  <button
    className={cn("btn", VARIANT_CLASS[variant], className)}
    type={type}
    {...rest}
  >
    {children}
  </button>
);
