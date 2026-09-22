import type { Kysely, Selectable } from "kysely";
import type {
  DB,
  ObjectTypeTable,
  ActionTypeTable,
} from "../schema.ts";

export interface ActionContext {
  schema: string;
  objectType: Selectable<ObjectTypeTable>;
  actionType: Selectable<ActionTypeTable>;
  db: Kysely<DB>;
}

export type ActionHandler = (
  instance: Record<string, unknown>,
  params: unknown,
  context: ActionContext,
) => Promise<Record<string, unknown>>;
