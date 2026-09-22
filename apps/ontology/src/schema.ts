import type { Generated } from "kysely";

// ---- Metadata tables (schema-agnostic, use with db.withSchema) --------

export interface ObjectTypeTable {
  id: Generated<string>;
  api_name: string;
  name: string;
  description: string | null;
  status: string | null;
  visibility: string | null;
  point_of_contact: string | null;
  edits_enabled: boolean | null;
  schema: string | null;
  datasource_table: string | null;
}

export interface PropertyTable {
  id: Generated<string>;
  api_name: string;
  name: string;
  object_type_id: string | null;
  data_type: string | null;
  required: boolean | null;
  is_title: boolean | null;
  is_primary_key: boolean | null;
  datasource_column: string | null;
}

export interface LinkTable {
  id: Generated<string>;
  api_name: string;
  name: string;
  inverse_api_name: string | null;
  inverse_name: string | null;
  source_type_id: string | null;
  target_type_id: string | null;
  via_property_id: string | null;
  cardinality: string | null;
}

export interface ActionTypeTable {
  id: Generated<string>;
  api_name: string;
  name: string;
  object_type_id: string | null;
  description: string | null;
  parameter_schema: unknown;
}

export interface AuditLogTable {
  id: Generated<string>;
  action_type_id: string | null;
  action_api_name: string | null;
  target_type_id: string | null;
  target_type_api_name: string | null;
  target_id: string | null;
  actor: string | null;
  params: unknown;
  result: unknown;
  created_at: Generated<Date | null>;
}

// ---- Manufacturing instance tables ------------------------------------

export interface ManufacturingTank {
  id: string;
  name: string | null;
  capacity: string | null;
  status: string | null;
  current_temperature: string | null;
  commissioned_at: Date | null;
}

export interface ManufacturingLine {
  id: string;
  name: string | null;
  status: string | null;
  commissioned_at: Date | null;
}

export interface ManufacturingOperator {
  id: string;
  name: string | null;
  certifications: string[] | null;
  shift: string | null;
}

export interface ManufacturingRecipe {
  id: string;
  name: string | null;
  target_sugar_curve: unknown;
  fermentation_days: number | null;
  required_ingredients: string[] | null;
  notes: string | null;
}

export interface ManufacturingBatch {
  id: string;
  recipe_id: string | null;
  target_volume: string | null;
  status: string | null;
  planned_start: Date | null;
  current_sugar_level: string | null;
  current_temperature: string | null;
  days_fermenting: number | null;
  assigned_tank_id: string | null;
  assigned_operator_id: string | null;
  last_operator_note: string | null;
}

export interface ManufacturingBottlingRun {
  id: string;
  batch_id: string | null;
  line_id: string | null;
  planned_start: Date | null;
  status: string | null;
  assigned_operator_id: string | null;
}

export interface ManufacturingMaintenanceLog {
  id: string;
  target_type: string | null;
  target_id: string | null;
  type: string | null;
  status: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  notes: string | null;
}

export interface ManufacturingQualityTest {
  id: string;
  batch_id: string | null;
  test_date: Date | null;
  ph: string | null;
  sugar_level: string | null;
  notes: string | null;
  tested_by: string | null;
}

// ---- Aggregate DB interface -------------------------------------------

export interface DB {
  // Metadata (use with db.withSchema('manufacturing'))
  object_type: ObjectTypeTable;
  property: PropertyTable;
  link: LinkTable;
  action_type: ActionTypeTable;
  audit_log: AuditLogTable;

  // Manufacturing instance tables
  "manufacturing.tank": ManufacturingTank;
  "manufacturing.line": ManufacturingLine;
  "manufacturing.operator": ManufacturingOperator;
  "manufacturing.recipe": ManufacturingRecipe;
  "manufacturing.batch": ManufacturingBatch;
  "manufacturing.bottling_run": ManufacturingBottlingRun;
  "manufacturing.maintenance_log": ManufacturingMaintenanceLog;
  "manufacturing.quality_test": ManufacturingQualityTest;
}
