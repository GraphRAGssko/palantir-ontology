import { useEffect, useState } from "react";
import {
  Card,
  Code,
  EditableText,
  H5,
  HTMLTable,
  Icon,
  Tag,
} from "@blueprintjs/core";
import { patchType } from "./api";
import type { TypeDetail, TypeSummary } from "./api";

interface Props {
  detail: TypeDetail;
  instanceCount: number;
  types: TypeSummary[];
  onUpdate: () => void;
}

function dataTypeIcon(dt: string | null) {
  switch (dt) {
    case "string":
      return "citation" as const;
    case "number":
    case "integer":
      return "numerical" as const;
    case "datetime":
      return "calendar" as const;
    case "json":
      return "code" as const;
    case "array":
    case "array<string>":
      return "properties" as const;
    default:
      return "dot" as const;
  }
}

export function OntologyManager({
  detail,
  instanceCount,
  types,
  onUpdate,
}: Props) {
  const [name, setName] = useState(detail.name);
  const [desc, setDesc] = useState(detail.description ?? "");

  useEffect(() => setName(detail.name), [detail.name]);
  useEffect(() => setDesc(detail.description ?? ""), [detail.description]);

  const typeById = new Map(types.map((t) => [t.id, t]));

  const handleNameConfirm = async (val: string) => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== detail.name) {
      await patchType(detail.api_name, { name: trimmed });
      onUpdate();
    } else {
      setName(detail.name);
    }
  };

  const handleDescConfirm = async (val: string) => {
    if (val !== (detail.description ?? "")) {
      await patchType(detail.api_name, { description: val });
      onUpdate();
    }
  };

  const allLinks = [
    ...detail.outboundLinks.map((l) => ({ ...l, direction: "outbound" as const })),
    ...detail.inboundLinks.map((l) => ({ ...l, direction: "inbound" as const })),
  ];

  return (
    <div>
      {/* ---- Header ---- */}
      <div className="type-header">
        <Icon icon="cube" size={28} className="type-header-icon" />
        <div style={{ flex: 1 }}>
          <EditableText
            value={name}
            onChange={setName}
            onConfirm={handleNameConfirm}
            className="type-name-edit"
            selectAllOnFocus
          />
          <div className="type-subtitle">
            Object type &middot; {instanceCount.toLocaleString()} objects
          </div>
        </div>
      </div>

      {/* ---- Metadata card ---- */}
      <Card className="meta-card">
        <div className="meta-grid">
          <div className="meta-left">
            <div className="meta-row">
              <span className="meta-label">Description</span>
              <div className="meta-value">
                <EditableText
                  value={desc}
                  onChange={setDesc}
                  onConfirm={handleDescConfirm}
                  multiline
                  minLines={1}
                  maxLines={4}
                  placeholder="Add a description..."
                  selectAllOnFocus
                />
              </div>
            </div>
            <div className="meta-row">
              <span className="meta-label">API name</span>
              <Code>{detail.api_name}</Code>
            </div>
            <div className="meta-row">
              <span className="meta-label">Schema</span>
              <Code>{detail.schema ?? "\u2014"}</Code>
            </div>
            <div className="meta-row">
              <span className="meta-label">Datasource table</span>
              <Code>{detail.datasource_table ?? "\u2014"}</Code>
            </div>
          </div>

          <div className="meta-right">
            <div className="meta-row">
              <span className="meta-label">Status</span>
              <Tag minimal round>
                {detail.status ?? "\u2014"}
              </Tag>
            </div>
            <div className="meta-row">
              <span className="meta-label">Visibility</span>
              <Tag minimal round>
                {detail.visibility ?? "\u2014"}
              </Tag>
            </div>
            <div className="meta-row">
              <span className="meta-label">Edits</span>
              <Tag
                minimal
                round
                intent={detail.edits_enabled ? "success" : "none"}
              >
                {detail.edits_enabled ? "Enabled" : "Disabled"}
              </Tag>
            </div>
            <div className="meta-row">
              <span className="meta-label">ID</span>
              <Code className="id-mono">{detail.id}</Code>
            </div>
          </div>
        </div>
      </Card>

      {/* ---- Properties + Actions ---- */}
      <div className="bottom-grid">
        <Card>
          <div className="section-header">
            <H5>Properties</H5>
            <Tag round minimal>
              {detail.properties.length}
            </Tag>
          </div>
          {detail.properties.map((p) => (
            <div className="prop-row" key={p.id}>
              <Icon icon={dataTypeIcon(p.data_type)} className="prop-icon" />
              <span className="prop-name">{p.name}</span>
              {p.is_title && (
                <Tag intent="primary" minimal>
                  Title
                </Tag>
              )}
              {p.is_primary_key && (
                <Tag intent="warning" minimal>
                  Primary key
                </Tag>
              )}
            </div>
          ))}
        </Card>

        <Card>
          <div className="section-header">
            <H5>Action types</H5>
            <Tag round minimal>
              {detail.actions.length}
            </Tag>
          </div>
          {detail.actions.length > 0 ? (
            detail.actions.map((a) => (
              <div className="action-row" key={a.id}>
                <Icon icon="play" className="prop-icon" />
                <div>
                  <div>{a.name}</div>
                  {a.description && (
                    <div className="type-subtitle">{a.description}</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No action types defined</div>
          )}
        </Card>
      </div>

      {/* ---- Links ---- */}
      <Card className="link-card">
        <div className="section-header">
          <H5>Link types</H5>
          <Tag round minimal>
            {allLinks.length}
          </Tag>
        </div>
        {allLinks.length > 0 ? (
          <HTMLTable compact striped className="link-table">
            <thead>
              <tr>
                <th>Link</th>
                <th>Direction</th>
                <th>Related type</th>
                <th>Cardinality</th>
              </tr>
            </thead>
            <tbody>
              {allLinks.map((l) => {
                const isOut = l.direction === "outbound";
                const relatedId = isOut ? l.target_type_id : l.source_type_id;
                const related = relatedId ? typeById.get(relatedId) : undefined;
                const linkName = isOut ? l.name : (l.inverse_name ?? l.name);
                const linkApi = isOut
                  ? l.api_name
                  : (l.inverse_api_name ?? l.api_name);
                return (
                  <tr key={l.id + l.direction}>
                    <td>
                      {linkName}
                      <Code className="link-api-name">{linkApi}</Code>
                    </td>
                    <td>
                      <Tag
                        minimal
                        intent={isOut ? "primary" : "success"}
                        icon={isOut ? "arrow-right" : "arrow-left"}
                      >
                        {l.direction}
                      </Tag>
                    </td>
                    <td>{related?.name ?? "\u2014"}</td>
                    <td>
                      <Code>{l.cardinality ?? "\u2014"}</Code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </HTMLTable>
        ) : (
          <div className="empty">No link types defined</div>
        )}
      </Card>
    </div>
  );
}
