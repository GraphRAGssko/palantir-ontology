/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Course narrative "now", injected from the repo-root .env (COURSE_NOW). */
  readonly COURSE_NOW: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
