import { Hono } from "hono";
import { sql } from "kysely";
import { db } from "../db.ts";

const SCHEMA = "manufacturing";

const app = new Hono();

// GET /types — list all object types with instance counts
app.get("/types", async (c) => {
  const types = await db
    .withSchema(SCHEMA)
    .selectFrom("object_type")
    .selectAll()
    .execute();

  const withCounts = await Promise.all(
    types.map(async (t) => {
      if (!t.schema || !t.datasource_table) return { ...t, instance_count: 0 };
      try {
        const { rows } = await sql`
          SELECT count(*)::int AS n FROM ${sql.id(t.schema, t.datasource_table)}
        `.execute(db);
        return { ...t, instance_count: (rows as Array<{ n: number }>)[0]?.n ?? 0 };
      } catch {
        return { ...t, instance_count: 0 };
      }
    }),
  );

  return c.json(withCounts);
});

// GET /types/:type — full metadata bundle for one type
app.get("/types/:type", async (c) => {
  const apiName = c.req.param("type");
  const mdb = db.withSchema(SCHEMA);

  const objectType = await mdb
    .selectFrom("object_type")
    .selectAll()
    .where("api_name", "=", apiName)
    .executeTakeFirst();

  if (!objectType) return c.json({ error: "Unknown type" }, 404);

  const [properties, outboundLinks, inboundLinks, actions] = await Promise.all([
    mdb
      .selectFrom("property")
      .selectAll()
      .where("object_type_id", "=", objectType.id)
      .execute(),
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
    mdb
      .selectFrom("action_type")
      .selectAll()
      .where("object_type_id", "=", objectType.id)
      .execute(),
  ]);

  return c.json({
    ...objectType,
    properties,
    outboundLinks,
    inboundLinks,
    actions,
  });
});

// PATCH /types/:type — update display name and/or description
app.patch("/types/:type", async (c) => {
  const apiName = c.req.param("type");
  const body = (await c.req.json()) as Record<string, unknown>;
  const mdb = db.withSchema(SCHEMA);

  const set: { name?: string; description?: string | null } = {};
  if (typeof body["name"] === "string") set.name = body["name"];
  if ("description" in body) {
    set.description =
      typeof body["description"] === "string" ? body["description"] : null;
  }

  if (Object.keys(set).length === 0) {
    return c.json({ error: "Provide name or description" }, 400);
  }

  const updated = await mdb
    .updateTable("object_type")
    .set(set)
    .where("api_name", "=", apiName)
    .returningAll()
    .executeTakeFirst();

  if (!updated) return c.json({ error: "Unknown type" }, 404);
  return c.json(updated);
});

export default app;
