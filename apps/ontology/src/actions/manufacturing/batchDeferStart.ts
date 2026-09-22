import type { Selectable } from "kysely";
import type { ManufacturingBatch } from "../../schema.ts";
import type { ActionContext } from "../types.ts";

interface DeferStartParams {
  newPlannedStart: string;
}

export async function batchDeferStart(
  instance: Selectable<ManufacturingBatch>,
  params: DeferStartParams,
  ctx: ActionContext,
): Promise<Record<string, unknown>> {
  if (instance.status !== "queued") {
    throw new Error(
      `Batch ${instance.id} cannot be deferred: status is "${instance.status}", expected "queued"`,
    );
  }

  const newStart = new Date(params.newPlannedStart);
  if (newStart.getTime() <= Date.now()) {
    throw new Error("newPlannedStart must be in the future");
  }

  return await ctx.db.transaction().execute(async (trx) => {
    await trx
      .updateTable("manufacturing.batch")
      .set({ planned_start: newStart })
      .where("id", "=", instance.id)
      .execute();

    const updated = await trx
      .selectFrom("manufacturing.batch")
      .selectAll()
      .where("id", "=", instance.id)
      .executeTakeFirstOrThrow();

    await trx
      .withSchema(ctx.schema)
      .insertInto("audit_log")
      .values({
        action_type_id: ctx.actionType.id,
        action_api_name: ctx.actionType.api_name,
        target_type_id: ctx.objectType.id,
        target_type_api_name: ctx.objectType.api_name,
        target_id: instance.id,
        actor: "system",
        params: JSON.stringify(params),
        result: JSON.stringify(updated),
      })
      .execute();

    return updated as Record<string, unknown>;
  });
}
