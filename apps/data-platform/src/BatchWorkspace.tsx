import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Card,
  Collapse,
  H3,
  H5,
  HTMLSelect,
  HTMLTable,
  Icon,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import { fetchAudit, fetchInstance, fetchInstances } from "./api";
import type { AuditEntry, InstanceDetail } from "./api";

// ---- Course clock (from Vite env) ------------------------------------

const COURSE_NOW = new Date(
  import.meta.env.COURSE_NOW || new Date().toISOString(),
);

// ---- Sugar-curve helpers ---------------------------------------------

function parseCurve(v: unknown): [number, number][] {
  if (typeof v !== "object" || v === null) return [];
  return Object.entries(v as Record<string, unknown>)
    .filter(([k]) => k.startsWith("day_"))
    .map(([k, sg]) => [Number(k.slice(4)), Number(sg)] as [number, number])
    .filter(([d, s]) => !isNaN(d) && !isNaN(s))
    .sort((a, b) => a[0] - b[0]);
}

function interpolateTarget(
  curve: [number, number][],
  day: number,
): number | null {
  if (curve.length === 0) return null;
  if (day <= curve[0]![0]) return curve[0]![1];
  if (day >= curve[curve.length - 1]![0]) return curve[curve.length - 1]![1];
  for (let i = 0; i < curve.length - 1; i++) {
    const [d0, s0] = curve[i]!;
    const [d1, s1] = curve[i + 1]!;
    if (day >= d0 && day <= d1) {
      const t = (day - d0) / (d1 - d0);
      return s0 + t * (s1 - s0);
    }
  }
  return null;
}

type Row = Record<string, unknown>;

function fmtDate(v: unknown): string {
  if (v == null) return "\u2014";
  const d = new Date(String(v));
  return isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(v: unknown): string {
  if (v == null) return "\u2014";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

// ---- Root component --------------------------------------------------

export function BatchWorkspace() {
  const [batches, setBatches] = useState<Row[]>([]);
  const [recipes, setRecipes] = useState<Row[]>([]);
  const [tanks, setTanks] = useState<Row[]>([]);
  const [maint, setMaint] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [tankFilter, setTankFilter] = useState("");
  const [behindOnly, setBehindOnly] = useState(false);

  useEffect(() => {
    fetchInstances("batch").then(setBatches);
    fetchInstances("recipe").then(setRecipes);
    fetchInstances("tank").then(setTanks);
    fetchInstances("maintenanceLog").then(setMaint);
  }, []);

  const recipeById = useMemo(
    () => new Map(recipes.map((r) => [String(r.id), r])),
    [recipes],
  );
  const tankById = useMemo(
    () => new Map(tanks.map((t) => [String(t.id), t])),
    [tanks],
  );
  const curveByRecipe = useMemo(() => {
    const m = new Map<string, [number, number][]>();
    for (const r of recipes) m.set(String(r.id), parseCurve(r.targetSugarCurve));
    return m;
  }, [recipes]);
  const batchTarget = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const b of batches) {
      const curve = curveByRecipe.get(String(b.recipeId)) ?? [];
      m.set(String(b.id), interpolateTarget(curve, Number(b.daysFermenting) || 0));
    }
    return m;
  }, [batches, curveByRecipe]);

  function sugarDiff(b: Row): number | null {
    const target = batchTarget.get(String(b.id));
    const current = Number(b.currentSugarLevel);
    if (target == null || isNaN(current)) return null;
    return current - target;
  }

  // Metrics
  const fermenting = useMemo(() => batches.filter((b) => b.status === "fermenting"), [batches]);
  const behindTargetBatches = useMemo(
    () => fermenting.filter((b) => (sugarDiff(b) ?? 0) >= 0.008),
    [fermenting, batchTarget],
  );
  const recentMaintBatches = useMemo(() => {
    const cutoff = COURSE_NOW.getTime() - 7 * 24 * 60 * 60 * 1000;
    const tanksWithMaint = new Set(
      maint
        .filter((m) => {
          if (String(m.targetType) !== "tank") return false;
          const t = new Date(String(m.startedAt ?? "")).getTime();
          return !isNaN(t) && t >= cutoff;
        })
        .map((m) => String(m.targetId)),
    );
    return fermenting.filter((b) => tanksWithMaint.has(String(b.assignedTankId)));
  }, [fermenting, maint]);

  // Filter options
  const statuses = useMemo(
    () => [...new Set(batches.map((b) => String(b.status ?? "")))].filter(Boolean).sort(),
    [batches],
  );
  const tankOptions = useMemo(
    () => tanks.map((t) => ({ id: String(t.id), name: String(t.name ?? t.id) })).sort((a, b) => a.name.localeCompare(b.name)),
    [tanks],
  );

  // Filtered rows
  const filtered = useMemo(() => {
    let list = batches;
    if (statusFilter) list = list.filter((b) => b.status === statusFilter);
    if (tankFilter) list = list.filter((b) => String(b.assignedTankId) === tankFilter);
    if (behindOnly) list = list.filter((b) => (sugarDiff(b) ?? 0) >= 0.008);
    return list;
  }, [batches, statusFilter, tankFilter, behindOnly, batchTarget]);

  return (
    <div className="main-content" style={{ flex: 1 }}>
      <H3>Batch Investigation</H3>
      <div className="type-subtitle" style={{ marginBottom: 20 }}>
        Monitoring as of{" "}
        {COURSE_NOW.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </div>

      {/* Metric cards */}
      <div className="metric-cards">
        <Card className="metric-card">
          <Icon icon="flame" size={20} className="metric-icon" style={{ color: "#2b95d6" }} />
          <div className="metric-value">{fermenting.length}</div>
          <div className="metric-label">Fermenting Batches</div>
        </Card>
        <Card className="metric-card">
          <Icon icon="warning-sign" size={20} className="metric-icon" style={{ color: behindTargetBatches.length > 0 ? "#d9822b" : "#0f9960" }} />
          <div className="metric-value" style={{ color: behindTargetBatches.length > 0 ? "#d9822b" : undefined }}>
            {behindTargetBatches.length}
          </div>
          <div className="metric-label">Behind Target</div>
        </Card>
        <Card className="metric-card">
          <Icon icon="wrench" size={20} className="metric-icon" style={{ color: recentMaintBatches.length > 0 ? "#d9822b" : "#0f9960" }} />
          <div className="metric-value" style={{ color: recentMaintBatches.length > 0 ? "#d9822b" : undefined }}>
            {recentMaintBatches.length}
          </div>
          <div className="metric-label">Recent Tank Maintenance</div>
        </Card>
      </div>

      {/* Body */}
      <div className="workspace-body">
        {/* Left: batch table */}
        <div>
          <div className="workspace-filters">
            <HTMLSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </HTMLSelect>
            <HTMLSelect value={tankFilter} onChange={(e) => setTankFilter(e.target.value)}>
              <option value="">All tanks</option>
              {tankOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </HTMLSelect>
            <Switch label="Behind target only" checked={behindOnly} onChange={() => setBehindOnly((v) => !v)} className="search-all-switch" />
          </div>

          <HTMLTable interactive striped compact className="instance-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Recipe</th>
                <th>Sugar / Target</th>
                <th>Days</th>
                <th>Tank</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const id = String(b.id);
                const recipe = recipeById.get(String(b.recipeId));
                const recipeName = recipe ? String(recipe.name ?? "") : "\u2014";
                const current = Number(b.currentSugarLevel);
                const target = batchTarget.get(id);
                const days = Number(b.daysFermenting) || 0;
                const tank = tankById.get(String(b.assignedTankId));
                const tankName = tank ? String(tank.name ?? tank.id) : "\u2014";
                let sugarIntent: "success" | "warning" | "danger" | "none" = "none";
                if (target != null && !isNaN(current)) {
                  const diff = current - target;
                  if (diff < 0.005) sugarIntent = "success";
                  else if (diff < 0.008) sugarIntent = "warning";
                  else sugarIntent = "danger";
                }
                return (
                  <tr key={id} onClick={() => setSelectedId(id)} className={selectedId === id ? "selected-row" : undefined}>
                    <td>{id}</td>
                    <td>{recipeName}</td>
                    <td>
                      {target != null && !isNaN(current) ? (
                        <>
                          <Tag minimal intent={sugarIntent}>{current.toFixed(3)}</Tag>
                          <span className="target-sugar"> / {target.toFixed(3)}</span>
                        </>
                      ) : "\u2014"}
                    </td>
                    <td>{days}</td>
                    <td>{tankName}</td>
                    <td><Tag minimal round>{String(b.status ?? "\u2014")}</Tag></td>
                  </tr>
                );
              })}
            </tbody>
          </HTMLTable>
        </div>

        {/* Right: detail panel */}
        <div className="workspace-right">
          {selectedId ? (
            <BatchDetailPanel
              key={selectedId}
              batchId={selectedId}
              recipeById={recipeById}
              tankById={tankById}
              curveByRecipe={curveByRecipe}
              maint={maint}
            />
          ) : (
            <Card>
              <div className="empty">Select a batch to view details</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Detail panel ----------------------------------------------------

function BatchDetailPanel({
  batchId,
  recipeById,
  tankById,
  curveByRecipe,
  maint,
}: {
  batchId: string;
  recipeById: Map<string, Row>;
  tankById: Map<string, Row>;
  curveByRecipe: Map<string, [number, number][]>;
  maint: Row[];
}) {
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    setDetail(null);
    setAudit(null);
    Promise.all([
      fetchInstance("batch", batchId),
      fetchAudit("batch", batchId),
    ]).then(([d, a]) => {
      setDetail(d);
      setAudit(a);
    });
  }, [batchId]);

  if (!detail) return <Card><Spinner size={24} /></Card>;

  const p = detail.properties;
  const days = Number(p.daysFermenting) || 0;
  const currentSG = Number(p.currentSugarLevel);

  // Recipe
  const recipe = recipeById.get(String(p.recipeId));
  const curve = curveByRecipe.get(String(p.recipeId)) ?? [];
  const targetSG = interpolateTarget(curve, days);

  // Tank
  const tankId = String(p.assignedTankId ?? "");
  const tank = tankById.get(tankId);

  // Tank maintenance filtered to this tank
  const tankMaint = maint
    .filter((m) => String(m.targetType) === "tank" && String(m.targetId) === tankId)
    .sort((a, b) => {
      const ta = new Date(String(a.startedAt ?? "")).getTime();
      const tb = new Date(String(b.startedAt ?? "")).getTime();
      return tb - ta;
    });

  // Fermentation window for warning flags
  const plannedStart = p.plannedStart ? new Date(String(p.plannedStart)).getTime() : null;
  const recipeDays = recipe ? Number(recipe.fermentationDays) || 0 : 0;
  const fermentEnd = plannedStart != null ? plannedStart + recipeDays * 24 * 60 * 60 * 1000 : null;

  function isInFermentWindow(dateStr: unknown): boolean {
    if (plannedStart == null || fermentEnd == null) return false;
    const t = new Date(String(dateStr ?? "")).getTime();
    return !isNaN(t) && t >= plannedStart && t <= fermentEnd;
  }

  // Quality tests from resolved links
  const qtLink = detail.links["qualityTests"];
  const qualityTests: Row[] = qtLink
    ? Array.isArray(qtLink.data) ? qtLink.data as Row[] : qtLink.data ? [qtLink.data as Row] : []
    : [];

  // Sugar intent
  let sugarIntent: "success" | "warning" | "danger" | "none" = "none";
  if (targetSG != null && !isNaN(currentSG)) {
    const diff = currentSG - targetSG;
    if (diff < 0.005) sugarIntent = "success";
    else if (diff < 0.008) sugarIntent = "warning";
    else sugarIntent = "danger";
  }

  return (
    <Card className="detail-panel-card">
      <H5 style={{ marginBottom: 12 }}>
        <Icon icon="cube" className="detail-header-icon" style={{ marginRight: 6 }} />
        {batchId}
      </H5>

      {/* ---- Batch ---- */}
      <Section title="Batch" icon="flame">
        <PropRow label="Sugar Level">
          {!isNaN(currentSG) ? (
            <>
              <Tag minimal intent={sugarIntent}>{currentSG.toFixed(3)}</Tag>
              {targetSG != null && (
                <span className="target-sugar"> target {targetSG.toFixed(3)}</span>
              )}
            </>
          ) : "\u2014"}
        </PropRow>
        <PropRow label="Temperature">
          {p.currentTemperature != null ? `${p.currentTemperature}\u00b0` : "\u2014"}
        </PropRow>
        <PropRow label="Days Fermenting">{days}</PropRow>
        <PropRow label="Planned Start">{fmtDate(p.plannedStart)}</PropRow>
        <PropRow label="Operator Note">
          {p.lastOperatorNote ? (
            <em>{String(p.lastOperatorNote)}</em>
          ) : "\u2014"}
        </PropRow>
      </Section>

      {/* ---- Recipe ---- */}
      <Section title="Recipe" icon="manual">
        {recipe ? (
          <>
            <PropRow label="Name">{String(recipe.name ?? "\u2014")}</PropRow>
            <PropRow label="Fermentation Days">{String(recipe.fermentationDays ?? "\u2014")}</PropRow>
            <PropRow label="Notes">
              {recipe.notes ? <em>{String(recipe.notes)}</em> : "\u2014"}
            </PropRow>
            <PropRow label={`Target at Day ${days}`}>
              {targetSG != null ? (
                <Tag intent="primary" minimal>{targetSG.toFixed(3)}</Tag>
              ) : "\u2014"}
            </PropRow>
            {curve.length > 0 && (
              <div className="curve-row">
                {curve.map(([d, sg]) => (
                  <span key={d} className={d === days ? "curve-point active" : "curve-point"}>
                    d{d}: {sg.toFixed(3)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty">No recipe linked</div>
        )}
      </Section>

      {/* ---- Tank + Maintenance ---- */}
      <Section title="Tank + Maintenance" icon="oil-field">
        {tank ? (
          <>
            <PropRow label="Tank">
              {String(tank.name ?? tank.id)}
              <Tag minimal round style={{ marginLeft: 8 }}>{String(tank.status ?? "")}</Tag>
            </PropRow>
          </>
        ) : (
          <PropRow label="Tank">{"\u2014"}</PropRow>
        )}
        {tankMaint.length > 0 ? (
          <div className="maint-cards">
            {tankMaint.map((m) => {
              const inWindow = isInFermentWindow(m.startedAt);
              const completed = m.completedAt != null;
              return (
                <Card key={String(m.id)} className="maint-card" elevation={0}>
                  <div className="maint-card-header">
                    <span className="maint-card-id">{String(m.id)}</span>
                    <div className="maint-card-tags">
                      <Tag minimal round>{String(m.type ?? "maintenance")}</Tag>
                      <Tag minimal round intent={completed ? "success" : "primary"}>
                        {String(m.status ?? (completed ? "completed" : "open"))}
                      </Tag>
                      {inWindow && (
                        <Tag intent="warning" minimal icon="warning-sign">
                          During fermentation
                        </Tag>
                      )}
                    </div>
                  </div>
                  <div className="maint-card-dates">
                    <span>Started {fmtDate(m.startedAt)}</span>
                    {completed && <span> · Completed {fmtDate(m.completedAt)}</span>}
                  </div>
                  {m.notes != null && (
                    <div className="maint-card-notes">{String(m.notes)}</div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ marginTop: 4 }}>No maintenance records for this tank</div>
        )}
      </Section>

      {/* ---- Quality Tests ---- */}
      <Section title="Quality Tests" icon="lab-test" defaultOpen={qualityTests.length > 0}>
        {qualityTests.length > 0 ? (
          <HTMLTable compact striped className="inner-table">
            <thead>
              <tr><th>Date</th><th>pH</th><th>Sugar</th><th>Tester</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {qualityTests.map((qt, i) => (
                <tr key={i}>
                  <td>{fmtDate(qt.testDate)}</td>
                  <td>{qt.ph != null ? String(qt.ph) : "\u2014"}</td>
                  <td>{qt.sugarLevel != null ? String(qt.sugarLevel) : "\u2014"}</td>
                  <td>{qt.testedBy ? String(qt.testedBy) : "\u2014"}</td>
                  <td className="notes-cell">{qt.notes ? String(qt.notes) : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        ) : (
          <div className="empty">No quality tests recorded</div>
        )}
      </Section>

      {/* ---- Audit ---- */}
      <Section title="Audit Log" icon="history" defaultOpen={false}>
        {audit == null ? (
          <Spinner size={20} />
        ) : audit.length > 0 ? (
          audit.map((entry, i) => (
            <AuditRow key={i} entry={entry} />
          ))
        ) : (
          <div className="empty">No audit entries</div>
        )}
      </Section>
    </Card>
  );
}

// ---- Collapsible section ---------------------------------------------

function Section({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="detail-section">
      <div className="detail-section-header" onClick={() => setOpen(!open)}>
        <Icon icon={open ? "chevron-down" : "chevron-right"} size={14} />
        {icon && <Icon icon={icon as never} size={14} className="prop-icon" />}
        <span className="detail-section-title">{title}</span>
      </div>
      <Collapse isOpen={open}>
        <div className="detail-section-body">{children}</div>
      </Collapse>
    </div>
  );
}

// ---- Property row ----------------------------------------------------

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-prop-row">
      <span className="detail-prop-label">{label}</span>
      <span className="detail-prop-value">{children}</span>
    </div>
  );
}

// ---- Audit row (expandable) ------------------------------------------

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="audit-entry">
      <div className="audit-entry-header" onClick={() => setOpen(!open)}>
        <Icon icon={open ? "chevron-down" : "chevron-right"} size={12} />
        <Tag minimal>{entry.action_api_name ?? "unknown"}</Tag>
        <span className="audit-actor">{entry.actor ?? "\u2014"}</span>
        <span className="audit-time">{fmtDateTime(entry.created_at)}</span>
      </div>
      <Collapse isOpen={open}>
        <div className="audit-detail">
          {entry.params != null && (
            <div>
              <strong>Params:</strong>
              <pre className="audit-json">{JSON.stringify(entry.params, null, 2)}</pre>
            </div>
          )}
          {entry.result != null && (
            <div>
              <strong>Result:</strong>
              <pre className="audit-json">{JSON.stringify(entry.result, null, 2)}</pre>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}
