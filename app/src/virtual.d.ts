interface ImportMetaEnv {
  /** The soundtrack's file type: mp3 in a built player, wav on the dev server (vite.config.ts `define`). */
  readonly PLAYER_AUDIO: 'mp3' | 'wav';
}

declare module 'virtual:edits' {
  const edits: Record<string, import('./engine/edit').Edit>;
  export default edits;
}
