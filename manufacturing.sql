BEGIN;

DROP SCHEMA IF EXISTS manufacturing CASCADE;
CREATE SCHEMA manufacturing;

-- ============================================================
-- Instance tables
-- ============================================================

CREATE TABLE manufacturing.tank (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  capacity              NUMERIC NOT NULL,
  status                TEXT NOT NULL DEFAULT 'idle',
  current_temperature   NUMERIC,
  commissioned_at       TIMESTAMPTZ
);

CREATE TABLE manufacturing.line (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'idle',
  commissioned_at   TIMESTAMPTZ
);

CREATE TABLE manufacturing.operator (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  certifications  TEXT[],
  shift           TEXT NOT NULL
);

CREATE TABLE manufacturing.recipe (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  target_sugar_curve    JSONB,
  fermentation_days     INTEGER NOT NULL,
  required_ingredients  TEXT[],
  notes                 TEXT
);

CREATE TABLE manufacturing.batch (
  id                    TEXT PRIMARY KEY,
  recipe_id             TEXT NOT NULL REFERENCES manufacturing.recipe(id),
  target_volume         NUMERIC NOT NULL,
  status                TEXT NOT NULL DEFAULT 'planned',
  planned_start         TIMESTAMPTZ,
  current_sugar_level   NUMERIC,
  current_temperature   NUMERIC,
  days_fermenting       INTEGER NOT NULL DEFAULT 0,
  assigned_tank_id      TEXT REFERENCES manufacturing.tank(id),
  assigned_operator_id  TEXT REFERENCES manufacturing.operator(id),
  last_operator_note    TEXT
);

CREATE TABLE manufacturing.bottling_run (
  id                    TEXT PRIMARY KEY,
  batch_id              TEXT NOT NULL REFERENCES manufacturing.batch(id),
  line_id               TEXT NOT NULL REFERENCES manufacturing.line(id),
  planned_start         TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'planned',
  assigned_operator_id  TEXT REFERENCES manufacturing.operator(id)
);

CREATE TABLE manufacturing.maintenance_log (
  id            TEXT PRIMARY KEY,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  notes         TEXT
);

CREATE TABLE manufacturing.quality_test (
  id          TEXT PRIMARY KEY,
  batch_id    TEXT NOT NULL REFERENCES manufacturing.batch(id),
  test_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ph          NUMERIC,
  sugar_level NUMERIC,
  notes       TEXT,
  tested_by   TEXT
);

-- ============================================================
-- Metadata tables
-- ============================================================

CREATE TABLE manufacturing.object_type (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name          TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  visibility        TEXT NOT NULL DEFAULT 'normal',
  point_of_contact  TEXT,
  edits_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  schema            TEXT NOT NULL DEFAULT 'manufacturing',
  datasource_table  TEXT NOT NULL
);

CREATE TABLE manufacturing.property (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name          TEXT NOT NULL,
  name              TEXT NOT NULL,
  object_type_id    UUID NOT NULL REFERENCES manufacturing.object_type(id),
  data_type         TEXT NOT NULL,
  required          BOOLEAN NOT NULL DEFAULT FALSE,
  is_title          BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary_key    BOOLEAN NOT NULL DEFAULT FALSE,
  datasource_column TEXT NOT NULL,
  UNIQUE (object_type_id, api_name)
);

CREATE TABLE manufacturing.link (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name          TEXT NOT NULL,
  name              TEXT NOT NULL,
  inverse_api_name  TEXT NOT NULL,
  inverse_name      TEXT NOT NULL,
  source_type_id    UUID NOT NULL REFERENCES manufacturing.object_type(id),
  target_type_id    UUID NOT NULL REFERENCES manufacturing.object_type(id),
  via_property_id   UUID NOT NULL REFERENCES manufacturing.property(id),
  cardinality       TEXT NOT NULL
);

CREATE TABLE manufacturing.action_type (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name          TEXT NOT NULL,
  name              TEXT NOT NULL,
  object_type_id    UUID NOT NULL REFERENCES manufacturing.object_type(id),
  description       TEXT,
  parameter_schema  JSONB
);

CREATE TABLE manufacturing.audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type_id        UUID NOT NULL REFERENCES manufacturing.action_type(id),
  action_api_name       TEXT NOT NULL,
  target_type_id        UUID NOT NULL REFERENCES manufacturing.object_type(id),
  target_type_api_name  TEXT NOT NULL,
  target_id             TEXT NOT NULL,
  actor                 TEXT NOT NULL,
  params                JSONB,
  result                JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Deterministic UUID directory
-- ============================================================
--
-- object_type   00000000-0000-4000-a000-000000000001 .. 008
-- property      00000000-0000-4000-a000-000000010001 .. 052
-- link          00000000-0000-4000-a000-000000020001 .. 006
-- action_type   00000000-0000-4000-a000-000000030001
--
-- Object types:
--   tank           ..00001    line           ..00002
--   batch          ..00003    bottlingRun    ..00004
--   maintenanceLog ..00005    operator       ..00006
--   recipe         ..00007    qualityTest    ..00008
--
-- Properties (grouped by object type):
--   Tank       10001–10006    Line       10007–10010
--   Operator   10011–10014    Recipe     10015–10020
--   Batch      10021–10031    BottlingRun 10032–10037
--   MaintLog   10038–10045    QualTest   10046–10052
--
-- Links:
--   Batch→Tank 20001  Batch→Operator 20002  Batch→Recipe 20003
--   BottlingRun→Batch 20004  BottlingRun→Line 20005
--   QualityTest→Batch 20006
--
-- Action types:
--   Batch.deferStart 30001

-- ============================================================
-- Populate object_type
-- ============================================================

INSERT INTO manufacturing.object_type (id, api_name, name, description, datasource_table) VALUES
  ('00000000-0000-4000-a000-000000000001', 'tank',           'Tank',            'Fermentation and storage tanks',       'tank'),
  ('00000000-0000-4000-a000-000000000002', 'line',           'Line',            'Bottling production lines',            'line'),
  ('00000000-0000-4000-a000-000000000003', 'batch',          'Batch',           'Brewing batches',                      'batch'),
  ('00000000-0000-4000-a000-000000000004', 'bottlingRun',    'Bottling Run',    'Bottling runs for finished batches',   'bottling_run'),
  ('00000000-0000-4000-a000-000000000005', 'maintenanceLog', 'Maintenance Log', 'Maintenance and repair records',       'maintenance_log'),
  ('00000000-0000-4000-a000-000000000006', 'operator',       'Operator',        'Production floor operators',           'operator'),
  ('00000000-0000-4000-a000-000000000007', 'recipe',         'Recipe',          'Brewing recipes',                      'recipe'),
  ('00000000-0000-4000-a000-000000000008', 'qualityTest',    'Quality Test',    'Quality test results for batches',     'quality_test');

-- ============================================================
-- Populate properties
-- ============================================================

-- Tank  (object_type 00001)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010001', 'id',                 'ID',                  '00000000-0000-4000-a000-000000000001', 'string',   TRUE,  FALSE, TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010002', 'name',               'Name',                '00000000-0000-4000-a000-000000000001', 'string',   TRUE,  TRUE,  FALSE, 'name'),
  ('00000000-0000-4000-a000-000000010003', 'capacity',           'Capacity',            '00000000-0000-4000-a000-000000000001', 'number',   TRUE,  FALSE, FALSE, 'capacity'),
  ('00000000-0000-4000-a000-000000010004', 'status',             'Status',              '00000000-0000-4000-a000-000000000001', 'string',   TRUE,  FALSE, FALSE, 'status'),
  ('00000000-0000-4000-a000-000000010005', 'currentTemperature', 'Current Temperature', '00000000-0000-4000-a000-000000000001', 'number',   FALSE, FALSE, FALSE, 'current_temperature'),
  ('00000000-0000-4000-a000-000000010006', 'commissionedAt',     'Commissioned At',     '00000000-0000-4000-a000-000000000001', 'datetime', FALSE, FALSE, FALSE, 'commissioned_at');

-- Line  (object_type 00002)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010007', 'id',             'ID',              '00000000-0000-4000-a000-000000000002', 'string',   TRUE,  FALSE, TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010008', 'name',           'Name',            '00000000-0000-4000-a000-000000000002', 'string',   TRUE,  TRUE,  FALSE, 'name'),
  ('00000000-0000-4000-a000-000000010009', 'status',         'Status',          '00000000-0000-4000-a000-000000000002', 'string',   TRUE,  FALSE, FALSE, 'status'),
  ('00000000-0000-4000-a000-000000010010', 'commissionedAt', 'Commissioned At', '00000000-0000-4000-a000-000000000002', 'datetime', FALSE, FALSE, FALSE, 'commissioned_at');

-- Operator  (object_type 00006)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010011', 'id',             'ID',             '00000000-0000-4000-a000-000000000006', 'string',        TRUE,  FALSE, TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010012', 'name',           'Name',           '00000000-0000-4000-a000-000000000006', 'string',        TRUE,  TRUE,  FALSE, 'name'),
  ('00000000-0000-4000-a000-000000010013', 'certifications', 'Certifications', '00000000-0000-4000-a000-000000000006', 'array<string>', FALSE, FALSE, FALSE, 'certifications'),
  ('00000000-0000-4000-a000-000000010014', 'shift',          'Shift',          '00000000-0000-4000-a000-000000000006', 'string',        TRUE,  FALSE, FALSE, 'shift');

-- Recipe  (object_type 00007)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010015', 'id',                  'ID',                   '00000000-0000-4000-a000-000000000007', 'string',        TRUE,  FALSE, TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010016', 'name',                'Name',                 '00000000-0000-4000-a000-000000000007', 'string',        TRUE,  TRUE,  FALSE, 'name'),
  ('00000000-0000-4000-a000-000000010017', 'targetSugarCurve',    'Target Sugar Curve',   '00000000-0000-4000-a000-000000000007', 'json',          FALSE, FALSE, FALSE, 'target_sugar_curve'),
  ('00000000-0000-4000-a000-000000010018', 'fermentationDays',    'Fermentation Days',    '00000000-0000-4000-a000-000000000007', 'integer',       TRUE,  FALSE, FALSE, 'fermentation_days'),
  ('00000000-0000-4000-a000-000000010019', 'requiredIngredients', 'Required Ingredients', '00000000-0000-4000-a000-000000000007', 'array<string>', FALSE, FALSE, FALSE, 'required_ingredients'),
  ('00000000-0000-4000-a000-000000010020', 'notes',               'Notes',                '00000000-0000-4000-a000-000000000007', 'string',        FALSE, FALSE, FALSE, 'notes');

-- Batch  (object_type 00003)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010021', 'id',                 'ID',                  '00000000-0000-4000-a000-000000000003', 'string',   TRUE,  TRUE,  TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010022', 'recipeId',           'Recipe ID',           '00000000-0000-4000-a000-000000000003', 'string',   TRUE,  FALSE, FALSE, 'recipe_id'),
  ('00000000-0000-4000-a000-000000010023', 'targetVolume',       'Target Volume',       '00000000-0000-4000-a000-000000000003', 'number',   TRUE,  FALSE, FALSE, 'target_volume'),
  ('00000000-0000-4000-a000-000000010024', 'status',             'Status',              '00000000-0000-4000-a000-000000000003', 'string',   TRUE,  FALSE, FALSE, 'status'),
  ('00000000-0000-4000-a000-000000010025', 'plannedStart',       'Planned Start',       '00000000-0000-4000-a000-000000000003', 'datetime', FALSE, FALSE, FALSE, 'planned_start'),
  ('00000000-0000-4000-a000-000000010026', 'currentSugarLevel',  'Current Sugar Level', '00000000-0000-4000-a000-000000000003', 'number',   FALSE, FALSE, FALSE, 'current_sugar_level'),
  ('00000000-0000-4000-a000-000000010027', 'currentTemperature', 'Current Temperature', '00000000-0000-4000-a000-000000000003', 'number',   FALSE, FALSE, FALSE, 'current_temperature'),
  ('00000000-0000-4000-a000-000000010028', 'daysFermenting',     'Days Fermenting',     '00000000-0000-4000-a000-000000000003', 'integer',  TRUE,  FALSE, FALSE, 'days_fermenting'),
  ('00000000-0000-4000-a000-000000010029', 'assignedTankId',     'Assigned Tank ID',    '00000000-0000-4000-a000-000000000003', 'string',   FALSE, FALSE, FALSE, 'assigned_tank_id'),
  ('00000000-0000-4000-a000-000000010030', 'assignedOperatorId', 'Assigned Operator ID','00000000-0000-4000-a000-000000000003', 'string',   FALSE, FALSE, FALSE, 'assigned_operator_id'),
  ('00000000-0000-4000-a000-000000010031', 'lastOperatorNote',   'Last Operator Note',  '00000000-0000-4000-a000-000000000003', 'string',   FALSE, FALSE, FALSE, 'last_operator_note');

-- Bottling Run  (object_type 00004)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010032', 'id',                 'ID',                  '00000000-0000-4000-a000-000000000004', 'string',   TRUE,  TRUE,  TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010033', 'batchId',            'Batch ID',            '00000000-0000-4000-a000-000000000004', 'string',   TRUE,  FALSE, FALSE, 'batch_id'),
  ('00000000-0000-4000-a000-000000010034', 'lineId',             'Line ID',             '00000000-0000-4000-a000-000000000004', 'string',   TRUE,  FALSE, FALSE, 'line_id'),
  ('00000000-0000-4000-a000-000000010035', 'plannedStart',       'Planned Start',       '00000000-0000-4000-a000-000000000004', 'datetime', FALSE, FALSE, FALSE, 'planned_start'),
  ('00000000-0000-4000-a000-000000010036', 'status',             'Status',              '00000000-0000-4000-a000-000000000004', 'string',   TRUE,  FALSE, FALSE, 'status'),
  ('00000000-0000-4000-a000-000000010037', 'assignedOperatorId', 'Assigned Operator ID','00000000-0000-4000-a000-000000000004', 'string',   FALSE, FALSE, FALSE, 'assigned_operator_id');

-- Maintenance Log  (object_type 00005)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010038', 'id',          'ID',           '00000000-0000-4000-a000-000000000005', 'string',   TRUE,  TRUE,  TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010039', 'targetType',  'Target Type',  '00000000-0000-4000-a000-000000000005', 'string',   TRUE,  FALSE, FALSE, 'target_type'),
  ('00000000-0000-4000-a000-000000010040', 'targetId',    'Target ID',    '00000000-0000-4000-a000-000000000005', 'string',   TRUE,  FALSE, FALSE, 'target_id'),
  ('00000000-0000-4000-a000-000000010041', 'type',        'Type',         '00000000-0000-4000-a000-000000000005', 'string',   TRUE,  FALSE, FALSE, 'type'),
  ('00000000-0000-4000-a000-000000010042', 'status',      'Status',       '00000000-0000-4000-a000-000000000005', 'string',   TRUE,  FALSE, FALSE, 'status'),
  ('00000000-0000-4000-a000-000000010043', 'startedAt',   'Started At',   '00000000-0000-4000-a000-000000000005', 'datetime', FALSE, FALSE, FALSE, 'started_at'),
  ('00000000-0000-4000-a000-000000010044', 'completedAt', 'Completed At', '00000000-0000-4000-a000-000000000005', 'datetime', FALSE, FALSE, FALSE, 'completed_at'),
  ('00000000-0000-4000-a000-000000010045', 'notes',       'Notes',        '00000000-0000-4000-a000-000000000005', 'string',   FALSE, FALSE, FALSE, 'notes');

-- Quality Test  (object_type 00008)
INSERT INTO manufacturing.property (id, api_name, name, object_type_id, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('00000000-0000-4000-a000-000000010046', 'id',         'ID',          '00000000-0000-4000-a000-000000000008', 'string',   TRUE,  TRUE,  TRUE,  'id'),
  ('00000000-0000-4000-a000-000000010047', 'batchId',    'Batch ID',    '00000000-0000-4000-a000-000000000008', 'string',   TRUE,  FALSE, FALSE, 'batch_id'),
  ('00000000-0000-4000-a000-000000010048', 'testDate',   'Test Date',   '00000000-0000-4000-a000-000000000008', 'datetime', TRUE,  FALSE, FALSE, 'test_date'),
  ('00000000-0000-4000-a000-000000010049', 'ph',         'pH',          '00000000-0000-4000-a000-000000000008', 'number',   FALSE, FALSE, FALSE, 'ph'),
  ('00000000-0000-4000-a000-000000010050', 'sugarLevel', 'Sugar Level', '00000000-0000-4000-a000-000000000008', 'number',   FALSE, FALSE, FALSE, 'sugar_level'),
  ('00000000-0000-4000-a000-000000010051', 'notes',      'Notes',       '00000000-0000-4000-a000-000000000008', 'string',   FALSE, FALSE, FALSE, 'notes'),
  ('00000000-0000-4000-a000-000000010052', 'testedBy',   'Tested By',   '00000000-0000-4000-a000-000000000008', 'string',   FALSE, FALSE, FALSE, 'tested_by');

-- ============================================================
-- Populate links
-- ============================================================

INSERT INTO manufacturing.link (id, api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
  -- Batch → Tank  (via assignedTankId)
  ('00000000-0000-4000-a000-000000020001', 'assignedTank',     'Assigned Tank',     'assignedBatches', 'Assigned Batches',
   '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000010029', 'many_to_one'),

  -- Batch → Operator  (via assignedOperatorId)
  ('00000000-0000-4000-a000-000000020002', 'assignedOperator', 'Assigned Operator', 'assignedBatches', 'Assigned Batches',
   '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000010030', 'many_to_one'),

  -- Batch → Recipe  (via recipeId)
  ('00000000-0000-4000-a000-000000020003', 'recipe',           'Recipe',            'batches',         'Batches',
   '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000010022', 'many_to_one'),

  -- BottlingRun → Batch  (via batchId)
  ('00000000-0000-4000-a000-000000020004', 'batch',            'Batch',             'bottlingRuns',    'Bottling Runs',
   '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000010033', 'many_to_one'),

  -- BottlingRun → Line  (via lineId)
  ('00000000-0000-4000-a000-000000020005', 'line',             'Line',              'bottlingRuns',    'Bottling Runs',
   '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000010034', 'many_to_one'),

  -- QualityTest → Batch  (via batchId)
  ('00000000-0000-4000-a000-000000020006', 'batch',            'Batch',             'qualityTests',    'Quality Tests',
   '00000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000010047', 'many_to_one');

-- ============================================================
-- Populate action_type
-- ============================================================

INSERT INTO manufacturing.action_type (id, api_name, name, object_type_id, description, parameter_schema) VALUES
  ('00000000-0000-4000-a000-000000030001', 'deferStart', 'Defer Start',
   '00000000-0000-4000-a000-000000000003',
   'Postpone the batch''s planned start date',
   '{"type":"object","properties":{"newPlannedStart":{"type":"string","format":"date-time","description":"The new planned start date-time"}},"required":["newPlannedStart"],"additionalProperties":false}'::jsonb);

-- ============================================================
-- Test data
-- ============================================================

INSERT INTO manufacturing.tank (id, name, capacity, status, current_temperature, commissioned_at)
VALUES ('T-12', 'Fermentation Tank 12', 5000, 'in_use', 11.5, '2023-03-15T00:00:00Z');

INSERT INTO manufacturing.recipe (id, name, target_sugar_curve, fermentation_days, required_ingredients, notes)
VALUES (
  'REC-LAGER-V3',
  'Classic Lager v3',
  '[{"day":0,"brix":12.0},{"day":3,"brix":9.5},{"day":7,"brix":6.0},{"day":14,"brix":3.2},{"day":21,"brix":2.5}]'::jsonb,
  21,
  ARRAY['pilsner malt', 'saaz hops', 'lager yeast', 'water'],
  'Standard lager recipe, low-temperature fermentation'
);

INSERT INTO manufacturing.operator (id, name, certifications, shift)
VALUES ('OP-501', 'Park Kyungwon', ARRAY['brewing-level-2', 'forklift', 'hazmat'], 'day');

INSERT INTO manufacturing.batch (id, recipe_id, target_volume, status, planned_start, current_sugar_level, current_temperature, days_fermenting, assigned_tank_id, assigned_operator_id, last_operator_note)
VALUES (
  'B-2105',
  'REC-LAGER-V3',
  4500,
  'fermenting',
  '2026-09-10T06:00:00Z',
  5.8,
  11.2,
  10,
  'T-12',
  'OP-501',
  'Sugar curve on track, holding temperature steady'
);

COMMIT;
