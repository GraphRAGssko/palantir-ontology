# 1

"""
Add COURSE_NOW=2026-04-30T09:00:00Z to the root .env. Then create a small TypeScript module that overrides the global Date so the current time is anchored at COURSE_NOW when the server starts and advances normally from there. Date.now() and a bare new Date() should report that anchored time, while new Date(value) still parses normally. It must be active before any route handler runs.
"""




















POST to localhost:3456/api/objects/batch/B-2130/actions/deferStart with newPlannedStart set to 2026-05-03T09:00:00Z




















run pnpm run-sql seeds/01-manufacturing-foundation.sql to reset the data




















# 2

"""
Add a Batch Investigation Workspace app.

Top: three metric cards. "Fermenting Batches" (count with status=fermenting), "Behind Target" (fermenting batches whose currentSugarLevel is currently 0.008 or more behind target), "Recent Tank Maintenance" (fermenting batches whose tank has maintenance in the last 7 days).

Left: batch table. Fetch all batches using the list route, and also the target sugar curves of their recipes. Columns: id, recipe name, sugar level vs target (color-coded green within 0.005, amber within 0.008, red beyond), days fermenting, tank, status. Filters: status, tank, "behind target only" toggle. Clicking selects for the detail panel.

Right: placeholder only, detail panel comes next cycle.

Date windows compute against COURSE_NOW, injected in the frontend environment.

Match the visual style of the other pages.
"""




















# 3

"""
Add a route: GET /api/objects/:type/:id/audit. Return entries from the `audit_log` meta table for that object, newest-first. Return the action name, the actor, params, result, and timestamp.

Then build the detail panel for the selected batch. Fetch the batch (with resolved links), the tank's maintenance logs via the list route, and audit entries in parallel. Collapsible sections:

- Batch: sugar level, temperature, days fermenting, planned start, last operator note.
- Recipe: name, fermentation days, sensitivity notes. Highlight the target sugar curve value at the batch's current day.
- Tank + Maintenance: tank name and status, maintenance history. Flag any maintenance that falls within the batch's fermentation window with a Warning tag.
- Quality Tests: from the batch's inbound links. Show pH, sugar level, lab notes, tester, date.
- Audit: expandable rows: action, actor, params, timestamp.
"""