/// <reference types="vite/client" />

/**
 * Build-time env exposed to the bundle. Only VITE_-prefixed variables reach
 * the browser — never secrets. `VITE_API_URL` sets the API origin for
 * split-origin deployments (Render + Vercel); unset = same-origin `/api/v1`.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
