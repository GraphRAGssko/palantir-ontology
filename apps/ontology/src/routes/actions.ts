import { Hono } from "hono";
import { sql } from "kysely";
import { Validator } from "@cfworker/json-schema";
import { db } from "../db.ts";
import type { ActionHandler, ActionContext } from "../actions/types.ts";
import { batchDeferStart } from "../actions/manufacturing/batchDeferStart.ts";

const INSTANCE_SCHEMAS = new Set(["manufacturing"]);

const handlers: Record<string, ActionHandler> = {
  "batch.deferStart": batchDeferStart as ActionHandler,
};

const app = new Hono();

app.post("/:type/:id/actions/:actionName", async (c) => {
  const typeApiName = c.req.param("type");
  const instanceId = c.req.param("id");
  const actionName = c.req.param("actionName");

  // 1. Resolve object type
  const resolved = await (async () => {
    for (const s of INSTANCE_SCHEMAS) {
      const ot = await db
        .withSchema(s)
        .selectFrom("object_type")
        .selectAll()
        .where("api_name", "=", typeApiName)
        .executeTakeFirst();
      if (ot?.schema && ot.datasource_table) {
        return { schema: s, objectType: ot as typeof ot & { schema: string; datasource_table: string } };
      }
    }
    return null;
  })();
  if (!resolved) return c.json({ error: "Unknown type" }, 404);

  const { schema, objectType } = resolved;
  if (!INSTANCE_SCHEMAS.has(objectType.schema)) {
    return c.json({ error: "Invalid schema" }, 400);
  }

  // 2. Look up action_type
  const actionType = await db
    .withSchema(schema)
    .selectFrom("action_type")
    .selectAll()
    .where("object_type_id", "=", objectType.id)
    .where("api_name", "=", actionName)
    .executeTakeFirst();

  if (!actionType) return c.json({ error: "Unknown action" }, 404);

  // 3. Validate body against parameter_schema
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body → defaults to {}
  }

  if (actionType.parameter_schema != null) {
    const validator = new Validator(actionType.parameter_schema as object);
    const validation = validator.validate(body);
    if (!validation.valid) {
      return c.json(
        { error: "Invalid parameters", details: validation.errors },
        400,
      );
    }
  }

  // 4. Fetch instance
  const rawProps = await db
    .withSchema(schema)
    .selectFrom("property")
    .selectAll()
    .where("object_type_id", "=", objectType.id)
    .execute();

  const properties = rawProps.filter(
    (p): p is typeof p & { datasource_column: string } =>
      p.datasource_column != null,
  );

  const pkProp = properties.find((p) => p.api_name === "id") ?? properties[0];
  if (!pkProp) return c.json({ error: "No primary key defined" }, 500);

  const { rows } = await sql`
    SELECT * FROM ${sql.id(objectType.schema, objectType.datasource_table)}
    WHERE ${sql.id(pkProp.datasource_column)} = ${instanceId}
  `.execute(db);

  const instanceRow = (rows as Record<string, unknown>[])[0];
  if (!instanceRow) return c.json({ error: "Not found" }, 404);

  // 5. Dispatch to handler
  const handlerKey = `${objectType.api_name}.${actionType.api_name}`;
  const handler = handlers[handlerKey];
  if (!handler) return c.json({ error: "No handler registered" }, 501);

  const context: ActionContext = {
    schema: objectType.schema,
    objectType,
    actionType,
    db,
  };

  try {
    const result = await handler(instanceRow, body, context);

    // Map result to camelCase via property metadata
    const mapped: Record<string, unknown> = {};
    for (const prop of properties) {
      if (prop.datasource_column in result) {
        mapped[prop.api_name] = result[prop.datasource_column];
      }
    }
    return c.json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return c.json({ error: message }, 422);
  }
});

export default app;
