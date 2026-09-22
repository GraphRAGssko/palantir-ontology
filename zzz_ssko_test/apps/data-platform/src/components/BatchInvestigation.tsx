import { useEffect, useMemo, useState } from "react";
import { HTMLSelect, HTMLTable, Icon, NonIdealState, Spinner, Switch, Tag } from "@blueprintjs/core";
import { fetchInstances } from "../api.ts";
import { BatchDetailPanel } from "./BatchDetailPanel.tsx";
import {
  BEHIND_THRESHOLD,
  isBehindTarget,
  MAINTENANCE_WINDOW_DAYS,
  num,
  sugarBand,
  sugarDelta,
  targetSugarAtDay,
  withinLastDays,
  type SugarBand,
} from "../batchMetrics.ts";

// Course narrative "now", injected by Vite from the repo-root .env.
const COURSE_NOW: Date = import.meta.env.COURSE_NOW
  ? new Date(import.meta.env.COURSE_NOW)
  : new Date();

interface Recipe {
  id: string;
  name: string;
  target_sugar_curve: Record<string, number> | null;
}

interface Tank {
  id: string;
  name: string;
}

interface MaintenanceLog {
  target_type: string;
  target_id: string;
  completed_at: string | null;
  started_at: string | null;
}

interface BatchRow {
  id: string;
  recipeId: string | null;
  recipeName: string;
  status: string;
  tankId: string | null;
  tankName: string;
  daysFermenting: number | null;
  currentSugar: number | null;
  targetSugar: number | null;
  delta: number | null;
  band: SugarBand | null;
  behind: boolean;
  tankMaintRecently: boolean;
}

const ALL = "__all__";

export function BatchInvestigation() {
  const [batches, setBatches] = useState<Record<string, unknown>[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [tankFilter, setTankFilter] = useState<string>(ALL);
  const [behindOnly, setBehindOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchInstances("batch"),
      fetchInstances("recipe"),
      fetchInstances("tank"),
      fetchInstances("maintenanceLog"),
    ])
      .then(([b, r, t, m]) => {
        setBatches(b);
        setRecipes(r as unknown as Recipe[]);
        setTanks(t as unknown as Tank[]);
        setMaintenance(m as unknown as MaintenanceLog[]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Tanks serviced within the maintenance window (by completed_at, else started_at).
  const recentlyServicedTanks = useMemo(() => {
    const set = new Set<string>();
    for (const log of maintenance) {
      if (log.target_type !== "tank") continue;
      if (withinLastDays(log.completed_at ?? log.started_at, COURSE_NOW)) {
        set.add(log.target_id);
      }
    }
    return set;
  }, [maintenance]);

  // Denormalize each batch with its recipe target, sugar band, and tank context.
  const rows = useMemo<BatchRow[]>(() => {
    const recipeById = new Map(recipes.map((r) => [r.id, r]));
    const tankById = new Map(tanks.map((t) => [t.id, t]));

    return batches.map((raw) => {
      const recipeId = (raw.recipe_id as string | null) ?? null;
      const tankId = (raw.assigned_tank_id as string | null) ?? null;
      const recipe = recipeId ? recipeById.get(recipeId) : undefined;
      const daysFermenting = num(raw.days_fermenting);
      const currentSugar = num(raw.current_sugar_level);
      const targetSugar = targetSugarAtDay(recipe?.target_sugar_curve, daysFermenting);
      const delta = sugarDelta(currentSugar, targetSugar);

      return {
        id: raw.id as string,
        recipeId,
        recipeName: recipe?.name ?? recipeId ?? "—",
        status: (raw.status as string) ?? "—",
        tankId,
        tankName: tankId ? (tankById.get(tankId)?.name ?? tankId) : "—",
        daysFermenting,
        currentSugar,
        targetSugar,
        delta,
        band: sugarBand(delta),
        behind: isBehindTarget(delta),
        tankMaintRecently: tankId ? recentlyServicedTanks.has(tankId) : false,
      };
    });
  }, [batches, recipes, tanks, recentlyServicedTanks]);

  // Metric cards are scoped to fermenting batches.
  const fermenting = useMemo(() => rows.filter((r) => r.status === "fermenting"), [rows]);
  const behindCount = useMemo(() => fermenting.filter((r) => r.behind).length, [fermenting]);
  const maintCount = useMemo(
    () => fermenting.filter((r) => r.tankMaintRecently).length,
    [fermenting],
  );

  // Distinct filter options drawn from the data.
  const statusOptions = useMemo(
    () => [...new Set(rows.map((r) => r.status))].sort(),
    [rows],
  );
  const tankOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.tankId) seen.set(r.tankId, r.tankName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter !== ALL && r.status !== statusFilter) return false;
        if (tankFilter !== ALL && r.tankId !== tankFilter) return false;
        if (behindOnly && !r.behind) return false;
        return true;
      }),
    [rows, statusFilter, tankFilter, behindOnly],
  );

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  if (loading) {
    return (
      <div className="biw-shell">
        <div className="empty-state" style={{ flex: 1 }}>
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="biw-shell">
      <div className="biw-header">
        <h1 className="biw-title">Batch Investigation</h1>
        <span className="biw-asof">
          as of {COURSE_NOW.toISOString().slice(0, 10)}
        </span>
      </div>

      <div className="biw-metrics">
        <MetricCard
          label="Fermenting Batches"
          value={fermenting.length}
          sub="currently active"
          icon="pulse"
        />
        <MetricCard
          label="Behind Target"
          value={behindCount}
          sub={`≥ ${BEHIND_THRESHOLD.toFixed(3)} over target`}
          icon="warning-sign"
          intent={behindCount > 0 ? "danger" : "none"}
        />
        <MetricCard
          label="Recent Tank Maintenance"
          value={maintCount}
          sub={`tank serviced in last ${MAINTENANCE_WINDOW_DAYS} days`}
          icon="wrench"
          intent={maintCount > 0 ? "warning" : "none"}
        />
      </div>

      <div className="biw-body">
        <div className="biw-left">
          <div className="biw-filters">
            <label className="biw-filter">
              <span className="biw-filter-label">Status</span>
              <HTMLSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
              >
                <option value={ALL}>All</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </HTMLSelect>
            </label>

            <label className="biw-filter">
              <span className="biw-filter-label">Tank</span>
              <HTMLSelect
                value={tankFilter}
                onChange={(e) => setTankFilter(e.currentTarget.value)}
              >
                <option value={ALL}>All</option>
                {tankOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </HTMLSelect>
            </label>

            <Switch
              className="biw-behind-toggle"
              checked={behindOnly}
              label="Behind target only"
              onChange={(e) => setBehindOnly(e.currentTarget.checked)}
            />

            <span className="biw-row-count">
              {visibleRows.length} of {rows.length}
            </span>
          </div>

          <div className="biw-table-wrap">
            <HTMLTable interactive className="biw-table" compact>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Recipe</th>
                  <th>Sugar vs Target</th>
                  <th className="biw-num">Days</th>
                  <th>Tank</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr
                    key={r.id}
                    className={selectedId === r.id ? "biw-row-selected" : undefined}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="biw-mono">{r.id}</td>
                    <td>{r.recipeName}</td>
                    <td>
                      <SugarCell row={r} />
                    </td>
                    <td className="biw-num">{r.daysFermenting ?? "—"}</td>
                    <td>
                      {r.tankName}
                      {r.tankMaintRecently && (
                        <Icon
                          icon="wrench"
                          size={11}
                          className="biw-maint-flag"
                          title={`Tank serviced in last ${MAINTENANCE_WINDOW_DAYS} days`}
                        />
                      )}
                    </td>
                    <td>
                      <Tag minimal round intent={r.status === "fermenting" ? "primary" : "none"}>
                        {r.status}
                      </Tag>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="biw-empty">
                      No batches match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </HTMLTable>
          </div>
        </div>

        <div className="biw-right">
          {selectedRow ? (
            <BatchDetailPanel
              key={selectedRow.id}
              batchId={selectedRow.id}
              tankId={selectedRow.tankId}
              daysFermenting={selectedRow.daysFermenting}
            />
          ) : (
            <div className="biw-right-empty">
              <NonIdealState
                icon="search-around"
                title="No batch selected"
                description="Select a batch to inspect it here."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SugarCell({ row }: { row: BatchRow }) {
  if (row.currentSugar === null || row.targetSugar === null || row.band === null) {
    return <span className="biw-dim">—</span>;
  }
  const sign = row.delta! > 0 ? "+" : "";
  return (
    <span className={`biw-sugar biw-sugar-${row.band}`}>
      <span className="biw-sugar-current">{row.currentSugar.toFixed(3)}</span>
      <span className="biw-sugar-sep">/</span>
      <span className="biw-sugar-target">{row.targetSugar.toFixed(3)}</span>
      <span className="biw-sugar-delta">
        ({sign}
        {row.delta!.toFixed(3)})
      </span>
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  intent = "none",
}: {
  label: string;
  value: number;
  sub: string;
  icon: "pulse" | "warning-sign" | "wrench";
  intent?: "none" | "warning" | "danger";
}) {
  return (
    <div className={`biw-metric biw-metric-${intent}`}>
      <div className="biw-metric-head">
        <Icon icon={icon} size={14} className="biw-metric-icon" />
        <span className="biw-metric-label">{label}</span>
      </div>
      <div className="biw-metric-value">{value}</div>
      <div className="biw-metric-sub">{sub}</div>
    </div>
  );
}
