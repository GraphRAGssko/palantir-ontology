import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";

import type { DB } from "./schema.ts";

const dialect = new PostgresDialect({
  pool: new pg.Pool({ connectionString: process.env["DATABASE_URL"] }),
});

export const db = new Kysely<DB>({ dialect });
