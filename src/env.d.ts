/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MANUS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
