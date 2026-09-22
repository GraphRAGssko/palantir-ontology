import { Hono } from "hono";
import { sql, type RawBuilder } from "kysely";
import { db } from "../db.ts";

const INSTANCE_SCHEMAS = new Set(["manufacturing"]);

const app = new Hono();

// ---- Helpers ----------------------------------------------------------

async function resolveType(apiName: string) {
  for (const schema of INSTANCE_SCHEMAS) {
    const objectType = await db
      .withSchema(schema)
      .selectFrom("object_type")
      .selectAll()
      .where("api_name", "=", apiName)
      .executeTakeFirst();
    if (objectType?.schema && objectType.datasource_table) {
      return { schema, objectType: objectType as typeof objectType & { schema: string; datasource_table: string } };
    }
  }
  return null;
}

type Row = Record<string, unknown>;
type Prop = { api_name: string; datasource_column: string };

/** Filter to properties that have a non-null datasource_column. */
function usableProps(
  props: Array<{ api_name: string; datasource_column: string | null }>,
): Prop[] {
  return props.filter(
    (p): p is typeof p & { datasource_column: string } =>
      p.datasource_column != null,
  );
}

function mapRow(row: Row, properties: Prop[]): Row {
  const mapped: Row = {};
  for (const p of properties) {
    if (p.datasource_column in row) {
      mapped[p.api_name] = row[p.datasource_column];
    }
  }
  return mapped;
}

// ---- Routes -----------------------------------------------------------

// GET /:type — list instances, with optional query-param filters
app.get("/:type", async (c) => {
  const resolved = await resolveType(c.req.param("type"));
  if (!resolved) return c.json({ error: "Unknown type" }, 404);

  const { objectType } = resolved;
  if (!INSTANCE_SCHEMAS.has(objectType.schema)) {
    return c.json({ error: "Invalid schema" }, 400);
  }

  const rawProps = await db
    .withSchema(resolved.schema)
    .selectFrom("property")
    .selectAll()
    .where("object_type_id", "=", objectType.id)
    .execute();

  const properties = usableProps(rawProps);
  const propByApi = new Map(properties.map((p) => [p.api_name, p]));

  // Build filter conditions — only recognised api_names become WHERE clauses
  const conditions: RawBuilder<unknown>[] = [];
  for (const [key, value] of Object.entries(c.req.query())) {
    const prop = propByApi.get(key);
    if (!prop) continue;
    conditions.push(sql`${sql.id(prop.datasource_column)} = ${value}`);
  }

  const base = sql`SELECT * FROM ${sql.id(objectType.schema, objectType.datasource_table)}`;
  const query =
    conditions.length > 0
      ? sql`${base} WHERE ${sql.join(conditions, sql` AND `)}`
      : base;

  const { rows } = await query.execute(db);
  return c.json((rows as Row[]).map((r) => mapRow(r, properties)));
});

// GET /:type/:id — single instance with one-hop bidirectional links
app.get("/:type/:id", async (c) => {
  const resolved = await resolveType(c.req.param("type"));
  if (!resolved) return c.json({ error: "Unknown type" }, 404);

  const { objectType } = resolved;
  if (!INSTANCE_SCHEMAS.has(objectType.schema)) {
    return c.json({ error: "Invalid schema" }, 400);
  }

  const instanceId = c.req.param("id");
  const mdb = db.withSchema(resolved.schema);

  // Pre-fetch all metadata in this schema (small tables, one round-trip each)
  const [allTypes, allRawProps, outLinks, inLinks] = await Promise.all([
    mdb.selectFrom("object_type").selectAll().execute(),
    mdb.selectFrom("property").selectAll().execute(),
    mdb
      .selectFrom("link")
      .selectAll()
      .where("source_type_id", "=", objectType.id)
      .execute(),
    mdb
      .selectFrom("link")
      .selectAll()
      .where("target_type_id", "=", objectType.id)
      .execute(),
  ]);

  const typeById = new Map(allTypes.map((t) => [t.id, t]));
  const propById = new Map(allRawProps.map((p) => [p.id, p]));
  const propsFor = (typeId: string) =>
    usableProps(allRawProps.filter((p) => p.object_type_id === typeId));

  const properties = propsFor(objectType.id);
  const pkProp = properties.find((p) => p.api_name === "id") ?? properties[0];
  if (!pkProp) return c.json({ error: "No primary key defined" }, 500);

  // Fetch the instance
  const { rows } = await sql`
    SELECT * FROM ${sql.id(objectType.schema, objectType.datasource_table)}
    WHERE ${sql.id(pkProp.datasource_column)} = ${instanceId}
  `.execute(db);

  const row = (rows as Row[])[0];
  if (!row) return c.json({ error: "Not found" }, 404);

  const links: Record<string, unknown> = {};

  // Outbound: source_type is this type → follow FK to one target
  for (const link of outLinks) {
    if (!link.via_property_id || !link.target_type_id) continue;

    const viaProp = propById.get(link.via_property_id);
    const targetType = typeById.get(link.target_type_id);
    if (!viaProp?.datasource_column || !targetType?.schema || !targetType.datasource_table)
      continue;
    if (!INSTANCE_SCHEMAS.has(targetType.schema)) continue;

    const fkValue = row[viaProp.datasource_column];
    if (fkValue == null) {
      links[link.api_name] = {
        apiName: link.api_name,
        name: link.name,
        data: null,
      };
      continue;
    }

    const targetProps = propsFor(targetType.id);
    const targetPk = targetProps[0];
    if (!targetPk) continue;

    const tgt = await sql`
      SELECT * FROM ${sql.id(targetType.schema, targetType.datasource_table)}
      WHERE ${sql.id(targetPk.datasource_column)} = ${fkValue}
    `.execute(db);

    const tgtRow = (tgt.rows as Row[])[0];
    links[link.api_name] = {
      apiName: link.api_name,
      name: link.name,
      data: tgtRow ? mapRow(tgtRow, targetProps) : null,
    };
  }

  // Inbound: target_type is this type → find source rows whose FK = our PK
  for (const link of inLinks) {
    if (!link.source_type_id || !link.via_property_id || !link.inverse_api_name)
      continue;

    const sourceType = typeById.get(link.source_type_id);
    const viaProp = propById.get(link.via_property_id);
    if (!sourceType?.schema || !sourceType.datasource_table || !viaProp?.datasource_column)
      continue;
    if (!INSTANCE_SCHEMAS.has(sourceType.schema)) continue;

    const sourceProps = propsFor(sourceType.id);

    const src = await sql`
      SELECT * FROM ${sql.id(sourceType.schema, sourceType.datasource_table)}
      WHERE ${sql.id(viaProp.datasource_column)} = ${instanceId}
    `.execute(db);

    const mapped = (src.rows as Row[]).map((r) => mapRow(r, sourceProps));

    // many_to_one inbound → array; one_to_one inbound → single
    links[link.inverse_api_name] = {
      apiName: link.inverse_api_name,
      name: link.inverse_name,
      data:
        link.cardinality === "one_to_one" ? (mapped[0] ?? null) : mapped,
    };
  }

  return c.json({ properties: mapRow(row, properties), links });
});

// GET /:type/:id/audit — audit log entries for an instance, newest first
app.get("/:type/:id/audit", async (c) => {
  const resolved = await resolveType(c.req.param("type"));
  if (!resolved) return c.json({ error: "Unknown type" }, 404);

  const { schema, objectType } = resolved;
  const instanceId = c.req.param("id");

  const entries = await db
    .withSchema(schema)
    .selectFrom("audit_log")
    .select([
      "action_api_name",
      "actor",
      "params",
      "result",
      "created_at",
    ])
    .where("target_type_id", "=", objectType.id)
    .where("target_id", "=", instanceId)
    .orderBy("created_at", "desc")
    .execute();

  return c.json(entries);
});

export default app;
