interface ImportMetaEnv {
  /** Built by scripts/build.ts (vite.config.ts `define`). */
  readonly PLAYER_BUILD: boolean;
}

declare module 'virtual:edits' {
  const edits: Record<string, import('./engine/edit').Edit>;
  export default edits;
}
