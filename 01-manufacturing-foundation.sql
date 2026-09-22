CREATE SCHEMA IF NOT EXISTS manufacturing;
SET search_path TO manufacturing;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Instance Tables
CREATE TABLE tank (
    id TEXT PRIMARY KEY,
    name TEXT,
    capacity NUMERIC,
    status TEXT,
    current_temperature NUMERIC,
    commissioned_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE line (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    commissioned_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE operator (
    id TEXT PRIMARY KEY,
    name TEXT,
    certifications TEXT[],
    shift TEXT
);

CREATE TABLE recipe (
    id TEXT PRIMARY KEY,
    name TEXT,
    target_sugar_curve JSONB,
    fermentation_days INTEGER,
    required_ingredients TEXT[],
    notes TEXT
);

CREATE TABLE batch (
    id TEXT PRIMARY KEY,
    recipe_id TEXT REFERENCES recipe(id),
    target_volume NUMERIC,
    status TEXT,
    planned_start TIMESTAMP WITH TIME ZONE,
    current_sugar_level NUMERIC,
    current_temperature NUMERIC,
    days_fermenting INTEGER,
    assigned_tank_id TEXT REFERENCES tank(id),
    assigned_operator_id TEXT REFERENCES operator(id),
    last_operator_note TEXT
);

CREATE TABLE bottling_run (
    id TEXT PRIMARY KEY,
    batch_id TEXT REFERENCES batch(id),
    line_id TEXT REFERENCES line(id),
    planned_start TIMESTAMP WITH TIME ZONE,
    status TEXT,
    assigned_operator_id TEXT REFERENCES operator(id)
);

CREATE TABLE maintenance_log (
    id TEXT PRIMARY KEY,
    target_type TEXT,
    target_id TEXT,
    type TEXT,
    status TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE TABLE quality_test (
    id TEXT PRIMARY KEY,
    batch_id TEXT REFERENCES batch(id),
    test_date TIMESTAMP WITH TIME ZONE,
    ph NUMERIC,
    sugar_level NUMERIC,
    notes TEXT,
    tested_by TEXT
);

-- Metadata Tables
CREATE TABLE object_type (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT,
    visibility TEXT,
    point_of_contact TEXT,
    edits_enabled BOOLEAN,
    schema TEXT,
    datasource_table TEXT
);

CREATE TABLE property (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL,
    name TEXT NOT NULL,
    object_type_id UUID REFERENCES object_type(id),
    data_type TEXT,
    required BOOLEAN,
    is_title BOOLEAN,
    is_primary_key BOOLEAN,
    datasource_column TEXT,
    UNIQUE (object_type_id, api_name)
);

CREATE TABLE link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL,
    name TEXT NOT NULL,
    inverse_api_name TEXT,
    inverse_name TEXT,
    source_type_id UUID REFERENCES object_type(id),
    target_type_id UUID REFERENCES object_type(id),
    via_property_id UUID REFERENCES property(id),
    cardinality TEXT
);

CREATE TABLE action_type (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    object_type_id UUID REFERENCES object_type(id),
    description TEXT,
    parameter_schema JSONB
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type_id UUID REFERENCES action_type(id),
    action_api_name TEXT,
    target_type_id UUID REFERENCES object_type(id),
    target_type_api_name TEXT,
    target_id TEXT,
    actor TEXT,
    params JSONB,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Populate Object Types
INSERT INTO object_type (id, api_name, name, description, schema, datasource_table) VALUES
('00000000-0000-2000-0000-000020000001', 'tank', 'Tank', 'A vessel for storing or fermenting liquids.', 'manufacturing', 'tank'),
('00000000-0000-2000-0000-000020000002', 'line', 'Line', 'A production line for bottling or packaging.', 'manufacturing', 'line'),
('00000000-0000-2000-0000-000020000003', 'batch', 'Batch', 'A discrete quantity of product being manufactured.', 'manufacturing', 'batch'),
('00000000-0000-2000-0000-000020000004', 'bottlingRun', 'Bottling Run', 'Execution of bottling a batch on a line.', 'manufacturing', 'bottling_run'),
('00000000-0000-2000-0000-000020000005', 'maintenanceLog', 'Maintenance Log', 'Record of maintenance on a piece of equipment.', 'manufacturing', 'maintenance_log'),
('00000000-0000-2000-0000-000020000006', 'operator', 'Operator', 'A person operating equipment or performing tasks.', 'manufacturing', 'operator'),
('00000000-0000-2000-0000-000020000007', 'recipe', 'Recipe', 'Instructions and specifications for a batch.', 'manufacturing', 'recipe'),
('00000000-0000-2000-0000-000020000008', 'qualityTest', 'Quality Test', 'A test performed on a batch.', 'manufacturing', 'quality_test');

-- Populate Properties (Tank)
INSERT INTO property (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
('00000000-0000-2000-0000-000020000001', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-2000-0000-000020000001', 'name', 'Name', 'string', false, false, false, 'name'),
('00000000-0000-2000-0000-000020000001', 'capacity', 'Capacity', 'number', false, false, false, 'capacity'),
('00000000-0000-2000-0000-000020000001', 'status', 'Status', 'string', false, false, false, 'status'),
('00000000-0000-2000-0000-000020000001', 'currentTemperature', 'Current Temperature', 'number', false, false, false, 'current_temperature'),
('00000000-0000-2000-0000-000020000001', 'commissionedAt', 'Commissioned At', 'datetime', false, false, false, 'commissioned_at');

-- Populate Properties (Line)
INSERT INTO property (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
('00000000-0000-2000-0000-000020000002', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-2000-0000-000020000002', 'name', 'Name', 'string', false, false, false, 'name'),
('00000000-0000-2000-0000-000020000002', 'status', 'Status', 'string', false, false, false, 'status'),
('00000000-0000-2000-0000-000020000002', 'commissionedAt', 'Commissioned At', 'datetime', false, false, false, 'commissioned_at');

-- Populate Properties (Batch)
INSERT INTO property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-3000-0000-000030000003', '00000000-0000-2000-0000-000020000003', 'recipeId', 'Recipe ID', 'string', false, false, false, 'recipe_id'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'targetVolume', 'Target Volume', 'number', false, false, false, 'target_volume'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'status', 'Status', 'string', false, false, false, 'status'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'plannedStart', 'Planned Start', 'datetime', false, false, false, 'planned_start'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'currentSugarLevel', 'Current Sugar Level', 'number', false, false, false, 'current_sugar_level'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'currentTemperature', 'Current Temperature', 'number', false, false, false, 'current_temperature'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'daysFermenting', 'Days Fermenting', 'number', false, false, false, 'days_fermenting'),
('00000000-0000-3000-0000-000030000001', '00000000-0000-2000-0000-000020000003', 'assignedTankId', 'Assigned Tank ID', 'string', false, false, false, 'assigned_tank_id'),
('00000000-0000-3000-0000-000030000002', '00000000-0000-2000-0000-000020000003', 'assignedOperatorId', 'Assigned Operator ID', 'string', false, false, false, 'assigned_operator_id'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000003', 'lastOperatorNote', 'Last Operator Note', 'string', false, false, false, 'last_operator_note');

-- Populate Properties (BottlingRun)
INSERT INTO property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
(gen_random_uuid(), '00000000-0000-2000-0000-000020000004', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-3000-0000-000030000004', '00000000-0000-2000-0000-000020000004', 'batchId', 'Batch ID', 'string', false, false, false, 'batch_id'),
('00000000-0000-3000-0000-000030000005', '00000000-0000-2000-0000-000020000004', 'lineId', 'Line ID', 'string', false, false, false, 'line_id'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000004', 'plannedStart', 'Planned Start', 'datetime', false, false, false, 'planned_start'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000004', 'status', 'Status', 'string', false, false, false, 'status'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000004', 'assignedOperatorId', 'Assigned Operator ID', 'string', false, false, false, 'assigned_operator_id');

-- Populate Properties (MaintenanceLog)
INSERT INTO property (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
('00000000-0000-2000-0000-000020000005', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-2000-0000-000020000005', 'targetType', 'Target Type', 'string', false, false, false, 'target_type'),
('00000000-0000-2000-0000-000020000005', 'targetId', 'Target ID', 'string', false, false, false, 'target_id'),
('00000000-0000-2000-0000-000020000005', 'type', 'Type', 'string', false, false, false, 'type'),
('00000000-0000-2000-0000-000020000005', 'status', 'Status', 'string', false, false, false, 'status'),
('00000000-0000-2000-0000-000020000005', 'startedAt', 'Started At', 'datetime', false, false, false, 'started_at'),
('00000000-0000-2000-0000-000020000005', 'completedAt', 'Completed At', 'datetime', false, false, false, 'completed_at'),
('00000000-0000-2000-0000-000020000005', 'notes', 'Notes', 'string', false, false, false, 'notes');

-- Populate Properties (Operator)
INSERT INTO property (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
('00000000-0000-2000-0000-000020000006', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-2000-0000-000020000006', 'name', 'Name', 'string', false, false, false, 'name'),
('00000000-0000-2000-0000-000020000006', 'certifications', 'Certifications', 'array', false, false, false, 'certifications'),
('00000000-0000-2000-0000-000020000006', 'shift', 'Shift', 'string', false, false, false, 'shift');

-- Populate Properties (Recipe)
INSERT INTO property (object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
('00000000-0000-2000-0000-000020000007', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-2000-0000-000020000007', 'name', 'Name', 'string', false, false, false, 'name'),
('00000000-0000-2000-0000-000020000007', 'targetSugarCurve', 'Target Sugar Curve', 'json', false, false, false, 'target_sugar_curve'),
('00000000-0000-2000-0000-000020000007', 'fermentationDays', 'Fermentation Days', 'number', false, false, false, 'fermentation_days'),
('00000000-0000-2000-0000-000020000007', 'requiredIngredients', 'Required Ingredients', 'array', false, false, false, 'required_ingredients'),
('00000000-0000-2000-0000-000020000007', 'notes', 'Notes', 'string', false, false, false, 'notes');

-- Populate Properties (QualityTest)
INSERT INTO property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
(gen_random_uuid(), '00000000-0000-2000-0000-000020000008', 'id', 'ID', 'string', true, true, true, 'id'),
('00000000-0000-3000-0000-000030000006', '00000000-0000-2000-0000-000020000008', 'batchId', 'Batch ID', 'string', false, false, false, 'batch_id'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000008', 'testDate', 'Test Date', 'datetime', false, false, false, 'test_date'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000008', 'ph', 'pH', 'number', false, false, false, 'ph'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000008', 'sugarLevel', 'Sugar Level', 'number', false, false, false, 'sugar_level'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000008', 'notes', 'Notes', 'string', false, false, false, 'notes'),
(gen_random_uuid(), '00000000-0000-2000-0000-000020000008', 'testedBy', 'Tested By', 'string', false, false, false, 'tested_by');


-- Links
-- Batch → Tank (assignedTank / assignedBatches, via assignedTankId, many_to_one)
INSERT INTO link (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
('assignedTank', 'Assigned Tank', 'assignedBatches', 'Assigned Batches', '00000000-0000-2000-0000-000020000003', '00000000-0000-2000-0000-000020000001', '00000000-0000-3000-0000-000030000001', 'many_to_one');

-- Batch → Operator (assignedOperator / assignedBatches, via assignedOperatorId, many_to_one)
INSERT INTO link (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
('assignedOperator', 'Assigned Operator', 'assignedBatches', 'Assigned Batches', '00000000-0000-2000-0000-000020000003', '00000000-0000-2000-0000-000020000006', '00000000-0000-3000-0000-000030000002', 'many_to_one');

-- Batch → Recipe (recipe / batches, via recipeId, many_to_one)
INSERT INTO link (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
('recipe', 'Recipe', 'batches', 'Batches', '00000000-0000-2000-0000-000020000003', '00000000-0000-2000-0000-000020000007', '00000000-0000-3000-0000-000030000003', 'many_to_one');

-- BottlingRun → Batch (batch / bottlingRuns, via batchId, many_to_one)
INSERT INTO link (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
('batch', 'Batch', 'bottlingRuns', 'Bottling Runs', '00000000-0000-2000-0000-000020000004', '00000000-0000-2000-0000-000020000003', '00000000-0000-3000-0000-000030000004', 'many_to_one');

-- BottlingRun → Line (line / bottlingRuns, via lineId, many_to_one)
INSERT INTO link (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
('line', 'Line', 'bottlingRuns', 'Bottling Runs', '00000000-0000-2000-0000-000020000004', '00000000-0000-2000-0000-000020000002', '00000000-0000-3000-0000-000030000005', 'many_to_one');

-- QualityTest → Batch (batch / qualityTests, via batchId, many_to_one)
INSERT INTO link (api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
('batch', 'Batch', 'qualityTests', 'Quality Tests', '00000000-0000-2000-0000-000020000008', '00000000-0000-2000-0000-000020000003', '00000000-0000-3000-0000-000030000006', 'many_to_one');

-- Action Types
INSERT INTO action_type (api_name, name, object_type_id, description, parameter_schema) VALUES
('deferStart', 'Defer Start', '00000000-0000-2000-0000-000020000003', 'Postpone the batch''s planned start date', '{"type": "object", "properties": {"newPlannedStart": {"type": "string", "format": "date-time"}}, "required": ["newPlannedStart"]}');

-- Test Data
INSERT INTO tank (id, name, capacity, status) VALUES ('T-12', 'Tank 12', 10000, 'in_use');
INSERT INTO recipe (id, name, fermentation_days) VALUES ('REC-LAGER-V3', 'Lager V3', 14);
INSERT INTO operator (id, name) VALUES ('OP-1', 'Park Kyungwon');
INSERT INTO batch (id, recipe_id, assigned_tank_id, assigned_operator_id, status) VALUES ('B-2105', 'REC-LAGER-V3', 'T-12', 'OP-1', 'fermenting');
