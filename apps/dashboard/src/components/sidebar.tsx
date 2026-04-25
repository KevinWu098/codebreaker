import { ServerCog, Settings2, Workflow } from "lucide-react";
import { ConnectionForm } from "@/components/connection-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { useConnection } from "@/lib/connection";

export type ViewId = "sessions" | "admin";

interface SidebarProps {
  onSelectView: (view: ViewId) => void;
  view: ViewId;
}

interface NavItem {
  description: string;
  Icon: typeof Workflow;
  id: ViewId;
  label: string;
}

const NAV: readonly NavItem[] = [
  {
    description: "live d1 + durable object inspection",
    Icon: Workflow,
    id: "sessions",
    label: "sessions",
  },
  {
    description: "modal shim health, sandboxes",
    Icon: ServerCog,
    id: "admin",
    label: "admin",
  },
];

export const Sidebar = ({
  onSelectView,
  view,
}: SidebarProps): React.JSX.Element => {
  const connection = useConnection();
  const hasToken = connection.token.length > 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-section pb-2">
        <div className="flex items-center gap-1.5 text-fg">
          <Settings2 aria-hidden="true" size={14} />
          <span className="font-semibold text-sm lowercase">codebreaker</span>
        </div>
        <span className="text-[10px] text-fg-muted uppercase tracking-widest">
          control plane dashboard
        </span>
      </div>

      <div className="sidebar-section gap-1">
        <span className="field-label">navigation</span>
        {NAV.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              aria-current={view === item.id ? "page" : undefined}
              className="nav-item"
              key={item.id}
              onClick={() => onSelectView(item.id)}
              title={item.description}
              type="button"
            >
              <Icon aria-hidden="true" size={12} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-section">
        <ConnectionForm />
      </div>

      <div className="sidebar-section mt-auto gap-1">
        <ThemeToggle />
        <span
          className={cn(
            "truncate text-[10px] text-fg-subtle",
            !hasToken && "text-status-paused"
          )}
          title={hasToken ? connection.baseUrl : "no token configured"}
        >
          {hasToken ? "auth: bearer set" : "auth: missing token"}
        </span>
      </div>
    </aside>
  );
};
