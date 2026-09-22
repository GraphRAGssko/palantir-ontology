import { batchDeferStart } from "./manufacturing/batchDeferStart.ts";

export interface ActionContext {
  objectType: {
    id: string;
    api_name: string;
    schema: string;
    datasource_table: string;
  };
  actionType: {
    id: string;
    api_name: string;
    parameter_schema: unknown;
  };
}

export type ActionHandler = (
  instance: Record<string, unknown>,
  params: Record<string, unknown>,
  context: ActionContext,
) => Promise<Record<string, unknown>>;

/** Dispatch map keyed by "objectTypeApiName.actionApiName" */
export const actionHandlers: Record<string, ActionHandler> = {
  "batch.deferStart": batchDeferStart,
};
