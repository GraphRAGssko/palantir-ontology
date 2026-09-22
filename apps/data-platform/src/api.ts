export interface TypeSummary {
  id: string;
  api_name: string;
  name: string;
  description: string | null;
  status: string | null;
  visibility: string | null;
  point_of_contact: string | null;
  edits_enabled: boolean | null;
  schema: string | null;
  datasource_table: string | null;
  instance_count: number;
}

export interface Property {
  id: string;
  api_name: string;
  name: string;
  object_type_id: string | null;
  data_type: string | null;
  required: boolean | null;
  is_title: boolean | null;
  is_primary_key: boolean | null;
  datasource_column: string | null;
}

export interface Link {
  id: string;
  api_name: string;
  name: string;
  inverse_api_name: string | null;
  inverse_name: string | null;
  source_type_id: string | null;
  target_type_id: string | null;
  via_property_id: string | null;
  cardinality: string | null;
}

export interface ActionType {
  id: string;
  api_name: string;
  name: string;
  object_type_id: string | null;
  description: string | null;
  parameter_schema: unknown;
}

export interface TypeDetail extends TypeSummary {
  properties: Property[];
  outboundLinks: Link[];
  inboundLinks: Link[];
  actions: ActionType[];
}

export interface InstanceDetail {
  properties: Record<string, unknown>;
  links: Record<string, { apiName: string; name: string; data: unknown }>;
}

// ---- Fetch helpers ----

const META = "/api/objects/meta";

export async function fetchTypes(): Promise<TypeSummary[]> {
  const res = await fetch(`${META}/types`);
  return res.json();
}

export async function fetchTypeDetail(apiName: string): Promise<TypeDetail> {
  const res = await fetch(`${META}/types/${apiName}`);
  return res.json();
}

export async function patchType(
  apiName: string,
  updates: { name?: string; description?: string },
): Promise<TypeSummary> {
  const res = await fetch(`${META}/types/${apiName}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function fetchInstances(
  type: string,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/objects/${type}`);
  return res.json();
}

export async function fetchInstance(
  type: string,
  id: string,
): Promise<InstanceDetail> {
  const res = await fetch(`/api/objects/${type}/${id}`);
  return res.json();
}

export interface AuditEntry {
  action_api_name: string | null;
  actor: string | null;
  params: unknown;
  result: unknown;
  created_at: string | null;
}

export async function fetchAudit(
  type: string,
  id: string,
): Promise<AuditEntry[]> {
  const res = await fetch(`/api/objects/${type}/${id}/audit`);
  return res.json();
}

export async function invokeAction(
  type: string,
  id: string,
  actionName: string,
  params: Record<string, unknown>,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
> {
  const res = await fetch(`/api/objects/${type}/${id}/actions/${actionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (res.ok) return { ok: true, data: body as Record<string, unknown> };
  return {
    ok: false,
    error: (body as { error?: string }).error ?? "Action failed",
  };
}
