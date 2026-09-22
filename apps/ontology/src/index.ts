import "./course-clock.ts";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import meta from "./routes/meta.ts";
import objects from "./routes/objects.ts";
import actions from "./routes/actions.ts";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/objects/meta", meta);
app.route("/api/objects", actions);
app.route("/api/objects", objects);

const port = Number(process.env["PORT"] ?? 3456);
serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, (info) => {
  console.log(`Listening on http://0.0.0.0:${info.port}`);
});

export default app;
