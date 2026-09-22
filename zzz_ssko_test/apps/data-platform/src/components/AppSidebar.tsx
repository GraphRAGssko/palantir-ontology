import { Button, Tooltip } from "@blueprintjs/core";

export type AppId = "om" | "oe" | "biw";

interface AppSidebarProps {
  active: AppId;
  onSelect: (app: AppId) => void;
}

const APPS: {
  id: AppId;
  icon: "cube" | "search-template" | "dashboard";
  label: string;
}[] = [
  { id: "om", icon: "cube", label: "Ontology Manager" },
  { id: "oe", icon: "search-template", label: "Object Explorer" },
  { id: "biw", icon: "dashboard", label: "Batch Investigation" },
];

export function AppSidebar({ active, onSelect }: AppSidebarProps) {
  return (
    <nav className="app-nav">
      {APPS.map((app) => (
        <Tooltip key={app.id} content={app.label} placement="right">
          <Button
            icon={app.icon}
            minimal
            large
            active={active === app.id}
            onClick={() => onSelect(app.id)}
            className="app-nav-btn"
          />
        </Tooltip>
      ))}
    </nav>
  );
}
