import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// COURSE_NOW lives in the repo-root .env — the same anchor the ontology
// server's clock uses. Surface it to the frontend so date windows compute
// against the course's narrative "now" rather than the real wall clock.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  return {
    plugins: [react()],
    define: {
      "import.meta.env.COURSE_NOW": JSON.stringify(env.COURSE_NOW ?? ""),
    },
    server: {
      proxy: {
        "/api": "http://localhost:3456",
      },
    },
  };
});
