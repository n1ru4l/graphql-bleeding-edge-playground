/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL: string;
  readonly VITE_GRAPHQL_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
