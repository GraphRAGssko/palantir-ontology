import { useEffect, useState } from "react";
import { Button, Menu, MenuItem, Icon, Tooltip } from "@blueprintjs/core";
import { fetchTypes, fetchTypeDetail } from "./api";
import type { TypeSummary, TypeDetail } from "./api";
import { OntologyManager } from "./OntologyManager";
import { ObjectExplorer } from "./ObjectExplorer";
import { BatchWorkspace } from "./BatchWorkspace";
import "./App.css";

type AppId = "om" | "oe" | "biw";

export function App() {
  const [app, setApp] = useState<AppId>("om");

  return (
    <div className="app-root">
      {/* ---- Thin app sidebar ---- */}
      <nav className="app-sidebar">
        <Tooltip content="Ontology Manager" placement="right">
          <Button
            icon="cube"
            active={app === "om"}
            onClick={() => setApp("om")}
            minimal
            large
            className="app-sidebar-btn"
          />
        </Tooltip>
        <Tooltip content="Object Explorer" placement="right">
          <Button
            icon="search-template"
            active={app === "oe"}
            onClick={() => setApp("oe")}
            minimal
            large
            className="app-sidebar-btn"
          />
        </Tooltip>
        <Tooltip content="Batch Investigation" placement="right">
          <Button
            icon="lab-test"
            active={app === "biw"}
            onClick={() => setApp("biw")}
            minimal
            large
            className="app-sidebar-btn"
          />
        </Tooltip>
      </nav>

      {/* ---- App bodies (both mounted, one hidden for state preservation) ---- */}
      <div className="app-body" style={{ display: app === "om" ? "flex" : "none" }}>
        <OntologyManagerApp />
      </div>
      <div className="app-body" style={{ display: app === "oe" ? "flex" : "none" }}>
        <ObjectExplorer />
      </div>
      <div className="app-body" style={{ display: app === "biw" ? "flex" : "none" }}>
        <BatchWorkspace />
      </div>
    </div>
  );
}

// ---- Ontology Manager (moved from previous App root) ----

function OntologyManagerApp() {
  const [types, setTypes] = useState<TypeSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TypeDetail | null>(null);

  const loadTypes = () => fetchTypes().then(setTypes);

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (types.length > 0 && !selected) setSelected(types[0]!.api_name);
  }, [types, selected]);

  useEffect(() => {
    if (selected) fetchTypeDetail(selected).then(setDetail);
    else setDetail(null);
  }, [selected]);

  const refreshAll = () => {
    loadTypes();
    if (selected) fetchTypeDetail(selected).then(setDetail);
  };

  const instanceCount =
    types.find((t) => t.api_name === selected)?.instance_count ?? 0;

  return (
    <>
      <aside className="left-rail">
        <div className="rail-header">Object Types</div>
        <Menu>
          {types.map((t) => (
            <MenuItem
              key={t.api_name}
              icon={<Icon icon="cube" />}
              text={t.name}
              labelElement={<span className="rail-count">{t.instance_count}</span>}
              active={selected === t.api_name}
              onClick={() => setSelected(t.api_name)}
            />
          ))}
        </Menu>
      </aside>
      <main className="main-content">
        {detail ? (
          <OntologyManager
            key={selected}
            detail={detail}
            instanceCount={instanceCount}
            types={types}
            onUpdate={refreshAll}
          />
        ) : (
          <div className="empty">Select an object type</div>
        )}
      </main>
    </>
  );
}
