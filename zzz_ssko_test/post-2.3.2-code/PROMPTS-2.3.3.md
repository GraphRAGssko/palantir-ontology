# 1

"""
Create an apps/data-platform workspace. package.json with `type: module`, tsconfig.json extending the base and adding JSX + DOM libs. Install @blueprintjs/core, @blueprintjs/icons, react@18, react-dom@18, @types/react@18, @types/react-dom@18, @vitejs/plugin-react, vite. Scaffold the Vite entry point — index.html, vite.config.ts, main.tsx, App.tsx with a minimal React shell. Add a dev script.
"""


























# 2

"""
Build an Ontology Manager page. We want it to look visually like the attached screenshots. Use Blueprintjs components and CSS to accomplish this. In case the screenshots show something we lack data for, omit it.

Make `display_name` and `description` inline-editable (add a `PATCH /api/objects/meta/types/:type` route to update the `object_type` row).

For the links section, use a more straightforward approach to replace the interactive graph.

Add an extra left rail that lists all object types, showing display name and instance count. Clicking selects a type.
"""
























# 3

"""
Build an Object Explorer with two sub-views. We want it to look visually like the three attached screenshots. Use Blueprintjs components and CSS to accomplish this. Note that all of them are a little different in layout. In our case, you need to make a single one that is sensible for any object type.

Left rail: same type list as the OM, but clicking navigates to the instance list for that type.

Instance list: fetch from `GET /api/objects/:type`. Render a table. Main column: find the property where `is_title` is true in the type metadata and use that value. Show `status` as a secondary column. Clicking a row navigates to the object detail view.

Object detail: fetch from `GET /api/objects/:type/:id` (returns properties + resolved links). Action strip across the top: a button per action from the type's action list (display name as label, description as tooltip). Don't wire up the click handlers yet, just render the buttons. Two-column layout below:

- Left, Properties: list each property with its display name from metadata. Format values by `data_type`.
- Right, Links: show resolved linked objects grouped by link name. Clicking navigates to that object's detail. Maintain a navigation stack so back works.

Also add a thin left sidebar so we can switch between our apps, each with a different icon. Our first
Ontology Manager gets a Cube icon. Use a search-template icon for this Object Explorer app.
"""
























# 4

"""
Wire up the action buttons in the Object Explorer detail view. When an action button is clicked, open a Blueprint dialog. Read the action's `parameter_schema` (JSON Schema) and dynamically generate form fields:

- `datetime` -> `DateInput`
- `string` -> `InputGroup`
- `enum` -> `HTMLSelect`
- `number` -> `NumericInput`

Required fields are marked. Submit sends a POST to `/api/objects/:type/:id/actions/:actionName` with the form values. Show the result and refresh the detail view. Make sure the request body format matches the one expected by the action handler's logic.
"""





























# 5

"""
Add a search bar above the instance list in the Object Explorer. When the user types a query:

1. Filter instances of the selected type by checking if any property value contains the search string.
2. Read property metadata to know which properties to search (skip booleans).
3. Filter the instance list in real-time.
4. Optional toggle: "search all types" — search across all object types, show results grouped by type.
"""