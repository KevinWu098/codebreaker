import { Monitor, Moon, Sun } from "lucide-react";
import { type ThemeMode, themeStore, useThemeMode } from "@/hooks/use-theme";

const ICONS: Record<ThemeMode, typeof Sun> = {
  auto: Monitor,
  dark: Moon,
  light: Sun,
};

const NEXT_LABEL: Record<ThemeMode, ThemeMode> = {
  auto: "light",
  dark: "auto",
  light: "dark",
};

export const ThemeToggle = (): React.JSX.Element => {
  const mode = useThemeMode();
  const Icon = ICONS[mode];

  return (
    <button
      className="nav-item w-full justify-between"
      onClick={() => themeStore.cycle()}
      title={`theme: ${mode} (next: ${NEXT_LABEL[mode]})`}
      type="button"
    >
      <span>theme</span>
      <span className="flex items-center gap-1.5 text-fg">
        <Icon aria-hidden="true" size={12} />
        <span className="lowercase">{mode}</span>
      </span>
    </button>
  );
};
