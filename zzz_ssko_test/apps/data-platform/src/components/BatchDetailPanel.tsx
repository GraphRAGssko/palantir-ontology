import { useEffect, useMemo, useState } from "react";
import { Collapse, Icon, Spinner, Tag } from "@blueprintjs/core";
import { fetchAudit, fetchInstance, fetchInstances, type AuditEntry } from "../api.ts";
import {
  fermentationWindow,
  num,
  sugarBand,
  sugarDelta,
  targetSugarAtDay,
  withinWindow,
  type DateWindow,
} from "../batchMetrics.ts";

interface Recipe {
  id: string;
  name: string;
  fermentation_days: number | null;
  target_sugar_curve: Record<string, number> | null;
  notes: string | null;
}

interface Tank {
  id: string;
  name: string;
  status: string;
}

interface MaintenanceLog {
  id: string;
  type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

interface QualityTest {
  id: string;
  test_date: string | null;
  ph: unknown;
  sugar_level: unknown;
  notes: string | null;
  tested_by: string | null;
}

interface DetailData {
  batch: Record<string, unknown>;
  recipe: Recipe | null;
  tank: Tank | null;
  qualityTests: QualityTest[];
  maintenance: MaintenanceLog[];
  audit: AuditEntry[];
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "—";
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export function BatchDetailPanel({
  batchId,
  tankId,
  daysFermenting,
}: {
  batchId: string;
  tankId: string | null;
  daysFermenting: number | null;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchInstance("batch", batchId),
      tankId
        ? fetchInstances("maintenanceLog", { targetType: "tank", targetId: tankId })
        : Promise.resolve([] as Record<string, unknown>[]),
      fetchAudit("batch", batchId),
    ])
      .then(([batch, maintenance, audit]) => {
        if (cancelled) return;
        const links = batch.links ?? {};
        setData({
          batch,
          recipe: (links.recipe as Recipe | null) ?? null,
          tank: (links.assignedTank as Tank | null) ?? null,
          qualityTests: (links.qualityTests as QualityTest[] | undefined) ?? [],
          maintenance: maintenance as unknown as MaintenanceLog[],
          audit,
        });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [batchId, tankId]);

  const fermWindow = useMemo<DateWindow | null>(
    () => fermentationWindow(data?.batch.planned_start as string | null, data?.recipe?.fermentation_days ?? null),
    [data],
  );

  if (loading) {
    return (
      <div className="bd-panel bd-panel-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bd-panel bd-panel-center">
        <span className="bd-error">{error ?? "No data"}</span>
      </div>
    );
  }

  const { batch, recipe, tank, qualityTests, maintenance, audit } = data;

  const currentSugar = num(batch.current_sugar_level);
  const target = targetSugarAtDay(recipe?.target_sugar_curve, daysFermenting);
  const delta = sugarDelta(currentSugar, target);
  const band = sugarBand(delta);

  return (
    <div className="bd-panel">
      <div className="bd-header">
        <Icon icon="cube" className="bd-header-icon" />
        <div>
          <div className="bd-header-title">{batchId}</div>
          <div className="bd-header-sub">{recipe?.name ?? "—"}</div>
        </div>
      </div>

      {/* ---- Batch ---- */}
      <Section title="Batch" defaultOpen>
        <Row label="Sugar level">
          {currentSugar !== null ? (
            <span className={band ? `biw-sugar biw-sugar-${band}` : undefined}>
              {currentSugar.toFixed(3)}
              {target !== null && (
                <span className="bd-vs-target"> vs {target.toFixed(3)} target</span>
              )}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Temperature">
          {num(batch.current_temperature) !== null ? `${num(batch.current_temperature)} °C` : "—"}
        </Row>
        <Row label="Days fermenting">{daysFermenting ?? "—"}</Row>
        <Row label="Planned start">{fmtDate(batch.planned_start as string | null)}</Row>
        <Row label="Last operator note">
          {(batch.last_operator_note as string | null) || <span className="bd-dim">none</span>}
        </Row>
      </Section>

      {/* ---- Recipe ---- */}
      <Section title="Recipe" defaultOpen>
        {recipe ? (
          <>
            <Row label="Name">{recipe.name}</Row>
            <Row label="Fermentation days">{recipe.fermentation_days ?? "—"}</Row>
            <Row label="Sensitivity notes">
              {recipe.notes || <span className="bd-dim">none</span>}
            </Row>
            <div className="bd-curve-label">
              Target sugar curve
              {daysFermenting !== null && (
                <span className="bd-curve-day"> — day {daysFermenting}</span>
              )}
            </div>
            <SugarCurve curve={recipe.target_sugar_curve} day={daysFermenting} target={target} />
          </>
        ) : (
          <div className="bd-dim bd-pad">No recipe linked.</div>
        )}
      </Section>

      {/* ---- Tank + Maintenance ---- */}
      <Section title="Tank & Maintenance" count={maintenance.length} defaultOpen>
        {tank ? (
          <Row label="Tank">
            {tank.name} <Tag minimal round>{tank.status}</Tag>
          </Row>
        ) : (
          <Row label="Tank">
            <span className="bd-dim">unassigned</span>
          </Row>
        )}
        {maintenance.length === 0 ? (
          <div className="bd-dim bd-pad">No maintenance records.</div>
        ) : (
          <div className="bd-maint-list">
            {maintenance.map((m) => {
              const when = m.completed_at ?? m.started_at;
              const inWindow = withinWindow(when, fermWindow);
              return (
                <div key={m.id} className={`bd-maint${inWindow ? " bd-maint-flagged" : ""}`}>
                  <div className="bd-maint-top">
                    <span className="bd-maint-type">{m.type}</span>
                    <Tag minimal round>{m.status}</Tag>
                    <span className="bd-maint-date">{fmtDate(when)}</span>
                    {inWindow && (
                      <Tag intent="warning" minimal icon="warning-sign">
                        During fermentation
                      </Tag>
                    )}
                  </div>
                  {m.notes && <div className="bd-maint-notes">{m.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ---- Quality Tests ---- */}
      <Section title="Quality Tests" count={qualityTests.length} defaultOpen>
        {qualityTests.length === 0 ? (
          <div className="bd-dim bd-pad">No quality tests recorded.</div>
        ) : (
          <div className="bd-qt-list">
            {[...qualityTests]
              .sort((a, b) => (b.test_date ?? "").localeCompare(a.test_date ?? ""))
              .map((qt) => (
                <div key={qt.id} className="bd-qt">
                  <div className="bd-qt-top">
                    <span className="bd-qt-date">{fmtDate(qt.test_date)}</span>
                    <span className="bd-qt-metric">pH {num(qt.ph) ?? "—"}</span>
                    <span className="bd-qt-metric">sugar {num(qt.sugar_level) ?? "—"}</span>
                    {qt.tested_by && <span className="bd-qt-tester">{qt.tested_by}</span>}
                  </div>
                  {qt.notes && <div className="bd-qt-notes">{qt.notes}</div>}
                </div>
              ))}
          </div>
        )}
      </Section>

      {/* ---- Audit ---- */}
      <Section title="Audit" count={audit.length} defaultOpen={false}>
        {audit.length === 0 ? (
          <div className="bd-dim bd-pad">No audit history.</div>
        ) : (
          <div className="bd-audit-list">
            {audit.map((entry, i) => (
              <AuditRow key={`${entry.timestamp}-${i}`} entry={entry} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function SugarCurve({
  curve,
  day,
  target,
}: {
  curve: Record<string, number> | null;
  day: number | null;
  target: number | null;
}) {
  const points = useMemo(
    () =>
      curve
        ? Object.entries(curve)
            .map(([k, v]) => [Number(k.replace(/^day_/, "")), Number(v)] as const)
            .filter(([d, v]) => Number.isFinite(d) && Number.isFinite(v))
            .sort((a, b) => a[0] - b[0])
        : [],
    [curve],
  );

  if (points.length === 0) return <div className="bd-dim bd-pad">No curve defined.</div>;

  // The milestone at or just below the current day marks the active phase.
  const activeDay =
    day === null ? null : points.reduce<number | null>((acc, [d]) => (d <= day ? d : acc), null);

  return (
    <div className="bd-curve">
      <div className="bd-curve-points">
        {points.map(([d, v]) => (
          <span key={d} className={`bd-curve-pt${d === activeDay ? " bd-curve-pt-active" : ""}`}>
            <span className="bd-curve-pt-day">d{d}</span>
            <span className="bd-curve-pt-val">{v.toFixed(3)}</span>
          </span>
        ))}
      </div>
      {day !== null && target !== null && (
        <div className="bd-curve-target">
          Target at day {day}: <strong>{target.toFixed(3)}</strong>
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = entry.params != null || entry.result != null;
  return (
    <div className="bd-audit">
      <button
        type="button"
        className="bd-audit-head"
        onClick={() => hasDetail && setOpen((o) => !o)}
        disabled={!hasDetail}
      >
        {hasDetail && <Icon icon={open ? "chevron-down" : "chevron-right"} size={12} />}
        <Tag minimal round>{entry.action}</Tag>
        <span className="bd-audit-actor">{entry.actor}</span>
        <span className="bd-audit-time">{fmtDateTime(entry.timestamp)}</span>
      </button>
      <Collapse isOpen={open}>
        <div className="bd-audit-body">
          {entry.params != null && (
            <>
              <div className="bd-audit-k">params</div>
              <pre className="bd-json">{JSON.stringify(entry.params, null, 2)}</pre>
            </>
          )}
          {entry.result != null && (
            <>
              <div className="bd-audit-k">result</div>
              <pre className="bd-json">{JSON.stringify(entry.result, null, 2)}</pre>
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bd-section">
      <button type="button" className="bd-section-head" onClick={() => setOpen((o) => !o)}>
        <Icon icon={open ? "chevron-down" : "chevron-right"} size={14} className="bd-section-caret" />
        <span className="bd-section-title">{title}</span>
        {count !== undefined && (
          <Tag minimal round className="bd-section-count">
            {count}
          </Tag>
        )}
      </button>
      <Collapse isOpen={open}>
        <div className="bd-section-body">{children}</div>
      </Collapse>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bd-row">
      <span className="bd-row-label">{label}</span>
      <span className="bd-row-value">{children}</span>
    </div>
  );
}
