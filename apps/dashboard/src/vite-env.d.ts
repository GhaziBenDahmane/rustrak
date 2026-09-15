/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * A base URL for the API, for a bundle hosted away from its server.
   *
   * An escape hatch and nothing more: unset, the client talks to
   * `window.location.origin`, which is the whole design. See `shared/api/rustrak.ts`.
   */
  readonly VITE_RUSTRAK_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
