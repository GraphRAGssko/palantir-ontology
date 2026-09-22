import { Hono } from "hono";
import { sql } from "kysely";
import { db, INSTANCE_SCHEMAS } from "../db.ts";

const objects = new Hono();

/**
 * Look up an object_type by api_name, searching all allowed schemas.
 * Validates the instance schema before returning.
 */
async function findObjectType(apiName: string) {
  for (const s of INSTANCE_SCHEMAS) {
    const ot = await db
      .withSchema(s)
      .selectFrom("object_type")
      .selectAll()
      .where("api_name", "=", apiName)
      .executeTakeFirst();
    if (ot) {
      if (!INSTANCE_SCHEMAS.has(ot.schema)) return undefined;
      return { metaSchema: s, objectType: ot };
    }
  }
  return undefined;
}

// GET /:type — list instances with optional query-param filters
objects.get("/:type", async (c) => {
  const found = await findObjectType(c.req.param("type"));
  if (!found) return c.json({ error: "Unknown type" }, 404);

  const { metaSchema, objectType } = found;
  const { schema, datasource_table } = objectType;

  // Fetch properties to validate filter params
  const properties = await db
    .withSchema(metaSchema)
    .selectFrom("property")
    .selectAll()
    .where("object_type_id", "=", objectType.id)
    .execute();

  const propsByApiName = new Map(properties.map((p) => [p.api_name, p]));

  // Collect valid filters from query string
  const filters: { column: string; value: string }[] = [];
  for (const [key, value] of Object.entries(c.req.query())) {
    const prop = propsByApiName.get(key);
    if (prop) {
      filters.push({ column: prop.datasource_column, value });
    }
  }

  // Build query using parameterized values and quoted identifiers
  let query = sql`SELECT * FROM ${sql.id(schema, datasource_table)}`;

  if (filters.length > 0) {
    const conditions = filters.map(
      (f) => sql`${sql.id(f.column)} = ${f.value}`,
    );
    query = sql`${query} WHERE ${sql.join(conditions, sql` AND `)}`;
  }

  const { rows } = await query.execute(db);
  return c.json(rows);
});

// GET /:type/:id — get one instance with bidirectional link resolution
objects.get("/:type/:id", async (c) => {
  const found = await findObjectType(c.req.param("type"));
  if (!found) return c.json({ error: "Unknown type" }, 404);

  const { metaSchema, objectType } = found;
  const { schema, datasource_table } = objectType;
  const instanceId = c.req.param("id");

  const metaDb = db.withSchema(metaSchema);

  // Get PK column for this type
  const pkProp = await metaDb
    .selectFrom("property")
    .selectAll()
    .where("object_type_id", "=", objectType.id)
    .where("is_primary_key", "=", true)
    .executeTakeFirstOrThrow();

  // Fetch the instance
  const { rows } = await sql`
    SELECT * FROM ${sql.id(schema, datasource_table)}
    WHERE ${sql.id(pkProp.datasource_column)} = ${instanceId}
  `.execute(db);

  if (rows.length === 0) return c.json({ error: "Not found" }, 404);

  const instance = rows[0] as Record<string, unknown>;

  // Fetch links in both directions
  const [outboundLinks, inboundLinks] = await Promise.all([
    metaDb
      .selectFrom("link")
      .selectAll()
      .where("source_type_id", "=", objectType.id)
      .execute(),
    metaDb
      .selectFrom("link")
      .selectAll()
      .where("target_type_id", "=", objectType.id)
      .execute(),
  ]);

  const links: Record<string, unknown> = {};

  const allLinks = [...outboundLinks, ...inboundLinks];
  if (allLinks.length > 0) {
    // Batch-fetch all related types and properties in 3 parallel queries
    const typeIds = new Set<string>();
    const propIds = new Set<string>();
    for (const link of allLinks) {
      typeIds.add(link.source_type_id);
      typeIds.add(link.target_type_id);
      propIds.add(link.via_property_id);
    }

    const [relatedTypes, viaProps, pkProps] = await Promise.all([
      metaDb
        .selectFrom("object_type")
        .selectAll()
        .where("id", "in", [...typeIds])
        .execute(),
      metaDb
        .selectFrom("property")
        .selectAll()
        .where("id", "in", [...propIds])
        .execute(),
      metaDb
        .selectFrom("property")
        .selectAll()
        .where("object_type_id", "in", [...typeIds])
        .where("is_primary_key", "=", true)
        .execute(),
    ]);

    const typeMap = new Map(relatedTypes.map((t) => [t.id, t]));
    const propMap = new Map(viaProps.map((p) => [p.id, p]));
    const pkByType = new Map(pkProps.map((p) => [p.object_type_id, p]));

    // --- Outbound: follow FK on this instance → target row ---
    for (const link of outboundLinks) {
      const viaProp = propMap.get(link.via_property_id);
      if (!viaProp?.datasource_column) continue;

      const fkValue = instance[viaProp.datasource_column];
      if (fkValue == null) {
        links[link.api_name] = null;
        continue;
      }

      const targetType = typeMap.get(link.target_type_id);
      if (!targetType?.schema || !targetType.datasource_table) continue;
      if (!INSTANCE_SCHEMAS.has(targetType.schema)) continue;

      const targetPk = pkByType.get(link.target_type_id);
      if (!targetPk?.datasource_column) continue;

      const { rows: targetRows } = await sql`
        SELECT * FROM ${sql.id(targetType.schema, targetType.datasource_table)}
        WHERE ${sql.id(targetPk.datasource_column)} = ${fkValue}
      `.execute(db);

      links[link.api_name] =
        link.cardinality === "many_to_one" ? (targetRows[0] ?? null) : targetRows;
    }

    // --- Inbound: find source rows whose FK matches this PK ---
    for (const link of inboundLinks) {
      const viaProp = propMap.get(link.via_property_id);
      if (!viaProp?.datasource_column) continue;

      const sourceType = typeMap.get(link.source_type_id);
      if (!sourceType?.schema || !sourceType.datasource_table) continue;
      if (!INSTANCE_SCHEMAS.has(sourceType.schema)) continue;

      const pkValue = instance[pkProp.datasource_column];

      const { rows: sourceRows } = await sql`
        SELECT * FROM ${sql.id(sourceType.schema, sourceType.datasource_table)}
        WHERE ${sql.id(viaProp.datasource_column)} = ${pkValue}
      `.execute(db);

      links[link.inverse_api_name] = sourceRows;
    }
  }

  return c.json({ ...instance, links });
});

export default objects;
