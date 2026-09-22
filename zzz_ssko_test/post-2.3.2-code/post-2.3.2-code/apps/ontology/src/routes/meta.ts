import { Hono } from "hono";
import { db, INSTANCE_SCHEMAS } from "../db.ts";

const meta = new Hono();

// GET /types — list all object types across all schemas
meta.get("/types", async (c) => {
  const allTypes = [];
  for (const schema of INSTANCE_SCHEMAS) {
    const types = await db
      .withSchema(schema)
      .selectFrom("object_type")
      .selectAll()
      .execute();
    allTypes.push(...types);
  }
  return c.json(allTypes);
});

// GET /types/:type — full metadata bundle for one type
meta.get("/types/:type", async (c) => {
  const apiName = c.req.param("type");

  let objectType;
  let schema: string | undefined;

  for (const s of INSTANCE_SCHEMAS) {
    objectType = await db
      .withSchema(s)
      .selectFrom("object_type")
      .selectAll()
      .where("api_name", "=", apiName)
      .executeTakeFirst();
    if (objectType) {
      schema = s;
      break;
    }
  }

  if (!objectType || !schema) {
    return c.json({ error: `Unknown type: ${apiName}` }, 404);
  }

  const metaDb = db.withSchema(schema);

  const [properties, outgoingLinks, incomingLinks, actions] = await Promise.all([
    metaDb
      .selectFrom("property")
      .selectAll()
      .where("object_type_id", "=", objectType.id)
      .execute(),
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
    metaDb
      .selectFrom("action_type")
      .selectAll()
      .where("object_type_id", "=", objectType.id)
      .execute(),
  ]);

  return c.json({ objectType, properties, outgoingLinks, incomingLinks, actions });
});

export default meta;
