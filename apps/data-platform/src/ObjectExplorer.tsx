import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Callout,
  Card,
  Code,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  H3,
  H5,
  HTMLSelect,
  HTMLTable,
  Icon,
  InputGroup,
  Menu,
  MenuItem,
  NumericInput,
  Spinner,
  Switch,
  Tag,
  Tooltip,
} from "@blueprintjs/core";
import { DateInput3 } from "@blueprintjs/datetime2";
import {
  fetchInstance,
  fetchInstances,
  fetchTypeDetail,
  fetchTypes,
  invokeAction,
} from "./api";
import type { ActionType, InstanceDetail, TypeDetail, TypeSummary } from "./api";

import "@blueprintjs/datetime2/lib/css/blueprint-datetime2.css";

// ---- JSON Schema types -----------------------------------------------

interface JsonSchemaProperty {
  type: string;
  format?: string;
  description?: string;
  enum?: string[];
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ---- Navigation stack ------------------------------------------------

type NavState =
  | { view: "list"; type: string }
  | { view: "detail"; type: string; id: string };

// ---- Search helper ---------------------------------------------------

function matchesQuery(
  instance: Record<string, unknown>,
  meta: TypeDetail,
  q: string,
): boolean {
  const lower = q.toLowerCase();
  for (const prop of meta.properties) {
    if (prop.data_type === "boolean") continue;
    const val = instance[prop.api_name];
    if (val == null) continue;
    const str = Array.isArray(val) ? val.join(" ") : String(val);
    if (str.toLowerCase().includes(lower)) return true;
  }
  return false;
}

// ---- All-types data cache --------------------------------------------

interface AllTypesData {
  instances: Map<string, Record<string, unknown>[]>;
  metas: Map<string, TypeDetail>;
}

// ---- Root component --------------------------------------------------

export function ObjectExplorer() {
  const [types, setTypes] = useState<TypeSummary[]>([]);
  const [navStack, setNavStack] = useState<NavState[]>([]);

  // Search state
  const [query, setQuery] = useState("");
  const [searchAll, setSearchAll] = useState(false);
  const [allData, setAllData] = useState<AllTypesData | null>(null);

  useEffect(() => {
    fetchTypes().then(setTypes);
  }, []);

  useEffect(() => {
    if (types.length > 0 && navStack.length === 0) {
      setNavStack([{ view: "list", type: types[0]!.api_name }]);
    }
  }, [types, navStack.length]);

  // Load all types' data when cross-type search is first activated
  useEffect(() => {
    if (searchAll && !allData && types.length > 0) {
      Promise.all(
        types.map(async (t) => ({
          apiName: t.api_name,
          instances: await fetchInstances(t.api_name),
          meta: await fetchTypeDetail(t.api_name),
        })),
      ).then((results) => {
        const instances = new Map<string, Record<string, unknown>[]>();
        const metas = new Map<string, TypeDetail>();
        for (const r of results) {
          instances.set(r.apiName, r.instances);
          metas.set(r.apiName, r.meta);
        }
        setAllData({ instances, metas });
      });
    }
  }, [searchAll, allData, types]);

  const current = navStack.at(-1);
  const selectedType = current?.type ?? null;
  const showSearch = current?.view !== "detail";
  const showCrossType =
    showSearch && searchAll && query.trim().length > 0;

  function selectType(apiName: string) {
    setNavStack([{ view: "list", type: apiName }]);
  }
  function openDetail(type: string, id: string) {
    setNavStack((prev) => [...prev, { view: "detail", type, id }]);
  }
  function goBack() {
    setNavStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

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
              labelElement={
                <span className="rail-count">{t.instance_count}</span>
              }
              active={selectedType === t.api_name}
              onClick={() => selectType(t.api_name)}
            />
          ))}
        </Menu>
      </aside>

      <main className="main-content">
        {/* ---- Search bar ---- */}
        {showSearch && (
          <div className="search-bar">
            <InputGroup
              leftIcon="search"
              placeholder="Search objects\u2026"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rightElement={
                query ? (
                  <Button
                    icon="cross"
                    minimal
                    onClick={() => setQuery("")}
                  />
                ) : undefined
              }
              fill
            />
            <Switch
              label="All types"
              checked={searchAll}
              onChange={() => setSearchAll((v) => !v)}
              className="search-all-switch"
            />
          </div>
        )}

        {/* ---- Cross-type search results ---- */}
        {showCrossType && (
          allData ? (
            <CrossTypeResults
              query={query}
              types={types}
              allData={allData}
              onSelect={openDetail}
            />
          ) : (
            <Spinner />
          )
        )}

        {/* ---- Single-type instance list ---- */}
        {!showCrossType && current?.view === "list" && (
          <InstanceList
            typeApiName={current.type}
            types={types}
            query={query}
            onSelect={(id) => openDetail(current.type, id)}
          />
        )}

        {/* ---- Object detail ---- */}
        {current?.view === "detail" && (
          <ObjectDetailView
            typeApiName={current.type}
            instanceId={current.id}
            types={types}
            onNavigate={openDetail}
            canGoBack={navStack.length > 1}
            onBack={goBack}
          />
        )}

        {!current && !showCrossType && (
          <div className="empty">Select an object type</div>
        )}
      </main>
    </>
  );
}

// ---- Cross-type search results ---------------------------------------

function CrossTypeResults({
  query,
  types,
  allData,
  onSelect,
}: {
  query: string;
  types: TypeSummary[];
  allData: AllTypesData;
  onSelect: (type: string, id: string) => void;
}) {
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const out: {
      type: TypeSummary;
      meta: TypeDetail;
      matches: Record<string, unknown>[];
    }[] = [];
    for (const t of types) {
      const instances = allData.instances.get(t.api_name);
      const meta = allData.metas.get(t.api_name);
      if (!instances || !meta) continue;
      const matches = instances.filter((inst) =>
        matchesQuery(inst, meta, q),
      );
      if (matches.length > 0) out.push({ type: t, meta, matches });
    }
    return out;
  }, [query, types, allData]);

  if (!query.trim()) {
    return <div className="empty">Type to search across all types</div>;
  }

  const total = results.reduce((s, r) => s + r.matches.length, 0);

  if (total === 0) {
    return <div className="empty">No results for &ldquo;{query}&rdquo;</div>;
  }

  return (
    <div>
      <div className="type-subtitle" style={{ marginBottom: 20 }}>
        {total} result{total !== 1 ? "s" : ""} across{" "}
        {results.length} type{results.length !== 1 ? "s" : ""}
      </div>
      {results.map(({ type, meta, matches }) => {
        const titleProp = meta.properties.find((p) => p.is_title);
        const titleKey = titleProp?.api_name ?? "id";
        return (
          <div key={type.api_name} className="search-type-group">
            <div className="search-group-header">
              <Icon icon="cube" className="prop-icon" />
              <H5 style={{ margin: 0 }}>{type.name}</H5>
              <Tag minimal round>
                {matches.length}
              </Tag>
            </div>
            <HTMLTable
              interactive
              striped
              compact
              className="instance-table"
            >
              <thead>
                <tr>
                  <th>{titleProp?.name ?? "ID"}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((inst) => {
                  const id = String(inst["id"] ?? "");
                  return (
                    <tr
                      key={id}
                      onClick={() => onSelect(type.api_name, id)}
                    >
                      <td>{String(inst[titleKey] ?? "\u2014")}</td>
                      <td>
                        <Tag minimal round>
                          {String(inst["status"] ?? "\u2014")}
                        </Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </HTMLTable>
          </div>
        );
      })}
    </div>
  );
}

// ---- Instance list ---------------------------------------------------

function InstanceList({
  typeApiName,
  types,
  query,
  onSelect,
}: {
  typeApiName: string;
  types: TypeSummary[];
  query: string;
  onSelect: (id: string) => void;
}) {
  const [instances, setInstances] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<TypeDetail | null>(null);

  useEffect(() => {
    fetchInstances(typeApiName).then(setInstances);
    fetchTypeDetail(typeApiName).then(setMeta);
  }, [typeApiName]);

  const filtered = useMemo(() => {
    if (!meta || !query.trim()) return instances;
    return instances.filter((inst) => matchesQuery(inst, meta, query));
  }, [instances, meta, query]);

  if (!meta) return null;

  const titleProp = meta.properties.find((p) => p.is_title);
  const titleKey = titleProp?.api_name ?? "id";
  const typeName =
    types.find((t) => t.api_name === typeApiName)?.name ?? typeApiName;

  return (
    <div>
      <H3>{typeName}</H3>
      <div className="type-subtitle" style={{ marginBottom: 16 }}>
        {filtered.length === instances.length
          ? `${instances.length} object${instances.length !== 1 ? "s" : ""}`
          : `${filtered.length} of ${instances.length} objects`}
      </div>
      <HTMLTable interactive striped compact className="instance-table">
        <thead>
          <tr>
            <th>{titleProp?.name ?? "ID"}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((inst) => {
            const id = String(inst["id"] ?? "");
            return (
              <tr key={id} onClick={() => onSelect(id)}>
                <td>{String(inst[titleKey] ?? "\u2014")}</td>
                <td>
                  <Tag minimal round>
                    {String(inst["status"] ?? "\u2014")}
                  </Tag>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && query.trim() && (
            <tr>
              <td colSpan={2} className="empty">
                No results for &ldquo;{query}&rdquo;
              </td>
            </tr>
          )}
        </tbody>
      </HTMLTable>
    </div>
  );
}

// ---- Object detail ---------------------------------------------------

function ObjectDetailView({
  typeApiName,
  instanceId,
  types,
  onNavigate,
  canGoBack,
  onBack,
}: {
  typeApiName: string;
  instanceId: string;
  types: TypeSummary[];
  onNavigate: (type: string, id: string) => void;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const [data, setData] = useState<InstanceDetail | null>(null);
  const [meta, setMeta] = useState<TypeDetail | null>(null);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);

  const refresh = () => fetchInstance(typeApiName, instanceId).then(setData);

  useEffect(() => {
    setData(null);
    setMeta(null);
    fetchInstance(typeApiName, instanceId).then(setData);
    fetchTypeDetail(typeApiName).then(setMeta);
  }, [typeApiName, instanceId]);

  if (!data || !meta) return null;

  const titleProp = meta.properties.find((p) => p.is_title);
  const titleKey = titleProp?.api_name ?? "id";
  const title = String(data.properties[titleKey] ?? instanceId);
  const typeName =
    types.find((t) => t.api_name === typeApiName)?.name ?? typeApiName;

  const typeById = new Map(types.map((t) => [t.id, t]));
  const linkTargetType = new Map<string, string>();
  for (const l of meta.outboundLinks) {
    if (l.target_type_id) {
      const tt = typeById.get(l.target_type_id);
      if (tt) linkTargetType.set(l.api_name, tt.api_name);
    }
  }
  for (const l of meta.inboundLinks) {
    if (l.source_type_id && l.inverse_api_name) {
      const st = typeById.get(l.source_type_id);
      if (st) linkTargetType.set(l.inverse_api_name, st.api_name);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="detail-header">
        {canGoBack && (
          <Button icon="arrow-left" minimal onClick={onBack} />
        )}
        <Icon icon="cube" size={28} className="detail-header-icon" />
        <div>
          <H3>{title}</H3>
          <div className="type-subtitle">{typeName}</div>
        </div>
      </div>

      {/* Action strip */}
      {meta.actions.length > 0 && (
        <div className="action-strip">
          {meta.actions.map((a) => (
            <Tooltip key={a.id} content={a.description ?? a.name}>
              <Button
                icon="play"
                text={a.name}
                outlined
                onClick={() => setActiveAction(a)}
              />
            </Tooltip>
          ))}
        </div>
      )}

      {/* Two columns */}
      <div className="detail-columns">
        <Card>
          <div className="section-header">
            <H5>Properties</H5>
          </div>
          {meta.properties.map((prop) => (
            <div className="detail-prop-row" key={prop.api_name}>
              <span className="detail-prop-label">{prop.name}</span>
              <span className="detail-prop-value">
                {formatValue(data.properties[prop.api_name], prop.data_type)}
              </span>
            </div>
          ))}
        </Card>

        <Card>
          <div className="section-header">
            <H5>Links</H5>
          </div>
          {Object.keys(data.links).length > 0 ? (
            Object.entries(data.links).map(([key, link]) => (
              <div className="link-group" key={key}>
                <div className="link-group-title">{link.name}</div>
                <div className="linked-objects">
                  {renderLinkedObjects(
                    link.data,
                    linkTargetType.get(key),
                    onNavigate,
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No links</div>
          )}
        </Card>
      </div>

      {/* Action dialog */}
      {activeAction && (
        <ActionDialog
          action={activeAction}
          typeApiName={typeApiName}
          instanceId={instanceId}
          onClose={() => setActiveAction(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}

// ---- Action dialog ---------------------------------------------------

function ActionDialog({
  action,
  typeApiName,
  instanceId,
  onClose,
  onSuccess,
}: {
  action: ActionType;
  typeApiName: string;
  instanceId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const schema = action.parameter_schema as JsonSchema | null;
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);

  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setValues({});
    setResult(null);
    setLoading(false);
  }, [action.id]);

  const setValue = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    for (const key of required) {
      if (!values[key]?.trim()) {
        setResult({
          ok: false,
          message: `"${properties[key]?.description ?? key}" is required`,
        });
        return;
      }
    }

    const params: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const raw = values[key];
      if (raw === undefined || raw === "") continue;
      if (prop.type === "number" || prop.type === "integer") {
        params[key] = Number(raw);
      } else if (prop.format === "date-time") {
        params[key] = new Date(raw).toISOString();
      } else {
        params[key] = raw;
      }
    }

    setLoading(true);
    setResult(null);
    const res = await invokeAction(
      typeApiName,
      instanceId,
      action.api_name,
      params,
    );
    setLoading(false);

    if (res.ok) {
      setResult({ ok: true, message: "Action completed successfully" });
      onSuccess();
    } else {
      setResult({ ok: false, message: res.error });
    }
  };

  return (
    <Dialog isOpen onClose={onClose} title={action.name}>
      <DialogBody>
        {action.description && (
          <p className="action-dialog-desc">{action.description}</p>
        )}
        {Object.entries(properties).map(([key, prop]) => (
          <FormGroup
            key={key}
            label={prop.description ?? key}
            labelInfo={required.has(key) ? "(required)" : undefined}
          >
            <SchemaField
              prop={prop}
              value={values[key] ?? ""}
              onChange={(v) => setValue(key, v)}
            />
          </FormGroup>
        ))}
        {result && (
          <Callout
            intent={result.ok ? "success" : "danger"}
            style={{ marginTop: 12 }}
          >
            {result.message}
          </Callout>
        )}
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button text="Close" onClick={onClose} />
            <Button
              text="Run"
              intent="primary"
              icon="play"
              onClick={handleSubmit}
              loading={loading}
              disabled={!!result?.ok}
            />
          </>
        }
      />
    </Dialog>
  );
}

// ---- Schema-driven form field ----------------------------------------

function SchemaField({
  prop,
  value,
  onChange,
}: {
  prop: JsonSchemaProperty;
  value: string;
  onChange: (v: string) => void;
}) {
  if (prop.enum) {
    return (
      <HTMLSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fill
      >
        <option value="">Select...</option>
        {prop.enum.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </HTMLSelect>
    );
  }

  if (prop.type === "number" || prop.type === "integer") {
    return (
      <NumericInput
        value={value}
        onValueChange={(_num, str) => onChange(str)}
        fill
        buttonPosition="none"
      />
    );
  }

  if (prop.format === "date-time") {
    const dateValue = value ? new Date(value) : null;
    return (
      <DateInput3
        value={dateValue ? dateValue.toISOString() : null}
        onChange={(newIso) => onChange(newIso ?? "")}
        timePrecision="minute"
        fill
        dateFnsFormat="yyyy-MM-dd HH:mm"
      />
    );
  }

  return (
    <InputGroup
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fill
    />
  );
}

// ---- Helpers ---------------------------------------------------------

function formatValue(value: unknown, dataType: string | null): ReactNode {
  if (value == null) return "\u2014";
  switch (dataType) {
    case "datetime": {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    }
    case "number":
    case "integer": {
      const n = Number(value);
      return isNaN(n) ? String(value) : n.toLocaleString();
    }
    case "json":
      return <Code>{JSON.stringify(value, null, 2)}</Code>;
    case "array":
    case "array<string>":
      if (Array.isArray(value)) {
        return value.length > 0 ? (
          <span>
            {value.map((v, i) => (
              <Tag key={i} minimal style={{ marginRight: 4, marginBottom: 2 }}>
                {String(v)}
              </Tag>
            ))}
          </span>
        ) : (
          "\u2014"
        );
      }
      return String(value);
    default:
      return String(value);
  }
}

function renderLinkedObjects(
  data: unknown,
  targetType: string | undefined,
  onNavigate: (type: string, id: string) => void,
): ReactNode {
  if (data == null) return <span className="empty">{"\u2014"}</span>;
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return <span className="empty">None</span>;
  return items.map((obj, i) => {
    const record = obj as Record<string, unknown>;
    const id = String(record["id"] ?? "");
    const label = String(record["name"] ?? record["id"] ?? "?");
    return (
      <Tag
        key={i}
        interactive
        intent="none"
        className="linked-tag"
        onClick={() => targetType && onNavigate(targetType, id)}
        rightIcon={targetType ? "arrow-right" : undefined}
      >
        {label}
      </Tag>
    );
  });
}
